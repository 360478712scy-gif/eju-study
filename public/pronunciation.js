export const PRONUNCIATION_RATES=Object.freeze([0.8,1,1.2]);
export const PRONUNCIATION_SOURCE_LABEL='macOS 日语合成语音（Kyoko），非真人录音';
export const PRONUNCIATION_EVENT='eju-pronunciation-state';
export const PRONUNCIATION_MANIFEST='/assets/pronunciation/manifest.json';

/**
 * One exclusive player for bundled Japanese audio. The host listens for
 * eju-pronunciation-state to duck music/pause official listening, and calls
 * stopPronunciation() when official listening starts or a learning view closes.
 * There is deliberately no speechSynthesis or network TTS fallback.
 */
export function createPronunciationPlayer({
  AudioClass=globalThis.Audio,
  fetcher=globalThis.fetch,
  eventTarget=globalThis.window||globalThis,
  manifestUrl=PRONUNCIATION_MANIFEST
}={}){
  let manifestPromise=null,current=null,request=0,defaultRate=1;
  function checkedRate(value){
    if(!PRONUNCIATION_RATES.includes(value))throw new RangeError('读音速度只支持 0.8、1 或 1.2 倍。');
    return value;
  }
  function notify(playing,details={}){
    if(typeof eventTarget?.dispatchEvent==='function')eventTarget.dispatchEvent(new CustomEvent(PRONUNCIATION_EVENT,{detail:{playing,...details}}));
  }
  async function loadManifest(){
    if(!manifestPromise){
      manifestPromise=Promise.resolve().then(()=>fetcher(manifestUrl)).then(async response=>{
        if(!response.ok)throw new Error('离线读音资料未能加载，请刷新后重试。');
        const manifest=await response.json();
        if(!manifest.vocabularyByQuestionId||!manifest.termsByJapanese||!manifest.termsByReading)throw new Error('离线读音索引不完整。');
        return manifest;
      }).catch(error=>{manifestPromise=null;throw error;});
    }
    return manifestPromise;
  }
  function finish(reason='stopped',error){
    if(!current)return;
    const previous=current;current=null;
    previous.audio.removeEventListener('ended',previous.onEnded);
    previous.audio.removeEventListener('error',previous.onError);
    previous.audio.pause();
    try{previous.audio.currentTime=0;}catch{/* Media may not yet have loaded. */}
    notify(false,{kind:previous.kind,id:previous.id,rate:previous.audio.playbackRate,reason,...(error?{error:String(error.message||error)}:{})});
  }
  function stop(){request++;finish('stopped');}
  function setRate(value){
    defaultRate=checkedRate(value);
    if(current)current.audio.playbackRate=defaultRate;
    return defaultRate;
  }
  async function play(kind,id,{rate:requestedRate}={}){
    if(requestedRate!==undefined)checkedRate(requestedRate);
    stop();const token=request;
    const manifest=await loadManifest();
    if(token!==request)return false;
    const rate=requestedRate??defaultRate;
    const entry=kind==='term'?(manifest.termsByJapanese[id]||manifest.termsByReading[id]):manifest.vocabularyByQuestionId[id];
    const url=kind==='example'?entry?.exampleAudio:entry?.wordAudio;
    if(!url||!/^\/assets\/pronunciation\/[a-f0-9]+\.m4a$/.test(url))throw new Error('这个词项暂未提供离线读音。');
    if(typeof AudioClass!=='function')throw new Error('当前环境不能播放音频。');
    const audio=new AudioClass(url);
    audio.preload='auto';audio.playbackRate=rate;audio.preservesPitch=true;
    if('webkitPreservesPitch' in audio)audio.webkitPreservesPitch=true;
    const active={audio,kind,id,token};
    active.onEnded=()=>{if(current===active)finish('ended');};
    active.onError=()=>{if(current===active)finish('error',new Error('离线读音文件播放失败。'));};
    audio.addEventListener('ended',active.onEnded);
    audio.addEventListener('error',active.onError);
    current=active;
    // Broadcast before play so the host can pause an exam recording first.
    notify(true,{kind,id,rate,source:'offline-japanese-synthesis'});
    if(token!==request||current!==active)return false;
    try{
      await audio.play();
      return token===request&&current===active;
    }catch(error){
      if(token!==request)return false;
      if(current===active)finish('error',error);
      throw new Error('读音未能播放，请点击喇叭重试。',{cause:error});
    }
  }
  return {
    loadManifest,
    playWord:(questionId,options)=>play('word',questionId,options),
    playExample:(questionId,options)=>play('example',questionId,options),
    playTerm:(japaneseOrReading,options)=>play('term',japaneseOrReading,options),
    stop,setRate,
    getRate:()=>defaultRate,
    isPlaying:()=>!!current
  };
}

const player=createPronunciationPlayer();
export const loadPronunciationManifest=()=>player.loadManifest();
export const playWord=(questionId,options)=>player.playWord(questionId,options);
export const playExample=(questionId,options)=>player.playExample(questionId,options);
export const playTerm=(japaneseOrReading,options)=>player.playTerm(japaneseOrReading,options);
export const stopPronunciation=()=>player.stop();
export const setPronunciationRate=value=>player.setRate(value);
export const getPronunciationRate=()=>player.getRate();
