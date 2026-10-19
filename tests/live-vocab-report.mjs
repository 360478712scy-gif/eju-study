import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createCoach,applyVocabMetaAction} from '../ai/coach.mjs';
import {loadBank} from '../bank.mjs';
import {initialState,applyAction,today} from '../engine.mjs';

// Explicit live smoke test, separate from npm test; never touches production data.
const root=path.resolve(import.meta.dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'eju-live-vocab-')),bank=loadBank(),state=initialState(),date=today();
state.today=date;
for(const [id,response,seconds] of [['vx290','ひんどう',18],['vx291','きんいつ',8],['vx185','こかつ',11]])applyAction(state,bank,{type:'vocabAnswer',attemptId:'live-'+id,questionId:id,mode:'reading',response,seconds},date);
const attemptIds=state.vocabulary.attempts.map(a=>a.id);
applyVocabMetaAction(state,{type:'vocabSelfReport',attemptIds,text:'这是隔离测试样本：均等的读音记错，另外两词读音正确。'},date);
applyVocabMetaAction(state,{type:'vocabObservation',observationId:'live-test-observation',date,inputMode:'audio-only',text:'隔离测试背景：旧版题目依靠听音作答，看字回忆读音需要单独验证。'},date);
const coach=createCoach({root,data,getState:()=>state,bank,onJobUpdate:job=>{state.vocabulary.reports ||= {};state.vocabulary.reports[job.reportKey]=job;fs.writeFileSync(path.join(data,'state.json'),JSON.stringify(state,null,2));}});
let job=coach.start({type:'vocabReport',attemptIds});
while(['running','queued'].includes(job.status)){await new Promise(r=>setTimeout(r,1000));job=coach.get(job.id);}
const receipt={...job,testContext:'Isolated synthetic reading answers; one genuine Codex CLI report; production unchanged',isolatedData:data};
fs.writeFileSync(path.join(root,'tests/live-vocab-report-result.json'),JSON.stringify(receipt,null,2));
assert.equal(job.model,'gpt-6.1-sol');assert.equal(job.reasoningEffort,'high');assert.equal(job.status,'completed',job.error);assert.ok(job.result.summary);assert.ok(job.result.weaknesses.length);
assert.equal(state.vocabulary.attempts.length,3);assert.equal(state.vocabulary.attempts[0].correct,false);assert.equal(state.vocabulary.selfReports[job.reportKey].text.includes('隔离测试'),true);
assert.equal(coach.start({type:'vocabReport',attemptIds}).id,job.id,'same answers reuse saved report');
console.log('PASS: real gpt-6.1-sol/high vocabulary report, independent self-report, cached reuse. Receipt: tests/live-vocab-report-result.json');
