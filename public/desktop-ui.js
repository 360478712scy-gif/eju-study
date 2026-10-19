/** Window-local desktop controls. No global keyboard hooks or clipboard polling. */
export const DESKTOP_PAGES=Object.freeze({today:'今日学习',learning:'课前复习',notebook:'我的笔记',report:'每日复盘'});
const EDITABLE_TYPES=new Set(['text','search','email','url','tel','password','number']);
export function isTextEditor(node){
  if(!node||node.disabled)return false;
  if(node.isContentEditable)return true;
  const tag=node.tagName?.toLowerCase();
  return tag==='textarea'||(tag==='input'&&EDITABLE_TYPES.has((node.type||'text').toLowerCase()));
}
export function getDesktopShortcut(event,{isMac=true,standalone=false,editable=false}={}){
  if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.key==='Process'||event.altKey)return null;
  const key=String(event.key||'').toLowerCase(),primary=isMac?event.metaKey:event.ctrlKey;
  if(standalone&&key==='backspace'&&!editable&&!event.metaKey&&!event.ctrlKey)return {action:'blocked'};
  if(!primary||(isMac&&event.ctrlKey)||(!isMac&&event.metaKey))return null;
  // Native text editing and Japanese IME commands stay with the text control.
  if(['c','v','x','a','z'].includes(key))return null;
  let command=null;
  if(!event.shiftKey&&['1','2','3','4'].includes(key))command={action:'navigate',page:Object.keys(DESKTOP_PAGES)[Number(key)-1]};
  else if(event.shiftKey&&key==='m')command={action:'toggle-music'};
  else if(event.shiftKey&&key==='f')command={action:'toggle-focus'};
  else if((key==='/'||event.code==='Slash')&&!event.shiftKey)command={action:'shortcuts'};
  if(command)return event.repeat?{action:'blocked'}:command;
  if(standalone&&(['r','l','t','n','p','f','[',']','+','=','-','0'].includes(key)||['BracketLeft','BracketRight','Equal','Minus'].includes(event.code)))return {action:'blocked'};
  return null;
}

/**
 * Hooks are called only after a user gesture/native menu command.
 * canNavigate({page,source,target}) may be async; return true only after drafts are safe.
 * Without it, focused text editors and edited connected fields block page changes.
 * standalone only suppresses browser chrome shortcuts in the native/PWA window.
 */
export function initDesktopUI(options={}){
  const win=options.window||window,doc=win.document;
  const native=!!win.webkit?.messageHandlers?.ejuNative;
  const standalone=options.standalone??(native||!!win.matchMedia?.('(display-mode: standalone)').matches);
  const isMac=options.isMac??/Mac|iPhone|iPad/.test(win.navigator.platform||'');
  const listeners=[],dirtyFields=new Set(),pending=new Set();
  let menu=null,menuContext=null,help=null,helpFocus=null,composing=false,destroyed=false;
  const listen=(target,event,fn,config)=>{target.addEventListener(event,fn,config);listeners.push(()=>target.removeEventListener(event,fn,config));};
  const notify=message=>options.notify?.(message);
  const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
  const editableTarget=node=>node?.isContentEditable?(node.closest?.('[contenteditable]')||node):isTextEditor(node)?node:null;
  const connectedDirty=()=>{for(const node of dirtyFields)if(!node.isConnected)dirtyFields.delete(node);return dirtyFields.size>0;};
  function restoreFocus(node){if(node?.isConnected)node.focus?.({preventScroll:true});}
  function closeMenu({restore=true}={}){
    if(!menu)return false;
    const target=menuContext?.focus;menu.remove();menu=null;menuContext=null;
    if(restore)restoreFocus(target);return true;
  }
  function closeHelp(){if(!help)return false;help.remove();help=null;restoreFocus(helpFocus);helpFocus=null;return true;}
  async function canNavigate(command,source,target){
    if(options.canNavigate)return (await options.canNavigate({page:command.page,source,target}))===true;
    const editing=options.isEditing?options.isEditing():!!editableTarget(target||doc.activeElement)||connectedDirty();
    if(editing){notify('先保存或关闭正在编辑的内容，再切换页面。');return false;}
    return true;
  }
  async function dispatch(command,{source='native',target=doc.activeElement}={}){
    if(destroyed||!command||typeof command!=='object'||command.repeat||command.isComposing||composing)return false;
    const action=command.action;
    if(!['navigate','toggle-music','toggle-focus','shortcuts'].includes(action))return false;
    if(action==='navigate'&&!Object.hasOwn(DESKTOP_PAGES,command.page))return false;
    if(pending.has(action))return false;
    pending.add(action);
    try{
      if(action==='navigate'){
        if(!await canNavigate(command,source,target))return false;
        closeMenu({restore:false});closeHelp();await options.navigate?.(command.page);dirtyFields.clear();
      }else if(action==='toggle-music')await options.toggleMusic?.();
      else if(action==='toggle-focus')await options.toggleFocus?.();
      else if(options.openShortcuts)await options.openShortcuts();
      else showShortcuts();
      return true;
    }catch(error){notify(error?.message||'这次操作没有完成，请重试。');return false;}
    finally{pending.delete(action);}
  }
  function showShortcuts(){
    closeMenu();if(help){help.querySelector('button')?.focus();return;}
    helpFocus=doc.activeElement;help=doc.createElement('div');help.className='eju-shortcuts-backdrop';
    const mod=isMac?'⌘':'Ctrl';
    help.innerHTML=`<section class="eju-shortcuts" role="dialog" aria-modal="true" aria-label="键盘快捷键"><div class="eju-shortcuts-heading"><h2>键盘快捷键</h2><button type="button" data-eju-close-help aria-label="关闭快捷键帮助">×</button></div><dl>${Object.values(DESKTOP_PAGES).map((label,i)=>`<div><dt>${label}</dt><dd><kbd>${mod} ${i+1}</kbd></dd></div>`).join('')}<div><dt>播放／暂停音乐</dt><dd><kbd>${mod} ⇧ M</kbd></dd></div><div><dt>开始／暂停专注</dt><dd><kbd>${mod} ⇧ F</kbd></dd></div><div><dt>快捷键帮助</dt><dd><kbd>${mod} /</kbd></dd></div><div><dt>下一题（所有科目）</dt><dd><kbd>Enter</kbd></dd></div><div><dt>关闭菜单或弹窗</dt><dd><kbd>Esc</kbd></dd></div></dl><p>复制、粘贴、撤销和日语输入保留原有操作。</p></section>`;
    doc.body.append(help);help.querySelector('button').onclick=closeHelp;help.addEventListener('pointerdown',e=>{if(e.target===help)closeHelp();});help.querySelector('button').focus();
  }
  function snapshot(target){
    const editor=editableTarget(target),focus=editor||doc.activeElement,selection=win.getSelection?.();
    const start=editor?.selectionStart,end=editor?.selectionEnd;
    return {target:editor,focus,start,end,value:editor?.value,selectionText:typeof start==='number'&&typeof end==='number'?editor.value.slice(start,end):selection?.toString()||'',ranges:selection?Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange()):[]};
  }
  function restoreSelection(context){
    restoreFocus(context.focus);
    if(context.target&&typeof context.start==='number')context.target.setSelectionRange?.(context.start,context.end);
    else if(context.ranges.length){const selection=win.getSelection();selection.removeAllRanges();for(const range of context.ranges)if(range.commonAncestorContainer.isConnected)selection.addRange(range);}
  }
  function insertText(context,text){
    const target=context.target;if(!target?.isConnected||target.readOnly)return false;
    restoreSelection(context);
    // execCommand keeps the platform undo stack, unlike direct .value replacement.
    if(doc.execCommand?.('insertText',false,text))return true;
    if(typeof target.setRangeText==='function'&&typeof context.start==='number')target.setRangeText(text,context.start,context.end,'end');
    else if(target.isContentEditable){const selection=win.getSelection();if(!selection.rangeCount)return false;const range=selection.getRangeAt(0);range.deleteContents();const node=doc.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);}
    else return false;
    target.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));return true;
  }
  async function edit(action,context){
    closeMenu({restore:false});restoreSelection(context);
    try{
      if(options.performEdit){const handled=await options.performEdit({action,target:context.target,selection:context});if(handled!==false)return;}
      if(action==='select-all'){
        if(context.target?.select)context.target.select();
        else if(context.target?.isContentEditable){const range=doc.createRange();range.selectNodeContents(context.target);const selection=win.getSelection();selection.removeAllRanges();selection.addRange(range);}
        return;
      }
      if(action==='undo'){doc.execCommand?.('undo');return;}
      if(action==='paste'){
        let text;
        try{text=await(options.readClipboard?options.readClipboard():win.navigator.clipboard.readText());}
        catch{restoreSelection(context);if(!doc.execCommand?.('paste'))notify(`请使用${isMac?'⌘ V':'Ctrl V'}粘贴。`);return;}
        // If another edit happened while clipboard permission was pending, don't overwrite it.
        if(context.target?.value!==undefined&&context.target.value!==context.value){notify('内容已变化，请重新选择粘贴位置。');return;}
        insertText(context,String(text??''));return;
      }
      if(!context.selectionText)return;
      const write=options.writeClipboard||win.navigator.clipboard?.writeText?.bind(win.navigator.clipboard);
      let copied=false;
      if(write){try{await write(context.selectionText);copied=true;}catch{}}
      if(!copied){restoreSelection(context);copied=!!doc.execCommand?.('copy');}
      if(!copied){notify(`请使用${isMac?'⌘ C':'Ctrl C'}复制。`);return;}
      if(action==='cut'&&context.target?.isConnected&&!context.target.readOnly){
        if(context.target.value!==undefined&&context.target.value!==context.value)return;
        restoreSelection(context);if(!doc.execCommand?.('delete'))insertText(context,'');
      }
    }catch(error){notify(error?.message||'请使用系统的复制、粘贴快捷键。');}
  }
  function showMenu(event){
    if(event.defaultPrevented||composing||event.target?.closest?.('[data-native-context-menu],audio,video,select,input[type="file"]'))return;
    // Keep native secure-field editing (including password managers) intact.
    if(event.target?.closest?.('input[type="password"]'))return;
    const context=snapshot(event.target);closeMenu({restore:false});closeHelp();menuContext=context;
    event.preventDefault();menu=doc.createElement('div');menu.className='eju-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','学习操作');
    const mod=isMac?'⌘':'Ctrl',items=[];
    if(context.selectionText)items.push({label:'复制所选文字',shortcut:mod+' C',edit:'copy'});
    if(context.target){
      if(!context.target.readOnly){if(context.selectionText)items.push({label:'剪切',shortcut:mod+' X',edit:'cut'});items.push({label:'粘贴',shortcut:mod+' V',edit:'paste'},{label:'撤销',shortcut:mod+' Z',edit:'undo'});}
      items.push({label:'全选',shortcut:mod+' A',edit:'select-all'});
    }
    if(items.length)items.push({separator:true});
    Object.entries(DESKTOP_PAGES).forEach(([page,label],i)=>items.push({label,shortcut:mod+' '+(i+1),command:{action:'navigate',page}}));
    items.push({separator:true},{label:'播放／暂停音乐',shortcut:mod+' ⇧ M',command:{action:'toggle-music'}},{label:'开始／暂停专注',shortcut:mod+' ⇧ F',command:{action:'toggle-focus'}},{label:'快捷键帮助',shortcut:mod+' /',command:{action:'shortcuts'}});
    for(const item of items){
      if(item.separator){const line=doc.createElement('div');line.className='eju-menu-separator';line.setAttribute('role','separator');menu.append(line);continue;}
      const button=doc.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.tabIndex=-1;button.dataset.ejuMenuAction=item.edit||item.command.action+(item.command.page?':'+item.command.page:'');
      const label=doc.createElement('span'),shortcut=doc.createElement('kbd');label.textContent=item.label;shortcut.textContent=item.shortcut;button.append(label,shortcut);
      button.addEventListener('click',()=>{if(item.edit)void edit(item.edit,context);else{closeMenu();void dispatch(item.command,{source:'contextmenu',target:context.target||context.focus});}});menu.append(button);
    }
    doc.body.append(menu);const rect=menu.getBoundingClientRect(),width=win.innerWidth,height=win.innerHeight;
    menu.style.left=Math.max(8,Math.min(event.clientX,width-rect.width-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,height-rect.height-8))+'px';
    const first=menu.querySelector('button');first.tabIndex=0;first.focus({preventScroll:true});
  }
  function menuKeys(event){
    if(!menu)return false;
    if(event.key==='Escape'||event.key==='Tab'){consume(event);closeMenu();return true;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      consume(event);const nodes=[...menu.querySelectorAll('button:not(:disabled)')],index=nodes.indexOf(doc.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?nodes.length-1:(index+(event.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length;
      nodes.forEach((node,i)=>node.tabIndex=i===next?0:-1);nodes[next]?.focus();return true;
    }
    return false;
  }
  function keydown(event){
    if(composing||event.isComposing||event.keyCode===229){
      // Let the IME handle Escape/Tab, but do not let the app's older modal
      // listener interpret the same key as "close the unsaved exercise".
      if(event.key==='Escape'||event.key==='Tab')event.stopImmediatePropagation();
      return;
    }
    if(menuKeys(event))return;
    if(event.key==='Escape'){
      if(event.repeat){consume(event);return;}
      if(help){consume(event);closeHelp();return;}
      if(options.closeOverlay){consume(event);Promise.resolve().then(()=>options.closeOverlay()).catch(error=>notify(error?.message||'请先保存编辑内容。'));return;}
    }
    if(help&&event.key==='Tab'){consume(event);help.querySelector('button').focus();return;}
    const command=getDesktopShortcut(event,{isMac,standalone,editable:!!editableTarget(event.target)});
    if(command){consume(event);if(command.action!=='blocked')void dispatch(command,{source:'keyboard',target:event.target});}
  }
  function drag(event){
    const transfer=event.dataTransfer;if(!transfer)return;
    const types=[...(transfer.types||[])],files=types.includes('Files'),uri=types.includes('text/uri-list');
    const text=event.type==='drop'?transfer.getData('text/plain'):'';
    if(files||(!editableTarget(event.target)&&(uri||/^(?:https?:|file:|javascript:|data:)/i.test(text)||event.type==='dragover'&&types.includes('text/plain')))){
      event.preventDefault();if(event.type==='dragover')transfer.dropEffect='none';
    }
  }
  listen(doc,'keydown',keydown,true);
  listen(doc,'compositionstart',()=>composing=true,true);listen(doc,'compositionend',()=>composing=false,true);
  listen(doc,'input',event=>{if(isTextEditor(event.target))dirtyFields.add(event.target);},true);
  listen(doc,'contextmenu',showMenu);
  listen(doc,'pointerdown',event=>{if(menu&&!menu.contains(event.target))closeMenu({restore:false});},true);
  listen(win,'resize',()=>closeMenu({restore:false}));listen(win,'blur',()=>closeMenu({restore:false}));
  listen(doc,'scroll',event=>{if(menu&&!menu.contains(event.target))closeMenu({restore:false});},true);
  listen(doc,'dragover',drag,true);listen(doc,'drop',drag,true);
  listen(win,'eju-command',event=>{void dispatch(event.detail,{source:'native'});});
  return {dispatch,showShortcuts,closeMenu,clearDirty:node=>node?dirtyFields.delete(node):dirtyFields.clear(),destroy(){if(destroyed)return;destroyed=true;closeMenu({restore:false});closeHelp();listeners.forEach(remove=>remove());dirtyFields.clear();}};
}
