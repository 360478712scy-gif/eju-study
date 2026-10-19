import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {createCoach} from '../ai/coach.mjs';import {loadBank} from '../bank.mjs';import {initialState,today} from '../engine.mjs';
const root=path.resolve(import.meta.dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'eju-live-sol-')),bank=loadBank(),state=initialState();state.today=today();
const q=bank.find(q=>q.subject==='math'&&!q.official&&q.topic==='trig');
const coach=createCoach({root,data,getState:()=>state,bank});let job=coach.start({type:'hint',questionId:q.id,attempt:'我想先把角拆成已知特殊角，但对和差公式的正负号不确定。',level:1});
while(job.status==='running'){await new Promise(r=>setTimeout(r,1000));job=coach.get(job.id);}
fs.writeFileSync(path.join(root,'tests/live-coach-sol-result.json'),JSON.stringify({...job,testContext:'isolated short hint; production records unchanged'},null,2));
assert.equal(job.model,'gpt-6.1-sol');assert.equal(job.reasoningEffort,'high');assert.equal(job.status,'completed',job.error);assert.ok(job.result.hint);console.log('PASS',job.model,job.reasoningEffort,'live hint completed');
