/**
 * Foreground time for one exercise. No time is inferred from a saved timestamp.
 * Use a date/task/block-specific storageKey and an isActive predicate that checks
 * ownership of the current modal plus whether the exercise has been submitted.
 * Stop the old clock before replacing its UI to capture the exact final fraction.
 * Reopening creates a new clock with the same key and resumes its saved seconds.
 *
 * Optional dependencies: {document, window, storage, now, setInterval,
 * clearInterval, MutationObserver}. now returns monotonic milliseconds.
 * initialSeconds seeds a new clock only when there is no valid saved value.
 */
export function createStudyClock({storageKey,isActive=()=>true,onTick=()=>{},initialSeconds=0,dependencies={}}={}){
  if(typeof storageKey!=='string'||!storageKey.trim())throw new TypeError('study clock requires a storageKey');
  const doc=dependencies.document??globalThis.document;
  const win=dependencies.window??globalThis.window;
  let storage=dependencies.storage;
  if(storage===undefined){try{storage=win?.localStorage??globalThis.localStorage;}catch{storage=null;}}
  const now=dependencies.now??(()=>globalThis.performance.now());
  const schedule=dependencies.setInterval??globalThis.setInterval.bind(globalThis);
  const cancel=dependencies.clearInterval??globalThis.clearInterval.bind(globalThis);
  const Observer=Object.hasOwn(dependencies,'MutationObserver')?dependencies.MutationObserver:globalThis.MutationObserver;
  let total=Number.isFinite(initialSeconds)&&initialSeconds>=0?initialSeconds:0;
  try{const value=JSON.parse(storage?.getItem(storageKey)??'null');if(typeof value==='number'&&Number.isFinite(value)&&value>=0)total=value;}catch{}
  let stopped=false,nativeHidden=false,pageHidden=false,timer=null,observer=null,last=now(),running=false,lastSaved=null;
  const listeners=[];
  const owned=()=>{try{return isActive()===true;}catch{return false;}};
  const visible=()=>!doc?.hidden&&!nativeHidden&&!pageHidden;
  function save(){
    if(total===lastSaved)return;
    try{storage?.setItem(storageKey,JSON.stringify(total));lastSaved=total;}catch{}
  }
  function notify(){onTick(total);}
  function dispose(){
    stopped=true;running=false;
    if(timer!==null){cancel(timer);timer=null;}
    observer?.disconnect();observer=null;
    for(const remove of listeners.splice(0))remove();
  }
  function advance(boundary=false){
    if(stopped)return;
    const stamp=now(),active=owned();
    // If ownership vanished without a lifecycle event, discard the unobserved
    // fraction rather than crediting another popup or an already-submitted form.
    if(running&&active&&(boundary||visible())&&Number.isFinite(stamp)&&Number.isFinite(last))total+=Math.max(0,stamp-last)/1000;
    if(Number.isFinite(stamp))last=stamp;
    if(!active)dispose();
    running=!stopped&&active&&visible();
  }
  function tick(){advance();save();notify();}
  function transition(change){
    if(stopped)return;
    advance(true);change();running=!stopped&&owned()&&visible();save();notify();
  }
  function listen(target,type,handler){
    target?.addEventListener?.(type,handler);
    listeners.push(()=>target?.removeEventListener?.(type,handler));
  }
  listen(doc,'visibilitychange',()=>transition(()=>{}));
  listen(win,'eju-window-hidden',()=>transition(()=>{nativeHidden=true;}));
  listen(win,'eju-window-visible',()=>transition(()=>{nativeHidden=false;}));
  listen(win,'pagehide',()=>transition(()=>{pageHidden=true;}));
  listen(win,'pageshow',()=>transition(()=>{pageHidden=false;}));
  if(Observer&&doc?.documentElement){
    observer=new Observer(()=>{if(!stopped&&!owned()){advance();save();notify();}});
    observer.observe(doc.documentElement,{childList:true,subtree:true,attributes:true});
  }
  running=owned()&&visible();
  if(!owned())dispose();
  else timer=schedule(tick,250);
  save();notify();
  return {
    seconds(){advance();save();return total;},
    stop(){if(stopped)return total;advance();dispose();save();notify();return total;},
    // Reset never revives a stopped clock or erases its owner's submitted record.
    reset(){total=0;last=now();running=!stopped&&owned()&&visible();save();notify();return total;}
  };
}
