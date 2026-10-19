import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {coachArgs,COACH_MODEL,COACH_REASONING_EFFORT,createCoach} from '../ai/coach.mjs';

test('application calls pin the requested Sol model and high effort without changing global config',()=>{
 const args=coachArgs({work:'/tmp/learning work',schemaPath:'/tmp/schema.json',out:'/tmp/result.json',images:['/tmp/question with spaces.png']});
 assert.equal(COACH_MODEL,'gpt-6.1-sol');assert.equal(COACH_REASONING_EFFORT,'high');
 assert.equal(args[args.indexOf('--model')+1],COACH_MODEL);assert.ok(args.includes('model_reasoning_effort="high"'));
 assert.ok(args.includes('--ignore-user-config'));assert.equal(args[args.indexOf('--sandbox')+1],'read-only');
 assert.equal(args[args.indexOf('--image')+1],'/tmp/question with spaces.png');assert.equal(args.at(-1),'-');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eju-coach-status-'));try{const coach=createCoach({root:path.resolve(import.meta.dirname,'..'),data:dir,getState:()=>({}),bank:[]});assert.equal(coach.status().model,COACH_MODEL);assert.equal(coach.status().reasoningEffort,'high');assert.equal(coach.status().busy,false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
