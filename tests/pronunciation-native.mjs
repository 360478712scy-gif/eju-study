import {spawn} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initialState} from '../engine.mjs';

// Installed AppKit/WKWebView, actual muted HTMLAudio, real bundled AAC decoder.
// A test-only root-response injection disables BGM before app startup in an ephemeral WK store.
// This is player/decoder acceptance, not whole-study-UI or human listening QA.
const root=path.resolve(import.meta.dirname,'..'),port=18779,backendPort=18780,base=`http://127.0.0.1:${port}`,backend=`http://127.0.0.1:${backendPort}`,qaURL=base+'/';
const binary='~/Applications/澄学 EJU.app/Contents/MacOS/Chengxue';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'eju-pronunciation-native-')),data=path.join(temp,'data');
const evidence=path.join(root,'tests/pronunciation-audit-20261006/native');fs.mkdirSync(evidence,{recursive:true});fs.mkdirSync(data,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/assets/pronunciation/manifest.json'),'utf8'));
const targets=['提出','反射','補助金','対処','接触','必修'].map(word=>{const v=Object.values(manifest.vocabularyByQuestionId).find(v=>v.word===word);return {label:word,kind:'word',id:v.questionId,assetId:v.wordAssetId,url:v.wordAudio};});
const term=manifest.termsByJapanese['ローレンツ力'];targets.push({label:'ローレンツ力',kind:'term',id:'ローレンツ力',assetId:term.wordAssetId,url:term.wordAudio});
const example=manifest.vocabularyByQuestionId.vx007;targets.push({label:'vx007 十分钟例句',kind:'example',id:'vx007',assetId:example.exampleAssetId,url:example.exampleAudio});
const old=JSON.parse(fs.readFileSync(path.join(root,'tests/pronunciation-audit-20261006/manifest-audited.json'),'utf8'));
for(const t of targets){const oldId=t.kind==='term'?old.termsByJapanese[t.id].wordAssetId:t.kind==='example'?old.vocabularyByQuestionId[t.id].exampleAssetId:old.vocabularyByQuestionId[t.id].wordAssetId;assert.notEqual(t.assetId,oldId,'target must point to changed asset '+t.label);}
const pending=new Map(),events=[],serverLogs=[];let app,server,proxy,sequence=0,buffer='',exited=false,result;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function request(command,args={}){const id=String(++sequence);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Native command timeout: '+command));},15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});app.stdin.write(JSON.stringify({id,command,...args})+'\n');});}
const js=script=>exited?Promise.reject(Error('Native process exited')):request('eval',{script});
async function until(probe,label,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){try{if(await probe())return;}catch{}await sleep(100);}throw Error('Not ready: '+label);}
const stateFile=path.join(data,'state.json');fs.writeFileSync(stateFile,JSON.stringify(initialState(),null,2));const initialHash=sha(stateFile);let runtimeHash;
try{
 assert.ok(fs.existsSync(binary),'Installed native binary required');assert.notEqual(port,18763);
 let occupied=false;try{await fetch(base+'/api/health',{signal:AbortSignal.timeout(250)});occupied=true;}catch{}assert.equal(occupied,false,'Port 18779 must be free');
 let backendOccupied=false;try{await fetch(backend+'/api/health',{signal:AbortSignal.timeout(250)});backendOccupied=true;}catch{}assert.equal(backendOccupied,false,'Port 18780 must be free');
 server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(backendPort),EJU_DATA_DIR:data,EJU_CODEX_PATH:path.join(temp,'disabled-cli')},stdio:'pipe'});server.stdout.on('data',b=>serverLogs.push(b.toString()));server.stderr.on('data',b=>serverLogs.push(b.toString()));
 await until(async()=>(await fetch(backend+'/api/health')).ok,'isolated server');
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8').replace('<head>','<head><script>localStorage.setItem("eju-music-enabled","false");localStorage.setItem("eju-volume","0");const qaMediaPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){this.muted=true;this.volume=0;return qaMediaPlay.call(this);};</script>');
 proxy=http.createServer((req,res)=>{if(req.url==='/'||req.url.startsWith('/?')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);}const upstream=http.request({hostname:'127.0.0.1',port:backendPort,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${backendPort}`}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});upstream.on('error',error=>{res.writeHead(502);res.end(String(error));});req.pipe(upstream);});await new Promise(resolve=>proxy.listen(port,'127.0.0.1',resolve));assert.equal((await fetch(base+'/api/health')).status,200,'proxy must preserve backend host allowlist');assert.equal((await fetch(base+'/pronunciation.js')).status,200,'product audio module must traverse proxy');
 app=spawn(binary,['--qa','--qa-url',qaURL],{cwd:root,stdio:['pipe','pipe','pipe']});
 app.stdout.on('data',chunk=>{buffer+=chunk.toString();let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.startsWith('EJU_QA '))continue;const reply=JSON.parse(line.slice(7));if(reply.event){events.push(reply);continue;}const entry=pending.get(String(reply.id));if(entry){pending.delete(String(reply.id));reply.ok?entry.resolve(reply.value):entry.reject(Error(reply.error));}}});
 app.stderr.on('data',b=>fs.appendFileSync(path.join(evidence,'native-stderr.log'),b));app.on('exit',(code,signal)=>{exited=true;events.push({event:'exit',code,signal});for(const entry of pending.values())entry.reject(Error('Native process exited'));pending.clear();});
 await until(()=>js(`location.href===${JSON.stringify(qaURL)}&&document.readyState==='complete'&&!!document.querySelector('.nav')`),'native application root document',25000);await request('show');
 const status=await request('status');assert.equal(status.persistent,false);assert.equal(status.url,qaURL);assert.equal(status.autoplayRequiresGesture,false);runtimeHash=sha(stateFile);assert.equal(await js("localStorage.getItem('eju-music-enabled')"),'false');
 const script=`window._pronunciationNative={status:'running'};
 (async()=>{
  const rows=[],notifications=[],playbacks=[],errors=[],requests=[],NativeAudio=window.Audio;
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  addEventListener('error',event=>errors.push(event.message));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
  addEventListener('eju-pronunciation-state',event=>notifications.push({...event.detail,at:performance.now()}));
  class TrackedAudio{constructor(url){const audio=new NativeAudio(url);audio.muted=true;audio.volume=0;const trace={requestedURL:url,mediaEvents:[]};for(const name of ['loadstart','loadedmetadata','canplay','playing','pause','ended','error','timeupdate'])audio.addEventListener(name,()=>trace.mediaEvents.push({name,time:audio.currentTime,duration:Number.isFinite(audio.duration)?audio.duration:null,error:audio.error?.code||null}));playbacks.push({audio,trace});return audio;}}
  const {createPronunciationPlayer}=await import('/pronunciation.js');
  const fetcher=async(url,options)=>{const parsed=new URL(url,location.href);check(parsed.origin===location.origin,'unexpected remote request');requests.push(parsed.href);return fetch(url,options);};
  const player=createPronunciationPlayer({AudioClass:TrackedAudio,fetcher});
  const targets=${JSON.stringify(targets)};
  const play=(target,rate)=>target.kind==='term'?player.playTerm(target.id,{rate}):target.kind==='example'?player.playExample(target.id,{rate}):player.playWord(target.id,{rate});
  for(const target of targets)for(const rate of [.8,1,1.2]){
   const started=await play(target,rate);check(started,'play did not start '+target.label);
   const {audio,trace}=playbacks.at(-1);for(let wait=0;wait<200&&audio.currentTime<=0&&!audio.ended&&!audio.error;wait++)await delay(10);window._pronunciationNative.lastMedia={target,rate,time:audio.currentTime,duration:audio.duration,paused:audio.paused,ended:audio.ended,readyState:audio.readyState,trace};
   check(audio.muted&&audio.volume===0,'QA must remain silent');check(audio.duration>0&&Number.isFinite(audio.duration),'decoder has no duration');
   check(audio.currentTime>0,'media time did not advance '+JSON.stringify(window._pronunciationNative.lastMedia));check(trace.mediaEvents.some(e=>e.name==='playing'),'missing real playing event');check(!audio.error,'decoder reported error');
   check(new URL(audio.currentSrc).origin===location.origin&&new URL(audio.currentSrc).pathname===target.url,'wrong or remote asset');check(audio.playbackRate===rate,'playback rate mismatch');
   const observed={target,rate,duration:audio.duration,currentTime:audio.currentTime,currentSrc:audio.currentSrc,muted:audio.muted,preservesPitch:audio.preservesPitch,mediaEvents:trace.mediaEvents};
   player.stop();await delay(30);check(!player.isPlaying()&&audio.paused,'stop did not release player');check(audio.currentTime<.01,'stop did not reset position');check(notifications.at(-1).playing===false&&notifications.at(-1).reason==='stopped','missing stop lifecycle event');
   rows.push({...observed,stopped:true,resetTime:audio.currentTime});window._pronunciationNative.progress=rows.length;
  }
  const ended=[];
  for(const target of [targets[0],targets.at(-1)]){
   check(await play(target,1.2),'natural-end playback failed');const {audio,trace}=playbacks.at(-1);
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('no natural ended event')),15000);audio.addEventListener('ended',()=>{clearTimeout(timer);resolve();},{once:true});});
   await delay(30);check(!player.isPlaying()&&audio.paused,'natural end did not release player');check(notifications.at(-1).reason==='ended'&&notifications.at(-1).playing===false,'missing natural ended lifecycle');ended.push({target,mediaEvents:trace.mediaEvents,released:true});
  }
  check(errors.length===0,'page errors '+errors.join(';'));check(notifications.filter(n=>n.playing).length===26,'unexpected playback lifecycle count');
  window._pronunciationNative={status:'complete',ok:true,rows,ended,notifications,requests,errors,allAudioMuted:true,realHTMLAudio:true,humanListening:false};
 })().catch(error=>{window._pronunciationNative={...window._pronunciationNative,status:'failed',ok:false,error:String(error)+'\\n'+String(error.stack||'')};});true`;
 assert.equal(await js(script),true,'launch asynchronous test without returning a Promise');
 await until(()=>js(`['complete','failed'].includes(window._pronunciationNative?.status)`),'26 native playback lifecycles',90000);
 const playback=await js('window._pronunciationNative');assert.equal(playback.ok,true,playback.error);assert.equal(playback.rows.length,24);assert.equal(playback.ended.length,2);assert.deepEqual(playback.errors,[]);assert.equal(sha(stateFile),runtimeHash,'isolated learning state must remain unmodified');
 result={ok:true,at:new Date().toISOString(),scope:'Installed WKWebView pronunciation module, muted real AAC decoder and playback lifecycle; full application root with test-only BGM disabling injection; not whole study-flow or human listening',binary,nativeStatus:status,base,isolatedData:data,productionDataAccess:false,liveAIDisabled:true,isolatedStateUnchanged:true,isolatedStateComparison:"Hash taken after normal first-page plan initialization; unchanged throughout pronunciation checks.",targets,playback,events};
 console.log('PASS installed WKWebView: 24 rate-specific new-asset play/stop checks and 2 natural-ended checks; all muted');
}catch(error){const diagnostics=app&&!exited?await js('({location:location.href,ready:document.readyState,text:document.body?.innerText?.slice(0,4000)})').catch(()=>null):null;result={ok:false,diagnostics,error:String(error.stack||error),base,isolatedData:data,productionDataAccess:false,events};console.error(error);process.exitCode=1;}
finally{
 if(app&&!exited){await request('quit').catch(()=>{});app.stdin.end();await until(()=>Promise.resolve(exited),'QA app quit',5000).catch(()=>{app.kill('SIGTERM');});}
 if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}
 if(proxy)await new Promise(resolve=>proxy.close(resolve));
 fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({...result,qaProcessClosed:exited,serverProcessClosed:server?.exitCode!==null||server?.signalCode!==null,proxyClosed:!proxy?.listening,events},null,2));fs.writeFileSync(path.join(evidence,'server.log'),serverLogs.join(''));console.log('ARTIFACTS',evidence);
}
