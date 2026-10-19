import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'..'),port=18773,base=`http://127.0.0.1:${port}`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eju-native-'));
const binary='~/Desktop/澄学 EJU.app/Contents/MacOS/Chengxue';
let server,app,sequence=0,buffer='',exited=false;const pending=new Map(),passed=[],events=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=label=>{passed.push(label);console.log('PASS',label);};
function request(command,args={}){
 const id=String(++sequence);return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Native QA timeout: ${command}`));},15000);
  pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
  app.stdin.write(JSON.stringify({id,command,...args})+'\n');
 });
}
const js=script=>exited?Promise.reject(new Error('Native process exited')):request('eval',{script});
const asyncJS=script=>request('evalAsync',{script});
async function until(probe,label,timeout=12000){const start=Date.now();while(Date.now()-start<timeout){try{if(await probe())return;}catch{}await sleep(100);}throw new Error('Not ready: '+label);}
const click=selector=>js(`document.querySelector(${JSON.stringify(selector)}).click();true`);
const active=page=>js(`!!document.querySelector('.nav [data-page="${page}"].active')`);
async function key(char,code,modifiers=['command']){await request('key',{characters:char,keyCode:code,modifiers});await sleep(120);}
async function nav(page){if(['today','learning','notebook','report'].includes(page))await request('menu',{action:'navigate',page});else await click(`.nav [data-page="${page}"]`);await until(()=>active(page),page);}
async function fill(selector,value){await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);}

try{
 let occupied=false;try{await fetch(base+'/api/health',{signal:AbortSignal.timeout(250)});occupied=true;}catch{}assert.equal(occupied,false,'QA port must be free');
 server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),EJU_DATA_DIR:path.join(dir,'data')},stdio:'ignore'});
 await until(async()=>(await fetch(base+'/api/health')).ok,'isolated server');
 app=spawn(binary,['--qa','--qa-url',base],{cwd:root,stdio:['pipe','pipe','pipe']});
 app.stdout.on('data',chunk=>{buffer+=chunk.toString();let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line.startsWith('EJU_QA '))continue;const r=JSON.parse(line.slice(7));if(r.event){events.push(r);continue;}const p=pending.get(String(r.id));if(p){pending.delete(String(r.id));r.ok?p.resolve(r.value):p.reject(new Error(r.error));}}});
 app.stderr.on('data',chunk=>fs.appendFileSync(path.join(dir,'native-stderr.log'),chunk));
 app.on('exit',(code,signal)=>{console.log('NATIVE_EXIT',code,signal);exited=true;for(const p of pending.values())p.reject(new Error('Native process exited'));pending.clear();});
 await until(()=>js(`!!document.querySelector('.nav')&&!!window.ejuNative`),'native page',25000);
 await js(`window._qaErrors=[];addEventListener('error',e=>window._qaErrors.push(e.message));addEventListener('unhandledrejection',e=>window._qaErrors.push(String(e.reason)));true`);
 const status=await request('status');assert.equal(status.visible,true);assert.equal(status.persistent,false);assert.equal(status.autoplayRequiresGesture,false);assert.equal(status.backForwardGestures,false);assert.equal(status.windowCount,1);
 await until(()=>js(`!document.querySelector('#bgm').paused&&document.querySelector('#bgm').currentTime>0`),'native BGM autoplay');
 pass('real AppKit/WKWebView window renders with automatic BGM and isolated storage');
 await key('4',21);await until(()=>active('report'),'Cmd4 report');
 const draft='原生窗口复盘草稿：先回忆，再检验。';await fill('#reflection',draft);
 await key('m',46,['command','shift']);assert.equal(await js(`document.querySelector('#bgm').paused`),true);assert.equal(await js(`document.querySelector('#reflection').value`),draft);
 await key('m',46,['command','shift']);await until(()=>js(`!document.querySelector('#bgm').paused`),'native music resume');
 await key('1',18);assert.equal(await active('today'),true);await key('2',19);assert.equal(await active('learning'),true);await key('3',20);assert.equal(await active('notebook'),true);await key('4',21);assert.equal(await js(`document.querySelector('#reflection').value`),draft);
 const before=await request('status');for(const [c,k,mods] of [['r',15],['l',37],['t',17],['n',45],['p',35],['f',3],['[',33],[']',30],['+',24],['0',29],['\uf708',96,[]]])await key(c,k,mods||['command']);
 const after=await request('status');assert.equal(after.url,before.url);assert.ok(after.blockedCount-before.blockedCount>=11);assert.equal(await js(`document.querySelector('#reflection').value`),draft);
 pass('native menu shortcuts navigate and preserve drafts; eleven web navigation/print/zoom keys are blocked');
 await key('f',3,['command','shift']);await until(async()=>(await fetch(base+'/api/state').then(r=>r.json())).timer?.running===true,'native focus start');await key('f',3,['command','shift']);await until(async()=>(await fetch(base+'/api/state').then(r=>r.json())).timer?.running===false,'native focus pause');assert.equal(await js(`document.querySelector('#reflection').value`),draft);pass('native focus shortcut starts and pauses the actual timer without losing the report');
 await request('clipboard-preserve');await js(`document.querySelector('#reflection').focus();document.querySelector('#reflection').select();true`);await request('edit',{action:'copy:'});
 assert.equal(await asyncJS(`return (await window.ejuNative.readClipboard())===${JSON.stringify(draft)};`),true);
 await asyncJS(`await window.ejuNative.writeClipboard('原生粘贴测试');return true;`);await request('edit',{action:'paste:'});await until(()=>js(`document.querySelector('#reflection').value==='原生粘贴测试'`),'native paste');
 await request('edit',{action:'undo:'});await until(()=>js(`document.querySelector('#reflection').value===${JSON.stringify(draft)}`),'native undo');
 await js(`document.querySelector('#reflection').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:500,clientY:400}));true`);
 assert.equal(await js(`!!document.querySelector('[role="menu"]')`),true);await key('\u001b',53,[]);assert.equal(await js(`!!document.querySelector('[role="menu"]')`),false);
 await key('/',44);assert.equal(await js(`!!document.querySelector('.eju-shortcuts')`),true);await key('\u001b',53,[]);assert.equal(await js(`!!document.querySelector('.eju-shortcuts')`),false);
 await request('clipboard-restore');pass('system copy, paste, undo, custom right-click menu and native shortcut help work');
 const questions=await fetch(base+'/api/questions').then(r=>r.json()),vocab=questions.find(q=>q.id==='vx001');assert.ok(vocab);
 await nav('practice');await fill('#search',vocab.title||vocab.prompt);await click(`[data-question="${vocab.id}"]`);
 await js(`window._qaPron=[];addEventListener('eju-pronunciation-state',e=>window._qaPron.push(e.detail));true`);
 await click(`[data-pron-word="${vocab.id}"]`);await until(()=>js(`window._qaPron.some(x=>x.playing)&&document.querySelector('#used-help').checked`),'native word audio');
 await until(()=>js(`document.querySelector('#bgm').volume>0&&window._qaPron.some(x=>!x.playing&&x.reason==='ended')`),'word audio ended');
 await click(`[data-option="${vocab.answer}"]`);await click('#submit-answer');await until(()=>js(`!!document.querySelector('[data-pron-example]')`),'vocab answer');
 await click('[data-pron-example]');await until(()=>js(`document.querySelector('#bgm').volume===0`),'example ducks BGM');
 await request('snapshot',{path:path.join(dir,'native-vocabulary.png')});await click('#close-modal');assert.ok(await js(`document.querySelector('#bgm').volume>0`));
 await nav('learning');await click('[data-learn-card]');await fill('#learning-recall','回忆后检查');await click('#learning-recall-form .btn');await click('[data-pron-term]');await until(()=>js(`document.querySelector('#bgm').volume===0`),'term pronunciation');await click('#close-modal');
 pass('offline vocabulary, example and terminology AAC audio play in WebKit and duck BGM correctly');
 const listening=questions.find(q=>q.official&&q.audio);assert.ok(listening);await nav('practice');await fill('#search',listening.title);await click(`[data-question="${listening.id}"]`);await asyncJS(`await document.querySelector('#question-audio').play();return true;`);await until(()=>js(`document.querySelector('#question-audio').currentTime>0&&document.querySelector('#bgm').volume===0`),'official listening playback');await click('#close-modal');assert.ok(await js(`document.querySelector('#bgm').volume>0`));
 const official=questions.find(q=>q.subject==='physics'&&q.official&&q.images?.length);await fill('#search',official.title);await click(`[data-question="${official.id}"]`);await fill('#question-note','原生窗口看原题放大时保存的疑问');await click('a .question-img');await click('[data-image-plus]');assert.equal(await js(`document.querySelector('[data-image-percent]').textContent`),'125%');await key('\u001b',53,[]);assert.equal(await js(`document.querySelector('#question-note').value`),'原生窗口看原题放大时保存的疑问');await key('3',20);assert.equal(await js(`!!document.querySelector('.modal')`),true);await click('#close-modal');pass('official listening plays and source images zoom inside the native window without replacing the exercise');

 await nav('settings');const savePath=path.join(dir,'native-backup.json');await request('save-panel-prepare',{path:savePath});await click('#export-backup');await until(async()=>(await request('status')).savePanel,'native save panel');
 await request('save-panel',{path:savePath});await until(()=>fs.existsSync(savePath),'saved backup',15000);
 const backup=JSON.parse(fs.readFileSync(savePath,'utf8'));assert.ok(backup.state||backup.attempts||backup.version);assert.equal((await request('status')).url,base+'/');
 await click('#export-backup');await until(async()=>(await request('status')).savePanel,'second save panel');await request('save-panel',{cancel:true});await until(async()=>!(await request('status')).savePanel,'cancelled panel');
 pass('backup opens a real macOS save sheet, writes parseable JSON through its completion and cancels without navigation');
 await key('w',13);await until(async()=>!(await request('status')).visible,'CmdW hides window');assert.equal(await js(`document.querySelector('#bgm').paused`),true);
 await request('show');await until(()=>js(`!document.querySelector('#bgm').paused`),'window reopen resumes music');assert.equal((await request('status')).windowNumber,status.windowNumber);
 for(let i=0;i<3;i++){await request('hide');await request('show');}await until(()=>js(`!document.querySelector('#bgm').paused`),'rapid hide reopen');
 await request('menu',{action:'toggle-music'});assert.equal(await js(`document.querySelector('#bgm').paused`),true);await request('hide');await request('show');await sleep(500);assert.equal(await js(`document.querySelector('#bgm').paused`),true);
 await request('menu',{action:'toggle-music'});await nav('today');
 await request('snapshot',{path:path.join(dir,'native-home.png')});
 pass('CmdW stops audio; reopening reuses the window; rapid reopen is safe and manual pause is respected');
 assert.deepEqual(await js('window._qaErrors'),[]);pass('native acceptance completes without JavaScript exceptions or rejected promises');
 fs.writeFileSync(path.join(root,'tests/native-desktop-results.json'),JSON.stringify({ok:true,at:new Date().toISOString(),context:'installed native macOS app; real AppKit event routing and WKWebView, isolated server/data; save sheet uses public endSheet API to invoke the real save completion (remote OS button is not physically clicked)' ,passed,status:await request('status'),artifacts:dir,events},null,2));
 console.log('ARTIFACTS',dir);
}catch(error){if(app&&!exited)await request('snapshot',{path:path.join(dir,'failure.png')}).catch(()=>{});console.error('ARTIFACTS',dir);throw error;}
finally{if(app&&!exited){await request('clipboard-restore').catch(()=>{});await request('quit').catch(()=>{});app.stdin.end();}server?.kill('SIGTERM');}
