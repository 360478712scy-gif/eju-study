import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {createCoach} from '../ai/coach.mjs';import {loadBank} from '../bank.mjs';import {initialState,ensurePlan,today,applyAction} from '../engine.mjs';
const root=path.resolve(import.meta.dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'eju-live-coach-v2-')),bank=loadBank(),s=initialState();s.today=today();ensurePlan(s,bank,s.today);
applyAction(s,bank,{type:'report',fatigue:3,available:240,note:'这是隔离环境的软件验收数据，并非用户真实学习成果。今天只验证了任务流程，明天可学习四小时，尚无足够首答样本。'},s.today);
const coach=createCoach({root,data,getState:()=>s,bank});let job=coach.start({type:'plan'});console.log('Live CLI started',job.id);
while(job.status==='running'){await new Promise(r=>setTimeout(r,1000));job=coach.get(job.id);}
fs.writeFileSync(path.join(root,'tests/live-coach-v2-result.json'),JSON.stringify({...job,testContext:'isolated synthetic report; no production records changed'},null,2));
assert.equal(job.status,'completed',job.error);assert.equal(job.result.preview.tasks.length,7);assert.equal(s.coachPlans.length,0);assert.ok(job.result.preview.budget<=240);assert.ok(job.result.preview.tasks.every(t=>t.blocks.length>0));console.log('PASS real CLI returns concrete preview without applying',job.result.preview.budget,job.result.preview.status,job.result.preview.tasks.map(t=>[t.title,t.count]));
