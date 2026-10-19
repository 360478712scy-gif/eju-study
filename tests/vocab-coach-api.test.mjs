import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {initialState,applyAction,today,ensurePlan} from '../engine.mjs';
import {loadBank} from '../bank.mjs';
import {getVocabContent} from '../public/vocab-content.js';

const root=path.resolve(import.meta.dirname,'..'),date=today();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;await new Promise(resolve=>s.close(resolve));return port;}
async function until(fn,message){for(let i=0;i<80;i++){const value=await fn();if(value)return value;await sleep(60);}throw Error(message);}

test('real HTTP pipeline persists separate reports, current answers and observation across restart without a real CLI',async t=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'eju-vocab-coach-api-')),fake=path.join(data,'fake-codex.mjs'),port=await freePort(),url='http://127.0.0.1:'+port,bank=loadBank(),s=initialState();
 const first=getVocabContent('vx140');applyAction(s,bank,{type:'vocabAnswer',attemptId:'initial-answer',questionId:'vx140',mode:'reading',response:'わからない',seconds:19},date);ensurePlan(s,bank,date);fs.writeFileSync(path.join(data,'state.json'),JSON.stringify(s));
 // Deterministic process stand-in: no Codex account, network or billable request.
 fs.writeFileSync(fake,`#!${process.execPath}\nimport fs from 'node:fs';\nconst args=process.argv.slice(2),out=args[args.indexOf('--output-last-message')+1];\nlet prompt='';for await(const chunk of process.stdin)prompt+=chunk;\nfs.appendFileSync(${JSON.stringify(path.join(data,'fake-calls'))},'called\\n');\nsetTimeout(()=>{fs.writeFileSync(out,JSON.stringify({summary:'读取了真实答案和计时。',strengths:[],weaknesses:['需要练习读音。'],nextSteps:['明天看字输入假名。']}));},650);\n`,{mode:0o700});
 let child,log='';async function start(){child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,EJU_DATA_DIR:data,PORT:String(port),EJU_CODEX_PATH:fake},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);await until(async()=>{try{return (await fetch(url+'/api/health')).ok;}catch{return false;}},'isolated server did not start: '+log);}
 async function stop(){if(child&&child.exitCode===null){const exit=once(child,'exit');child.kill('SIGTERM');await exit;}}
 t.after(async()=>{await stop();fs.rmSync(data,{recursive:true,force:true});});
 async function get(route){const r=await fetch(url+route);assert.equal(r.status,200);return r.json();}
 async function post(route,body,status=200){const r=await fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),value=await r.json();assert.equal(r.status,status,value.error);return value;}
 await start();
 // Self-report can be written before an AI request even exists.
 await post('/api/action',{type:'vocabSelfReport',attemptIds:['initial-answer'],text:'我能听出这个词，但看字想不出读音。'});
 await post('/api/action',{type:'vocabObservation',observationId:'first-day-audio-only',date,inputMode:'audio-only',text:'第一天40题全程只听词音没看题干，39题正确。'});
 const job=await post('/api/ai/start',{type:'vocabReport',attemptIds:['initial-answer']},202);assert.equal(job.status,'running');
 await post('/api/ai/start',{type:'vocabReport',attemptIds:['fake-id']},400);
 const duplicate=await post('/api/ai/start',{type:'vocabReport',attemptIds:['initial-answer']},202);assert.equal(duplicate.id,job.id);
 await post('/api/action',{type:'vocabAnswer',attemptId:'answer-while-pending',questionId:'vx290',mode:'reading',response:getVocabContent('vx290').reading,seconds:7});
 await post('/api/action',{type:'vocabSelfReport',reportKey:job.reportKey,text:'正在等待报告，但我继续练了另一个词。'});
 const completed=await until(async()=>{const j=await get('/api/ai/job?id='+job.id);return j.status==='completed'&&j;},'report failed to finish');assert.equal(completed.result.summary,'读取了真实答案和计时。');
 const current=await get('/api/state');assert.equal(current.vocabulary.attempts.length,2);assert.equal(current.vocabulary.attempts[0].expected,first.reading);assert.equal(current.vocabulary.attempts[0].correct,false);assert.equal(current.vocabulary.attempts[1].id,'answer-while-pending');assert.equal(current.vocabulary.reports[job.reportKey].status,'completed');assert.equal(current.vocabulary.selfReports[job.reportKey].text,'正在等待报告，但我继续练了另一个词。');assert.equal(current.vocabulary.observations[0].inputMode,'audio-only');
 const raw=JSON.parse(fs.readFileSync(path.join(data,'state.json')));assert.equal(raw.vocabulary.attempts.length,2);assert.equal(raw.vocabulary.reports[job.reportKey].result.summary,completed.result.summary);
 await stop();await start();const restored=await get('/api/vocab/reports');assert.equal(restored.reports[job.reportKey].id,job.id);assert.equal(restored.selfReports[job.reportKey].source,'self-report');assert.equal(restored.observations[0].source,'self-report');assert.equal((await get('/api/ai/job?id='+job.id)).status,'completed');
 const cached=await post('/api/ai/start',{type:'vocabReport',attemptIds:['initial-answer']},202);assert.equal(cached.id,job.id);assert.equal(fs.readFileSync(path.join(data,'fake-calls'),'utf8').trim().split('\n').length,1);
});
