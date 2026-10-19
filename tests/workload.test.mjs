import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadBank} from '../bank.mjs';
import {initialState,buildPlan,ensurePlan,addDays} from '../engine.mjs';
import {reviewWorkload,PLANNER_VERSION} from '../planner.mjs';
import {timing} from '../public/review-policy.js';
const bank=loadBank(),date='2026-10-06';

test('a 55-minute label on three questions cannot pass the workload review',()=>{
  const ids=bank.filter(q=>q.official&&q.subject==='physics').slice(0,3).map(q=>q.id);
  const audit=reviewWorkload({budget:55,tasks:[{id:'bad',title:'物理',minutes:55,questionIds:ids,blocks:[{kind:'questions',questionIds:ids,minutes:55,title:'虚高时间'}]}]},bank);
  assert.equal(audit.status,'needs-work');assert.equal(audit.rows[0].supportedMinutes,6);
});
test('the first day assigns full official workload and explicit review outputs',()=>{
  const p=buildPlan(initialState(),bank,date),task=sub=>p.tasks.find(t=>t.subject===sub);
  assert.equal(p.budget,240);assert.equal(p.tasks.length,7);assert.equal(p.audit.status,'covered');
  assert.equal(task('physics').coverage['official-science'],13);
  assert.equal(task('chemistry').coverage['official-science'],11);
  assert.ok(task('math').coverage['math-group']>=4);
  const vocab=p.tasks.find(t=>t.topic==='vocab');assert.deepEqual(vocab.blocks.map(b=>b.questionIds.length),[24,12,4,8]);assert.equal(vocab.vocabulary.responses,48);assert.equal(vocab.questionIds.length,new Set(vocab.blocks.flatMap(b=>b.questionIds)).size);
  for(const t of p.tasks)assert.ok(t.blocks.every(b=>b.kind==='questions'?b.questionIds.length>0:b.units>0&&b.instruction.length>10));
});
test('33 days advance real history, retain honest repetition counts, and check supply',()=>{
  const s=initialState(),rows=[];
  for(let i=0;i<33;i++){
    const d=addDays(date,i),p=buildPlan(s,bank,d);
    assert.equal(p.tasks.reduce((n,t)=>n+t.minutes,0),p.budget);
    assert.equal(p.audit.issues.filter(x=>x.severity==='error').length,0,d+JSON.stringify(p.audit.issues));
    if(i<30)assert.equal(p.budget,240);else assert.ok(p.budget<=(i===30?180:i===31?150:90));
    const reading=p.tasks.find(t=>t.topic==='reading');if(reading)for(const id of reading.questionIds){const q=bank.find(q=>q.id===id);if(q.passageId)assert.equal(reading.questionIds.filter(i=>bank.find(q=>q.id===i).passageId===q.passageId).length,q.sharedPassageQuestionCount);}
    const ids=p.tasks.flatMap(t=>t.questionIds);assert.equal(new Set(ids).size,ids.length,'same-day duplicate '+d);
    rows.push({date:d,budget:p.budget,estimatedMinutes:p.audit.estimatedMinutes,tasks:p.audit.rows,issues:p.audit.issues});
    for(const t of p.tasks)for(const id of t.questionIds){
      const q=bank.find(q=>q.id===id),prior=s.attempts.findLast(a=>a.questionId===id);
      if(prior&&q.topic!=='vocab')assert.ok((Date.parse(d)-Date.parse(prior.date))/86400000>=7,'unexpected early repeat '+id);
      s.attempts.push({questionId:id,date:d,subject:q.subject,topic:q.topic,correct:true,seconds:['physics','chemistry'].includes(q.subject)?80*60/27.5:timing(q,[],bank).estimatedSeconds});
      s.mastery[id]={due:addDays(d,7),last:d,streak:1};
    }
  }
  const groups={};for(const q of bank){const key=q.topic==='vocab'?'vocabulary':q.official?q.subject==='japanese'?q.topic:q.subject:'originalShort';const attempts=s.attempts.filter(a=>a.questionId===q.id);groups[key]||={bank:0,attempts:0,distinctUsed:0};groups[key].bank++;groups[key].attempts+=attempts.length;if(attempts.length)groups[key].distinctUsed++;}
  assert.ok(groups.physics.attempts>350);assert.ok(groups.physics.distinctUsed>=170);
  fs.writeFileSync(new URL('./workload-audit.json',import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),scenario:'All assigned answers at baseline independent pace; every prior day retained. Forecast, not user study evidence.',groups,rows},null,2));
});
test('unexpected fast science pace flags a real gap instead of hiding it behind a timer',()=>{
  const s=initialState(),qs=bank.filter(q=>q.official&&q.subject==='physics'&&q.selfGrade).slice(0,5);
  s.attempts=qs.map(q=>({questionId:q.id,date:'2026-10-05',correct:true,seconds:60,subject:'physics',topic:q.topic}));
  const normal=buildPlan(initialState(),bank,date),fast=buildPlan(s,bank,date);
  assert.equal(fast.tasks.find(t=>t.subject==='physics').questionIds.length,normal.tasks.find(t=>t.subject==='physics').questionIds.length);assert.ok(fast.audit.issues.some(x=>x.taskId.endsWith('-physics')));assert.ok(fast.tasks.find(t=>t.subject==='physics').reserveQuestionIds.length>0);
  assert.equal(fast.budget,240);
});
test('legacy untouched plans migrate but started plans and records are preserved',()=>{
  const s=initialState();s.plans[date]={date,tasks:[],budget:240};assert.equal(ensurePlan(s,bank,date).plannerVersion,PLANNER_VERSION);
  const started=initialState();started.plans[date]={date,tasks:[],budget:240};started.records.legacy={date,minutes:10,note:'保留'};
  assert.equal(ensurePlan(started,bank,date).plannerVersion,undefined);assert.equal(started.records.legacy.note,'保留');
});
test('a small recovery budget has no unaccounted extra minutes',()=>{
  const s=initialState();s.coachPlans=[{fromDate:date,toDate:date,allocations:{japanese:15,math:15,physics:15,chemistry:15},focus:{},note:'短日保持'}];
  const p=buildPlan(s,bank,date);assert.equal(p.budget,60);assert.ok(p.tasks.every(t=>t.minutes>0));assert.ok(p.audit.estimatedMinutes<=72,JSON.stringify(p.audit));
});

test('real card minutes stay inside the 95-minute science budget',()=>{
  const p=buildPlan(initialState(),bank,date),science=p.tasks.filter(t=>['physics','chemistry'].includes(t.subject));
  const pre=science.flatMap(t=>t.blocks).filter(b=>b.kind==='learning').reduce((n,b)=>n+b.minutes,0);
  const review=science.flatMap(t=>t.blocks).filter(b=>b.kind==='review').reduce((n,b)=>n+b.minutes,0);
  assert.equal(p.scienceRamp.preMinutes,pre);assert.equal(review,20);
  assert.equal(pre+review+p.scienceRamp.timedMinutes,95);
});

test('an eligible 40-question challenge fits 80 real first-pass minutes around actual learning cards',()=>{
  const s=initialState(),pools=Object.fromEntries(['physics','chemistry'].map(sub=>[sub,bank.filter(q=>q.subject===sub&&q.official)]));
  for(const [dayIndex,d]of ['2026-10-27','2026-10-28','2026-10-29'].entries()){
    const tasks=[];
    for(const [sub,count] of [['physics',19],['chemistry',17]]){
      const qs=pools[sub].slice(dayIndex*count,(dayIndex+1)*count),id=d+'-'+sub,ids=qs.map(q=>q.id);
      tasks.push({id,subject:sub,questionIds:ids,blocks:[{id:'answer',kind:'questions',questionIds:ids,minutes:sub==='physics'?39:28},{id:'review',kind:'review',questionIds:ids.slice(0,2),units:2,minChars:20,minutes:10}]});
      s.attempts.push(...qs.map(q=>({questionId:q.id,date:d,subject:sub,taskId:id,blockId:'answer',correct:true,seconds:100})));
      s.blockRecords[id+':review']={date:d,text:'已逐题记录原先卡点、正确条件、关键关系并遮住说明独立复做。',questionIds:ids.slice(0,2)};
    }
    s.plans[d]={tasks,scienceRamp:{level:3,trainingTotal:36,total:36}};s.reports[d]={fatigue:2};
  }
  const p=buildPlan(s,bank,'2026-10-30'),science=p.tasks.filter(t=>['physics','chemistry'].includes(t.subject));
  assert.equal(p.scienceRamp.challenge,true);assert.equal(p.scienceRamp.assignedTotal,40);
  assert.equal(p.scienceRamp.timedMinutes,80);assert.equal(p.budget,240);
  assert.equal(science.flatMap(t=>t.blocks).reduce((n,b)=>n+b.minutes,0),95);
  assert.ok(p.scienceRamp.preMinutes>=4);assert.ok(p.scienceRamp.reviewMinutes>=8);
});

test('recovery draws actual unresolved past questions without counting those as new work',()=>{
  const s=initialState(),old=bank.filter(q=>q.official&&q.subject==='physics').slice(0,8);
  s.attempts=old.map(q=>({questionId:q.id,date:'2026-10-05',subject:'physics',correct:false,seconds:180}));
  const p=buildPlan(s,bank,date),physics=p.tasks.find(t=>t.subject==='physics'),review=physics.blocks.find(b=>b.kind==='review');
  assert.equal(p.scienceRamp.recovery,true);assert.equal(p.scienceRamp.reviewMinutes,40);
  assert.equal(review.fixedReferences,true);assert.deepEqual(new Set(review.questionIds),new Set(old.map(q=>q.id)));
  assert.deepEqual(new Set(physics.referenceQuestionIds),new Set(review.questionIds));
  assert.ok(physics.referenceQuestionIds.every(id=>!physics.questionIds.includes(id)));
  assert.equal(p.tasks.filter(t=>['physics','chemistry'].includes(t.subject)).flatMap(t=>t.blocks).reduce((n,b)=>n+b.minutes,0),95);
});
