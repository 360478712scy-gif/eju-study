import {PLANNER_VERSION} from '../planner.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,applyAction,stats,recommend,taskEvidence,makeReport,ensurePlan} from '../engine.mjs';
import {reviewQueue} from '../public/transfer.js';
import {reviewReferenceIds} from '../public/workload-ui.js';

const date='2026-10-06';
const q=(id,extra={})=>({id,subject:'physics',topic:'wave',skill:'wave-speed',options:['a','b'],answer:0,minutes:3,...extra});
const bank=[q('p'),q('p2'),q('v',{subject:'japanese',topic:'vocab'}),q('l',{subject:'japanese',topic:'listening'})];
const task={id:date+'-physics',subject:'physics',topic:'wave',title:'物理',minutes:50,questionIds:['p','p2'],blocks:[{id:'solve',kind:'questions',title:'限时作答',minutes:30,questionIds:['p','p2']},{id:'recall',kind:'recall',title:'闭卷回忆',minutes:20,minChars:20}]};
function seeded(){const s=initialState();s.plans[date]={plannerVersion:PLANNER_VERSION,date,budget:50,tasks:[structuredClone(task)]};return s;}
function answer(s,id,extra={},d=date,b=bank){return applyAction(s,b,{type:'answer',questionId:id,attemptId:id+'-'+s.attempts.length,answer:0,error:'无',seconds:30,...extra},d);}

test('zero-work completion is rejected; progress requires the assigned block and saved evidence',()=>{
 const s=seeded(),complete={type:'completeTask',taskId:task.id,minutes:3,note:'已完成',completed:true};
 assert.throws(()=>applyAction(s,bank,complete,date),/限时作答.*闭卷回忆/);assert.equal(s.points,0);
 answer(s,'p');answer(s,'p2');assert.equal(taskEvidence(s,task,date).complete,false);assert.equal(s.points,0);
 answer(s,'p',{taskId:task.id,blockId:'solve'});assert.equal(s.points,0);
 answer(s,'p2',{taskId:task.id,blockId:'solve'});assert.equal(s.points,3);
 assert.throws(()=>applyAction(s,bank,complete,date),/闭卷回忆/);
 applyAction(s,bank,{type:'saveBlock',taskId:task.id,blockId:'recall',minutes:4,text:'先看波形图横轴，再判断传播方向，最后根据斜率判断质点速度。'},date);
 applyAction(s,bank,complete,date);assert.equal(s.records[task.id].minutes,3);assert.equal(s.records[task.id].source,'self-report');assert.equal(taskEvidence(s,task,date).complete,true);
 const points=s.points;applyAction(s,bank,complete,date);assert.equal(s.points,points);
});

test('a task answer cannot claim a different block or an unassigned question',()=>{
 const s=seeded();assert.throws(()=>answer(s,'v',{taskId:task.id,blockId:'solve'}),/不在该任务/);assert.throws(()=>answer(s,'p',{taskId:task.id}),/同时指定/);assert.equal(s.attempts.length,0);
});

test('same-day retries do not advance intervals or manufacture independent samples',()=>{
 const s=seeded();answer(s,'p',{answer:1,error:'知识'});answer(s,'p');answer(s,'p');
 assert.equal(s.mastery.p.streak,0);assert.equal(s.mastery.p.due,'2026-10-07');assert.equal(stats(s,bank,date).physics.count,1);assert.equal(stats(s,bank,date).physics.correct,0);
 answer(s,'p',{},'2026-10-07');assert.equal(s.mastery.p.streak,1);assert.equal(stats(s,bank,'2026-10-07').physics.count,1);
 const h=seeded();answer(h,'p',{hinted:true});answer(h,'p');assert.equal(stats(h,bank,date).physics.count,0);assert.equal(stats(h,bank,date).physics.assisted,1);
});

test('Japanese vocabulary and comprehension retain separate samples',()=>{
 const s=seeded();answer(s,'v');answer(s,'l',{answer:1,error:'听音'});const jp=stats(s,bank,date).japanese;
 assert.equal(jp.domains.vocab.accuracy,100);assert.equal(jp.domains.listening.accuracy,0);assert.equal(jp.domains.reading.count,0);
 assert.match(makeReport(s,bank,date),/日语分域/);
});

test('physics slowness only identifies physics and never enables the legacy math cut',()=>{
 const b=Array.from({length:5},(_,i)=>q('official'+i,{official:true})),s=seeded();
 for(const item of b)answer(s,item.id,{seconds:180},date,b);
 const result=recommend(s,b,{date,available:240,fatigue:2});assert.deepEqual(result.speedSubjects,['physics']);assert.equal(result.speedMode,false);assert.equal(result.speedEvidence.physics.count,5);
});

test('coarse chapter matches are rejected; easier bridge work cannot certify original mastery',()=>{
 const original=q('original',{official:true}),bridge=q('bridge'),b=[original,bridge],s=seeded();
 answer(s,original.id,{answer:1,error:'知识'},date,b);
 const queue=reviewQueue(s,b,'2026-10-07');assert.equal(queue[0].kind,'bridge');assert.equal(queue[0].demonstratesMastery,false);
 answer(s,bridge.id,{reviewOf:original.id},'2026-10-07',b);assert.equal(s.mastery.original.transferStreak,0);assert.equal(s.mastery.original.due,'2026-10-08');assert.equal(s.attempts.at(-1).transferQualified,false);
 const unrelated=q('unrelated',{skill:'wave'});assert.throws(()=>answer(s,unrelated.id,{reviewOf:original.id},'2026-10-07',[...b,unrelated]),/细考点/);
});

test('report completion is weighted by evidenced block minutes, not task checkboxes',()=>{
 const s=seeded();answer(s,'p',{taskId:task.id,blockId:'solve'});answer(s,'p2',{taskId:task.id,blockId:'solve'});
 applyAction(s,bank,{type:'report',available:240,fatigue:2,note:'今天完成了限时作答，还没有完成闭卷回忆，接下来要补上这一部分。'},date);
 assert.equal(s.reports[date].completion,.6);assert.equal(s.reports[date].minutes,0);
});

test('remaining zero cannot create focus credit; pause excludes paused wall time',()=>{
 const s=seeded(),realNow=Date.now;let now=1_000_000;Date.now=()=>now;
 try{
  assert.throws(()=>applyAction(s,bank,{type:'timer',timer:{total:1500,remaining:0,label:'专注',running:true}},date),/完整时长/);
  applyAction(s,bank,{type:'timer',timer:{total:1500,remaining:1500,label:'专注',running:true}},date);
  now+=300000;applyAction(s,bank,{type:'timer',timer:{total:1500,remaining:0,label:'专注',running:false}},date);assert.equal(s.timer.remaining,1200);
  now+=3600000;applyAction(s,bank,{type:'timer',timer:{total:1500,remaining:0,label:'专注',running:true}},date);assert.equal(s.timer.remaining,1200);assert.throws(()=>applyAction(s,bank,{type:'timerComplete'},date),/实际结束/);
  now+=1200000;applyAction(s,bank,{type:'timerComplete'},date);assert.equal(s.focusSessions.length,1);assert.equal(s.points,5);assert.throws(()=>applyAction(s,bank,{type:'timerComplete'},date));
 }finally{Date.now=realNow;}
});

test('old persisted timer can finish without being retroactively credited',()=>{
 const s=seeded();s.timer={total:1500,remaining:1500,label:'旧专注',running:true,endsAt:Date.now()-1};
 applyAction(s,bank,{type:'timerComplete'},date);assert.equal(s.timer.remaining,0);assert.equal(s.timer.running,false);assert.equal(s.points,0);
});

function recoveryFixture(){
 const s=seeded(),t=s.plans[date].tasks[0];
 t.referenceQuestionIds=['old','other-old'];
 t.blocks=[t.blocks[0],{id:'review',kind:'review',title:'恢复订正',minutes:20,minChars:20,questionIds:['old','p'],fixedReferences:true}];
 const b=[...bank,q('old',{official:true}),q('other-old',{official:true}),q('foreign')];
 const save={type:'saveBlock',taskId:t.id,blockId:'review',minutes:4,text:'原题先找清题设中的传播方向，再按空间斜率判断质点运动，遮住答案复核。',questionIds:['old','p']};
 return {s,t,b,save};
}

test('fixed historical corrections are saved without creating new first answers or answer-block evidence',()=>{
 const {s,t,b,save}=recoveryFixture();
 answer(s,'old',{answer:1,error:'知识'},'2026-10-05',b);
 const attempts=structuredClone(s.attempts),before=stats(s,b,date);
 applyAction(s,b,save,date);
 assert.deepEqual(s.blockRecords[t.id+':review'].questionIds,['old','p']);
 assert.deepEqual(s.attempts,attempts);assert.deepEqual(stats(s,b,date),before);
 const ev=taskEvidence(s,t,date);assert.equal(ev.blocks.find(x=>x.id==='review').complete,true);assert.equal(ev.blocks.find(x=>x.id==='solve').complete,false);
 assert.throws(()=>answer(s,'old',{taskId:t.id,blockId:'solve'},date,b),/不在该任务/);
 assert.throws(()=>applyAction(s,b,{type:'completeTask',taskId:t.id,minutes:5,note:'只完成旧题订正',completed:true},date),/限时作答/);
 assert.equal(s.mastery.old.streak,0,'a written correction is not a transfer or mastery success');
});

test('review saving rejects duplicates, insufficient quantity and historical references from another block',()=>{
 const {s,t,b,save}=recoveryFixture();
 for(const [ids,error] of [[[],/至少2道/],[['old'],/至少2道/],[['old','old'],/重复/],[['other-old','p'],/本练习块/],[['foreign','p'],/本练习块/],[['p','p2'],/固定题目/],[null,/数组/]]){
  assert.throws(()=>applyAction(s,b,{...save,questionIds:ids},date),error);
 }
 const saved=t.referenceQuestionIds;t.referenceQuestionIds=[];
 assert.throws(()=>applyAction(s,b,save,date),/本练习块/);t.referenceQuestionIds=saved;
 assert.equal(s.points,0);assert.deepEqual(s.blockRecords,{});
 // A record imported with only part of the assigned work is not complete either.
 s.blockRecords[t.id+':review']={date,text:save.text,questionIds:['old']};
 assert.equal(taskEvidence(s,t,date).blocks.find(x=>x.id==='review').complete,false);
});

test('ordinary review can prioritize a current wrong question, and fragment units are not mistaken for question count',()=>{
 const {s,t,b,save}=recoveryFixture(),block=t.blocks[1];
 block.fixedReferences=false;block.questionIds=['p'];block.units=2;
 applyAction(s,b,{...save,questionIds:['p2']},date);
 assert.deepEqual(s.blockRecords[t.id+':review'].questionIds,['p2']);
 assert.equal(taskEvidence(s,t,date).blocks.find(x=>x.id==='review').complete,true);
 assert.throws(()=>applyAction(s,b,{...save,questionIds:['old']},date),/本练习块/);
});

test('unresolved corrections are a unique subset, persist on edits and do not block evidence completion',()=>{
 const {s,t,b,save}=recoveryFixture();
 for(const ids of [['other-old'],['old','old'],null,'old'])assert.throws(()=>applyAction(s,b,{...save,unresolvedQuestionIds:ids},date),/子集且不能重复/);
 assert.equal(s.points,0);
 applyAction(s,b,{...save,unresolvedQuestionIds:['old']},date);
 assert.deepEqual(s.blockRecords[t.id+':review'].unresolvedQuestionIds,['old']);
 assert.equal(taskEvidence(s,t,date).blocks.find(x=>x.id==='review').complete,true);
 const earned=s.points;applyAction(s,b,{...save,text:save.text+'仍然不确定原题方向，后续继续核查。'},date);
 assert.deepEqual(s.blockRecords[t.id+':review'].unresolvedQuestionIds,['old']);assert.equal(s.points,earned);
 applyAction(s,b,{...save,unresolvedQuestionIds:[]},date);
 assert.deepEqual(s.blockRecords[t.id+':review'].unresolvedQuestionIds,[]);assert.equal(s.points,earned);
});

test('fixed review UI keeps historical references and planner order despite current errors or stale selections',()=>{
 const {t}=recoveryFixture(),b=t.blocks[1],attempts=[{date,taskId:t.id,questionId:'p2',correct:false}];
 assert.deepEqual(reviewReferenceIds(t,b,{date,questionIds:['p2','p']},attempts,date),['old','p']);
 assert.deepEqual(reviewReferenceIds(t,{...b,fixedReferences:false,questionIds:['p']},null,attempts,date),['p2']);
 assert.deepEqual(reviewReferenceIds(t,{...b,fixedReferences:false,questionIds:['p']},{date:'2026-10-05',questionIds:['p']},attempts,date),['p2']);
});

test('plan migrations preserve a day already started through learning cards or output blocks alone',()=>{
 for(const kind of ['learning','output']){
  const s=seeded(),plan=s.plans[date];plan.plannerVersion=0;
  if(kind==='learning')s.learning.reviews.push({date,cardId:'lc-wave-01'});
  else s.blockRecords[task.id+':recall']={date,text:'已经闭卷完成公式回忆并记录，今天应保留原计划。'};
  assert.equal(ensurePlan(s,bank,date),plan);assert.equal(plan.plannerVersion,0);
 }
});
