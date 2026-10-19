import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {initialState,buildPlan,today} from '../engine.mjs';
import {loadBank} from '../bank.mjs';
import {getVocabContent} from '../public/vocab-content.js';

// Deliberately narrow acceptance in the installed AppKit/WKWebView app.
// Return events are real NSEvents, while field setup and element clicks use the
// app's QA-only DOM bridge. No OS input-method language preference is changed.
const root=path.resolve(import.meta.dirname,'..'),port=18776,base=`http://127.0.0.1:${port}`;
const binary='~/Applications/澄学 EJU.app/Contents/MacOS/Chengxue';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eju-japanese-native-')),data=path.join(dir,'data');
const bank=loadBank(),date=today(),pending=new Map(),events=[],passed=[],serverLogs=[];
let server,app,sequence=0,buffer='',exited=false,step='prepare';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pass=label=>{passed.push(label);console.log('PASS',label);};
function request(command,args={}){const id=String(++sequence);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Native command timeout: '+command));},15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});app.stdin.write(JSON.stringify({id,command,...args})+'\n');});}
const js=script=>exited?Promise.reject(Error('Native process exited')):request('eval',{script});
async function until(probe,label,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){try{if(await probe())return;}catch{}await sleep(75);}throw Error('Not ready: '+label);}
const state=()=>fetch(base+'/api/state').then(r=>r.json());
const click=selector=>js(`document.querySelector(${JSON.stringify(selector)}).click();true`);
const focus=selector=>js(`document.querySelector(${JSON.stringify(selector)}).focus();true`);
async function fill(selector,value){await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);}
async function enter(){await request('key',{characters:'\r',keyCode:36,modifiers:[]});await sleep(160);}
async function close(){if(await js(`!!document.querySelector('#close-modal')`))await click('#close-modal');}
async function work(task,blockId){await close();await request('menu',{action:'navigate',page:'today'});await until(()=>js(`!!document.querySelector('.nav [data-page="today"].active')`),'today');await click(`[data-study="${task.id}"]`);await click(`[data-block="${blockId}"]`);}
async function bounds(label,footer){const result=await js(`(()=>{const m=document.querySelector('.modal').getBoundingClientRect(),f=document.querySelector(${JSON.stringify(footer)}).getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight},modal:{x:m.x,y:m.y,width:m.width,height:m.height},footer:{left:f.left,right:f.right,top:f.top,bottom:f.bottom},buttons:[...document.querySelectorAll(${JSON.stringify(footer+' button')})].filter(e=>!e.disabled).map(e=>{const r=e.getBoundingClientRect();return {id:e.id,left:r.left,right:r.right,top:r.top,bottom:r.bottom};})};})()`);assert.ok(Math.abs(result.modal.x)<2&&Math.abs(result.modal.y)<2,label+' starts at window edge');assert.ok(Math.abs(result.modal.width-result.viewport.width)<2&&Math.abs(result.modal.height-result.viewport.height)<2,label+' fills WK viewport');assert.ok(result.footer.left>=-1&&result.footer.right<=result.viewport.width+1&&result.footer.bottom<=result.viewport.height+1,label+' footer fits');for(const b of result.buttons)assert.ok(b.left>=-1&&b.right<=result.viewport.width+1&&b.top>=0&&b.bottom<=result.viewport.height+1,label+' button outside window '+JSON.stringify(b));return result;}

try{
  assert.ok(fs.existsSync(binary),'Installed native executable is required');assert.equal(new URL(base).port==='18763',false);
  let occupied=false;try{await fetch(base+'/api/health',{signal:AbortSignal.timeout(250)});occupied=true;}catch{}assert.equal(occupied,false,'Port 18776 must be unused');
  const seed=initialState(),plan=buildPlan(seed,bank,date),vocab=plan.tasks.find(t=>t.topic==='vocab');
  const subjectTasks={};
  for(const subject of ['math','physics','chemistry']){
    const task=plan.tasks.find(t=>t.subject===subject),qs=bank.filter(q=>q.subject===subject&&!q.official&&!q.selfGrade).slice(0,2);assert.equal(qs.length,2);
    // Short actual-content queues isolate keyboard behavior from preheat tasks.
    task.questionIds=qs.map(q=>q.id);task.blocks=[{id:'answer',kind:'questions',title:'原生按键验收题组',questionIds:task.questionIds,minutes:2,units:2,instruction:'实际作答后检查下一题和多行输入。'}];task.minutes=task.estimatedMinutes=2;task.referenceQuestionIds=[];task.reserveQuestionIds=[];subjectTasks[subject]={task,qs};
  }
  plan.budget=plan.tasks.reduce((n,t)=>n+t.minutes,0);seed.plans[date]=plan;fs.mkdirSync(data,{recursive:true});fs.writeFileSync(path.join(data,'state.json'),JSON.stringify(seed,null,2));
  server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),EJU_DATA_DIR:data,EJU_CODEX_PATH:path.join(dir,'no-live-cli')},stdio:'pipe'});server.stdout.on('data',b=>serverLogs.push(b.toString()));server.stderr.on('data',b=>serverLogs.push(b.toString()));
  await until(async()=>(await fetch(base+'/api/health')).ok,'isolated server');
  app=spawn(binary,['--qa','--qa-url',base],{cwd:root,stdio:['pipe','pipe','pipe']});
  app.stdout.on('data',chunk=>{buffer+=chunk.toString();let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.startsWith('EJU_QA '))continue;const reply=JSON.parse(line.slice(7));if(reply.event){events.push(reply);continue;}const entry=pending.get(String(reply.id));if(entry){pending.delete(String(reply.id));reply.ok?entry.resolve(reply.value):entry.reject(Error(reply.error));}}});
  app.stderr.on('data',chunk=>fs.appendFileSync(path.join(dir,'native-stderr.log'),chunk));app.on('exit',(code,signal)=>{exited=true;events.push({event:'exit',code,signal});for(const entry of pending.values())entry.reject(Error('Native process exited'));pending.clear();});
  await until(()=>js(`!!document.querySelector('.nav')&&!!window.ejuNative`),'native page',25000);await request('show');
  await js(`window._qaErrors=[];window._qaAIRequests=[];window._qaNativeKeys=[];addEventListener('error',e=>_qaErrors.push(e.message));addEventListener('unhandledrejection',e=>_qaErrors.push(String(e.reason)));document.addEventListener('keydown',e=>{if(e.key==='Enter')_qaNativeKeys.push({key:e.key,trusted:e.isTrusted,target:e.target.id,composing:e.isComposing});},true);const originalFetch=window.fetch.bind(window);window.fetch=(url,options)=>{if(String(url).includes('/api/ai/start')){_qaAIRequests.push(String(url));return Promise.resolve(new Response(JSON.stringify({error:'Native test never invokes live AI'}),{status:503,headers:{'Content-Type':'application/json'}}));}return originalFetch(url,options);};localStorage.setItem('eju-music-enabled','false');document.querySelector('#bgm').pause();true`);
  const nativeStatus=await request('status');assert.equal(nativeStatus.visible,true);assert.equal(nativeStatus.key,true);assert.equal(nativeStatus.persistent,false);assert.equal(nativeStatus.url,base+'/');

  step='native Japanese reading answer and feedback';
  const reading=vocab.blocks.find(b=>b.id==='reading'),first=reading.questionIds[0],second=reading.questionIds[1];await work(vocab,reading.id);await until(()=>js(`!!document.querySelector('#vocab-response')`),'reading input');
  assert.equal(await js(`document.querySelectorAll('.modal [data-vocab-word],.modal [data-vocab-example],.modal #help-open,.modal #ai-hint,.modal .vocab-standard').length`),0);assert.equal(await js(`document.querySelector('.modal').textContent.includes(${JSON.stringify(getVocabContent(first).reading)})`),false);const readingBounds=await bounds('reading','.vocab-footer');
  await request('snapshot',{path:path.join(dir,'native-reading-answer.png')});
  // A WK DOM-composition check complements actual Return events without changing
  // the user's system IME. This is not a claim of OS candidate-window testing.
  const composing=await js(`(()=>{const input=document.querySelector('#vocab-response');input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'こ'}));const event=new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true,bubbles:true,cancelable:true});input.dispatchEvent(event);input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'こ'}));return {prevented:event.defaultPrevented,exists:!!document.querySelector('#vocab-response')};})()`);assert.equal(composing.prevented,true);assert.equal(composing.exists,true);assert.equal((await state()).vocabulary.attempts.length,0);
  await fill('#vocab-response',getVocabContent(first).word);await enter();await until(()=>js(`!!document.querySelector('.vocab-feedback')`),'reading submitted by NSEvent Return');
  let s=await state();assert.equal(s.vocabulary.attempts.length,1);assert.equal(s.vocabulary.attempts[0].correct,false);assert.equal(s.vocabulary.attempts[0].expected,getVocabContent(first).reading);assert.equal(await js(`document.querySelectorAll('[data-vocab-word]').length`),1);await bounds('feedback','.vocab-footer');await request('snapshot',{path:path.join(dir,'native-reading-feedback.png')});
  await focus('#vocab-next');await enter();await until(()=>js(`document.querySelector('#vocab-exercise')?.dataset.vocabId===${JSON.stringify(second)}`),'next reading question');assert.equal((await state()).vocabulary.attempts.length,1);
  pass('installed WKWebView fills the native window; real Return submits Japanese reading and advances once, with audio/answer available only after grading');

  step='native Japanese automatic next option';
  const meaning=vocab.blocks.find(b=>b.id==='meaning'),meaningFirst=meaning.questionIds[0],meaningSecond=meaning.questionIds[1];await work(vocab,meaning.id);await until(()=>js(`!!document.querySelector('#jp-auto-next')`),'meaning toggle');assert.equal(await js(`document.querySelector('#jp-auto-next').checked`),false);
  assert.equal(await js(`document.querySelectorAll('.modal [data-vocab-word],.modal #help-open,.modal #ai-hint').length`),0);
  await click(`input[name="vocab-choice"][value="${getVocabContent(meaningFirst).meaningAnswer}"]`);await sleep(250);assert.equal((await state()).vocabulary.attempts.filter(a=>a.mode==='meaning').length,0);
  await click('#jp-auto-next');await click(`input[name="vocab-choice"][value="${(getVocabContent(meaningFirst).meaningAnswer+1)%4}"]`);await until(()=>js(`document.querySelector('#vocab-exercise')?.dataset.vocabId===${JSON.stringify(meaningSecond)}`),'native Japanese auto-next');s=await state();assert.equal(s.vocabulary.attempts.filter(a=>a.mode==='meaning').length,1);assert.equal(s.vocabulary.attempts.find(a=>a.mode==='meaning').correct,false);await bounds('Japanese choice','.vocab-footer');
  pass('Japanese auto-next is opt-in, submits the selected answer and advances in actual WKWebView');

  step='real Return in mathematics physics chemistry';
  for(const subject of ['math','physics','chemistry']){
    const {task,qs}=subjectTasks[subject];await work(task,'answer');await until(()=>js(`!!document.querySelector('.question-layout')`),subject+' question');assert.equal(await js(`document.querySelectorAll('#jp-auto-next').length`),0);await bounds(subject,'.quiz-navigation');
    await fill('#question-note','原生多行输入检查');await enter();assert.equal(await js(`document.querySelector('.qnav .active').dataset.qindex`),'0');assert.ok((await js(`document.querySelector('#question-note').value`)).includes('\n'));
    await click(`[data-option="${qs[0].answer}"]`);await sleep(180);assert.equal((await state()).attempts.some(a=>a.questionId===qs[0].id),false,'Japanese preference must not auto-submit '+subject);
    await click('#submit-answer');await until(()=>js(`!!document.querySelector('.explanation')`),subject+' feedback');await focus('#qnext');await enter();await until(()=>js(`document.querySelector('.qnav .active')?.dataset.qindex==='1'`),subject+' next');assert.equal((await state()).attempts.filter(a=>a.taskId===task.id).length,1);
    pass(subject+' uses real native Return for one next-question step; multiline Return remains a newline and Japanese auto-submit does not leak across subjects');
  }

  step='native evidence and cleanup';
  const keyEvents=await js('window._qaNativeKeys'),errors=await js('window._qaErrors'),aiRequests=await js('window._qaAIRequests');assert.ok(keyEvents.filter(e=>e.trusted).length>=8,'at least eight real trusted Return events required');assert.deepEqual(errors,[]);assert.deepEqual(aiRequests,[]);const finalState=await state();assert.equal(finalState.vocabulary.attempts.length,2);assert.equal(finalState.attempts.length,3);
  fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({ok:true,passed,errors,aiRequests,noLiveCLI:true,realNativeReturn:true,imeScope:'WK DOM composition guard plus real NSEvent text entry; OS IME candidate selection was not automated',nativeStatus,readingBounds,keyEvents,events,data,at:new Date().toISOString()},null,2));console.log('ARTIFACTS',dir);
}catch(error){if(app&&!exited){await request('snapshot',{path:path.join(dir,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(dir,'failure-page.txt'),String(await js('document.body.innerText').catch(()=>'')));}fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({ok:false,step,error:String(error.stack||error),passed,events,data},null,2));console.error('FAILED',step,'ARTIFACTS',dir);throw error;}
finally{if(app&&!exited){await request('quit').catch(()=>{});app.stdin.end();}if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}fs.writeFileSync(path.join(dir,'server.log'),serverLogs.join(''));}
