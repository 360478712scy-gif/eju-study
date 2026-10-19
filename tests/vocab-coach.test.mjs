import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {buildVocabReportRequest,finalizeVocabReportResult,applyVocabMetaAction,createCoach} from '../ai/coach.mjs';

const root=path.resolve(import.meta.dirname,'..'),date='2026-10-06';
const result={summary:'读音提取仍不稳定。',strengths:['两个独立正确答案。'],weaknesses:['均等的读音需要复习。'],nextSteps:['明天先看均等，再闭卷输入きんとう。']};
function state(){return {today:date,revision:0,profile:{startDate:date},plans:{},attempts:[{questionId:'legacy',correct:true,hinted:true}],vocabulary:{attempts:[
 {id:'a1',questionId:'q1',word:'均等',reading:'きんとう',mode:'reading',response:'ひんどう',correct:false,expected:'きんとう',explanation:'均等读きんとう。',seconds:9,helped:false,independent:true,firstToday:true,date,taskId:'vocab',blockId:'read',gradingStandard:'kana'},
 {id:'a2',questionId:'q2',word:'均一',reading:'きんいつ',mode:'reading',response:'きんいつ',correct:true,expected:'きんいつ',seconds:3,helped:false,independent:true,firstToday:true,date,taskId:'vocab',blockId:'read',gradingStandard:'kana'},
 {id:'b1',questionId:'q3',word:'枯渇',reading:'こかつ',mode:'meaning',response:1,correct:false,expected:'枯竭',seconds:8,helped:true,independent:false,date,taskId:'vocab',blockId:'meaning',contentSnapshot:{meaningOptions:['枯竭','开发','保障','分配']}},
 ],mastery:{},observations:[{date,inputMode:'audio-only',text:'第一天全程只听音没看题干，39/40仅为音到义。',source:'self-report'}]},privateSecret:'private-draft-never-in-prompt'};}
function setup(t,s=state(),extra={}){
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'eju-vocab-coach-unit-')),processes=[],updates=[];
 t.after(()=>{for(const p of processes)if(!p.closed)p.finish(null,1);fs.rmSync(data,{recursive:true,force:true});});
 const spawn=(_cli,args)=>{const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.args=args;child.prompt='';child.stdin.on('data',b=>child.prompt+=b);child.kill=()=>{child.finish(null,143);return true;};child.finish=(value=result,code=0)=>{if(child.closed)return;child.closed=true;if(value)fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(value));child.emit('close',code);};processes.push(child);return child;};
 const config={root,data,getState:()=>s,bank:[],onJobUpdate:j=>{updates.push(j);s.vocabulary.reports||={};s.vocabulary.reports[j.reportKey]=j;},dependencies:{spawn,isAvailable:()=>true},...extra};
 return {s,data,processes,updates,config,coach:createCoach(config)};
}

test('report IDs are deterministic; only persisted attempts supply scores and timing',()=>{
 const s=state(),a=buildVocabReportRequest(s,{attemptIds:['a2','a1','a1'],correct:999,seconds:999}),b=buildVocabReportRequest(s,{attemptIds:['a1','a2']});
 assert.equal(a.reportKey,b.reportKey);assert.deepEqual(a.attemptIds,['a1','a2']);assert.equal(a.stats.correct,1);assert.equal(a.stats.seconds,12);assert.equal(a.stats.medianSeconds,6);assert.equal(a.stats.independent,2);
 assert.equal(a.context.attempts[0].response,'ひんどう');assert.ok(a.prompt.includes('audio-only'));assert.match(a.prompt,/不等于问过AI/);assert.ok(!a.prompt.includes('private-draft-never-in-prompt'));
 assert.throws(()=>buildVocabReportRequest(s,{attemptIds:['a1','missing']}),/不存在/);assert.throws(()=>buildVocabReportRequest(s,{attemptIds:['a1','b1']}),/同一/);assert.throws(()=>buildVocabReportRequest(s,{attemptIds:['a1'],taskId:'forged'}),/不属于/);
});

test('wrong alternatives and assistance are visible, never counted as independent',()=>{
 const request=buildVocabReportRequest(state(),{attemptIds:['b1']});assert.equal(request.context.attempts[0].selectedText,'开发');assert.equal(request.stats.independent,0);assert.equal(request.stats.helped,1);
 const s=state();s.vocabulary.attempts.push({...s.vocabulary.attempts[0],id:'retry',correct:true,response:'きんとう',firstToday:false});const r=buildVocabReportRequest(s,{attemptIds:['a1','retry']});assert.equal(r.stats.words,1);assert.equal(r.stats.attempts,2);assert.equal(r.stats.independentCorrect,0);
});

test('AI reports retain the actual reading context and equivalent-answer standard from the saved attempt',()=>{
 const s=state(),row=s.vocabulary.attempts[0];
 Object.assign(row,{word:'分別',reading:'ぶんべつ',response:'ふんべつ',expected:'ぶんべつ',contentSnapshot:{readingContext:'ごみを種類ごとに分別する。'}});
 const request=buildVocabReportRequest(s,{attemptIds:['a1']});
 assert.equal(request.context.attempts[0].prompt,'分別\nごみを種類ごとに分別する。');
 assert.equal(request.context.attempts[0].correct,false);
 Object.assign(row,{word:'攪拌',reading:'かくはん',response:'こうはん',correct:true,expected:'かくはん ／ こうはん',contentSnapshot:{acceptedReadings:['かくはん','こうはん']}});
 const accepted=buildVocabReportRequest(s,{attemptIds:['a1']}).context.attempts[0];
 assert.equal(accepted.correct,true);assert.equal(accepted.expected,'かくはん ／ こうはん');
});

test('report validator rejects malformed success and unsupported fields',()=>{
 assert.deepEqual(finalizeVocabReportResult(result),result);assert.throws(()=>finalizeVocabReportResult({...result,nextSteps:[]}),/格式/);assert.throws(()=>finalizeVocabReportResult({...result,correct:40}),/格式/);assert.throws(()=>finalizeVocabReportResult({...result,summary:''}),/格式/);
});

test('automatic reports deduplicate and queue, and completion preserves newer answers',t=>{
 const {coach,processes,s}=setup(t);const a=coach.start({type:'vocabReport',attemptIds:['a1','a2']});assert.equal(a.status,'running');assert.equal(coach.start({type:'vocabReport',attemptIds:['a2','a1']}).id,a.id);
 const b=coach.start({type:'vocabReport',attemptIds:['b1']});assert.equal(b.status,'queued');assert.equal(processes.length,1);assert.equal(coach.status().queued,1);
 s.vocabulary.attempts.push({...s.vocabulary.attempts[0],id:'new-during-AI'});s.drafts={latest:'must survive'};processes[0].finish();assert.equal(coach.get(a.id).status,'completed');assert.equal(s.vocabulary.attempts.at(-1).id,'new-during-AI');assert.equal(s.drafts.latest,'must survive');assert.equal(s.vocabulary.reports[a.reportKey].result.summary,result.summary);assert.equal(processes.length,2);assert.equal(coach.get(b.id).status,'running');processes[1].finish();assert.equal(coach.status().busy,false);
 assert.equal(coach.start({type:'vocabReport',attemptIds:['a1','a2'],retry:true}).id,a.id,'completed report never generates again');
});

test('completed reports remain readable and cached after restart',t=>{
 const {coach,processes,config}=setup(t),a=coach.start({type:'vocabReport',attemptIds:['a1']});processes[0].finish();const restarted=createCoach(config);assert.equal(restarted.get(a.id).status,'completed');assert.equal(restarted.start({type:'vocabReport',attemptIds:['a1']}).id,a.id);assert.equal(processes.length,1);
});

test('interrupted jobs fail honestly; retry is explicit and preserves the old history',t=>{
 const {coach,processes,config,data}=setup(t),a=coach.start({type:'vocabReport',attemptIds:['a1']});
 // Simulate persisted running status without two live controllers for one process.
 processes[0].finish();const file=path.join(data,'ai-history',a.id+'.json'),j=JSON.parse(fs.readFileSync(file));j.status='running';delete j.result;fs.writeFileSync(file,JSON.stringify(j));
 const restarted=createCoach(config);assert.equal(restarted.get(a.id).status,'failed');assert.match(restarted.get(a.id).error,/重启/);assert.equal(restarted.start({type:'vocabReport',attemptIds:['a1']}).id,a.id);
 const retry=restarted.start({type:'vocabReport',attemptIds:['a1'],retry:true});assert.notEqual(retry.id,a.id);processes[1].finish();assert.equal(restarted.get(retry.id).status,'completed');assert.equal(restarted.get(a.id).status,'failed');
});

test('offline CLI creates a persisted failure; self-report never requires AI availability',t=>{
 const {coach,processes,s}=setup(t,state(),{dependencies:{isAvailable:()=>false}});applyVocabMetaAction(s,{type:'vocabSelfReport',attemptIds:['a1'],text:'我看字想不出读音。'},date);
 const key=buildVocabReportRequest(s,{attemptIds:['a1']}).reportKey;assert.equal(s.vocabulary.selfReports[key].text,'我看字想不出读音。');const a=coach.start({type:'vocabReport',attemptIds:['a1']});assert.equal(a.status,'failed');assert.equal(a.result,undefined);assert.equal(processes.length,0);assert.equal(s.vocabulary.reports[key].status,'failed');assert.equal(s.vocabulary.selfReports[key].text,'我看字想不出读音。');
});

test('self report stores attempt identity before AI exists and can be cleared without blocking navigation',()=>{
 const s=state(),key=buildVocabReportRequest(s,{attemptIds:['a1']}).reportKey;
 applyVocabMetaAction(s,{type:'vocabSelfReport',attemptIds:['a1'],text:'需要练习读音'},date);
 assert.deepEqual(s.vocabulary.selfReports[key].attemptIds,['a1']);assert.equal(s.vocabulary.selfReports[key].date,date);
 applyVocabMetaAction(s,{type:'vocabSelfReport',attemptIds:['a1'],text:''},date);
 assert.equal(s.vocabulary.selfReports[key].text,'');assert.deepEqual(s.vocabulary.selfReports[key].attemptIds,['a1']);
 assert.throws(()=>applyVocabMetaAction(s,{type:'vocabObservation',observationId:'blank',date,inputMode:'unknown',text:''},date),/不能为空/);
});

test('bad AI JSON cannot become a completed report and cancelled queued job never spawns',t=>{
 const {coach,processes}=setup(t),a=coach.start({type:'vocabReport',attemptIds:['a1']}),b=coach.start({type:'vocabReport',attemptIds:['b1']});coach.cancel(b.id);processes[0].finish({summary:'fake'});assert.equal(coach.get(a.id).status,'failed');assert.equal(coach.get(a.id).result,undefined);assert.equal(coach.get(b.id).status,'cancelled');assert.equal(processes.length,1);assert.equal(coach.status().busy,false);
});

test('self reports and idempotent observations do not overwrite grading or AI reports',()=>{
 const s=state(),raw=JSON.stringify(s.attempts),rawNew=JSON.stringify(s.vocabulary.attempts),key=buildVocabReportRequest(s,{attemptIds:['a1']}).reportKey;s.vocabulary.reports={[key]:{result}};
 applyVocabMetaAction(s,{type:'vocabSelfReport',reportKey:key,text:'听词能认，看字不会读。'},date);assert.deepEqual(s.vocabulary.reports[key].result,result);
 const a={type:'vocabObservation',observationId:'first-day-input',date,inputMode:'audio-only',text:'全程只听音没看题干。'};applyVocabMetaAction(s,a,date);applyVocabMetaAction(s,{...a,text:'第一天40题均只听音没看题干。'},date);assert.equal(s.vocabulary.observations.filter(x=>x.id==='first-day-input').length,1);assert.equal(s.vocabulary.observations.at(-1).source,'self-report');assert.equal(JSON.stringify(s.attempts),raw);assert.equal(JSON.stringify(s.vocabulary.attempts),rawNew);
 assert.throws(()=>applyVocabMetaAction(s,{type:'vocabSelfReport',reportKey:'vocab-'+'f'.repeat(64),text:'不能注入'},date),/没有/);assert.throws(()=>applyVocabMetaAction(s,{type:'vocabSelfReport',attemptIds:['a1'],reportKey:'vocab-'+'f'.repeat(64),text:'不能注入'},date),/不匹配/);assert.throws(()=>applyVocabMetaAction(s,{...a,date:'2026-10-07'},date),/日期/);
});
