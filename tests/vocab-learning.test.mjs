import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBank} from '../bank.mjs';
import {initialState,applyAction,buildPlan,ensurePlan,taskEvidence,makeReport,recommend,addDays} from '../engine.mjs';
import {PLANNER_VERSION,reviewWorkload} from '../planner.mjs';
import {getVocabContent} from '../public/vocab-content.js';
import {normalizeVocabReading,gradeVocabAnswer,vocabModeAvailable,vocabProgressSummary,vocabBlockProgress,selectVocabIds} from '../public/vocab-learning.js';

const bank=loadBank(),date='2026-10-06';
const content=getVocabContent('vx140');
function answer(s,id='vx140',mode='reading',extra={},d=date){const c=getVocabContent(id);return applyAction(s,bank,{type:'vocabAnswer',attemptId:'v-'+(s.vocabulary?.attempts?.length||0),questionId:id,mode,response:mode==='reading'?c.reading:mode==='meaning'?c.meaningAnswer:c.cloze.answer,seconds:15,helped:false,...extra},d);}

test('reading normalizes width/script/space while preserving phonemic distinctions',()=>{
  assert.equal(normalizeVocabReading('　キョウ キュウ　'),'きょうきゅう');
  assert.equal(normalizeVocabReading('ｷﾞｮｳ　ｾｲ'),'ぎょうせい');
  assert.equal(normalizeVocabReading('ヴァー'),'ゔぁー');
  assert.ok(gradeVocabAnswer(getVocabContent('v19'),'reading','キョウキュウ').correct);
  assert.equal(gradeVocabAnswer(getVocabContent('v26'),'reading','けつきょく').correct,false);
  assert.equal(gradeVocabAnswer(getVocabContent('v19'),'reading','きょきゅう').correct,false);
  const loan={word:'一コース',reading:'いちこーす'};
  assert.equal(gradeVocabAnswer(loan,'reading','いちこす').correct,false);
  assert.equal(gradeVocabAnswer(content,'reading',content.word).correct,false);
  assert.match(gradeVocabAnswer(content,'reading',content.word).reason,/漢字|汉字/);
  assert.equal(vocabModeAvailable(getVocabContent('v25'),'reading'),false);
});

test('dictionary-backed equivalent readings are accepted without merging different word senses',()=>{
  for(const [id,readings] of [['vx096',['かくはん','こうはん','コウハン']],['vx258',['いぞん','いそん','イソン']]]){
    for(const reading of readings)assert.equal(gradeVocabAnswer(getVocabContent(id),'reading',reading).correct,true,id+' '+reading);
  }
  assert.equal(gradeVocabAnswer(getVocabContent('vx096'),'reading','かくばん').correct,false);
  const separation=getVocabContent('vx207');assert.match(separation.readingContext,/ごみ/);
  assert.equal(gradeVocabAnswer(separation,'reading','ぶんべつ').correct,true);
  assert.equal(gradeVocabAnswer(separation,'reading','ふんべつ').correct,false);
});

test('meaning and cloze are server graded with separate standard answers',()=>{
  const s=initialState();
  for(const mode of ['meaning','cloze']){
    const c=getVocabContent('vx290'),index=mode==='meaning'?c.meaningAnswer:c.cloze.answer;
    answer(s,'vx290',mode,{response:(index+1)%4,correct:true});
    const row=s.vocabulary.attempts.at(-1);
    assert.equal(row.correct,false);assert.equal(row.expected,(mode==='meaning'?c.meaningOptions:c.cloze.options)[index]);
    assert.equal(row.source,'server-auto-grade');assert.ok(row.explanation.length>5);
  }
  assert.equal(s.attempts.length,0);assert.equal(Object.keys(s.mastery).length,0);
  assert.equal(s.vocabulary.mastery.vx290.reading,undefined);
  assert.throws(()=>answer(s,'v2','meaning'),/有效选项|已核验/);
});

test('empty response requires explicit cannot-recall and counts as a real wrong attempt',()=>{
  const s=initialState();assert.throws(()=>answer(s,'vx140','reading',{response:''}),/明确选择想不起来/);
  assert.equal(s.vocabulary.attempts.length,0);
  answer(s,'vx140','reading',{response:null,skipped:true});
  assert.equal(s.vocabulary.attempts[0].correct,false);assert.equal(s.vocabulary.attempts[0].response,null);
  assert.equal(s.vocabulary.attempts[0].reviewDue,'2026-10-07');
  assert.throws(()=>answer(s,'vx140','reading',{seconds:-1}),/时间无效/);
  assert.throws(()=>answer(s,'v25','reading',{response:'ただし'}),/已核验/);
  assert.throws(()=>answer(s,'vx140','meaning',{response:'0'}),/有效选项/);
  assert.throws(()=>answer(s,'vx140','reading',{response:{huge:'not text'},skipped:true}),/假名/);
});

test('idempotency retains one row, one interval and unrelated vocabulary reports',()=>{
  const s=initialState();s.vocabulary.reports={manual:{text:'保留我的汇报'}};
  answer(s,'vx140','reading',{attemptId:'same'});const before=JSON.stringify(s);
  answer(s,'vx140','reading',{attemptId:'same',response:'誤答'});
  assert.equal(JSON.stringify(s),before);assert.equal(s.vocabulary.reports.manual.text,'保留我的汇报');
  assert.deepEqual(s.vocabulary.attempts[0].contentSnapshot,getVocabContent('vx140'));
  const restored=JSON.parse(JSON.stringify(s));assert.equal(restored.vocabulary.attempts[0].expected,content.reading);
});

test('audio-only observations explain legacy hinted recognition without rewriting raw attempts',()=>{
  const s=initialState();s.attempts.push({id:'legacy',questionId:'vx140',subject:'japanese',topic:'vocab',date,correct:true,hinted:true});
  s.vocabulary.observations=[{id:'input-mode',date,text:'40题都只听音没有看题干，39题正确。',inputMode:'audio-only',taskId:null,source:'self-report'}];
  const before=JSON.stringify(s.attempts),report=makeReport(s,bank,date);
  assert.match(report,/音→义辨认（未看题干）/);assert.match(report,/40题都只听音没有看题干/);assert.match(report,/不自动表示 AI 求助/);
  assert.equal(JSON.stringify(s.attempts),before);assert.equal(vocabProgressSummary(s,date).byMode.reading.count,0);
});

test('wrong then same-day success cannot replace first recall or lengthen spacing',()=>{
  const s=initialState();answer(s,'vx140','reading',{response:'わからない'});
  answer(s);assert.equal(s.vocabulary.mastery.vx140.reading.streak,0);assert.equal(s.vocabulary.mastery.vx140.reading.due,'2026-10-07');
  const summary=vocabProgressSummary(s,date).byMode.reading;
  assert.equal(summary.count,1);assert.equal(summary.correct,0);assert.equal(summary.todayAttempts,2);
  answer(s,'vx140','reading',{},'2026-10-07');assert.equal(s.vocabulary.mastery.vx140.reading.due,'2026-10-08');
  answer(s,'vx140','reading',{},'2026-10-08');assert.equal(s.vocabulary.mastery.vx140.reading.due,'2026-10-11');
  answer(s,'vx140','reading',{},'2026-10-09');assert.equal(s.vocabulary.mastery.vx140.reading.due,'2026-10-11','early practice cannot advance review date');
  answer(s,'vx140','reading',{},'2026-10-11');assert.equal(s.vocabulary.mastery.vx140.reading.due,'2026-10-18');
  answer(s,'vx140','reading',{},'2026-10-18');assert.equal(s.vocabulary.mastery.vx140.reading.due,'2026-11-01');
});

test('heard answers never advance independent mastery, even with a same-day retry',()=>{
  const s=initialState();answer(s,'vx140','reading',{helped:true});answer(s);
  assert.equal(s.vocabulary.mastery.vx140.reading.streak,0);
  assert.equal(vocabProgressSummary(s,date).byMode.reading.count,0);
  answer(s,'vx140','meaning');assert.equal(vocabProgressSummary(s,date).byMode.meaning.count,1);
  assert.equal(s.vocabulary.mastery.vx140.reading.streak,0);
  const legacy=initialState();legacy.attempts.push({id:'old',questionId:'vx140',date,subject:'japanese',topic:'vocab',correct:true,hinted:true});
  assert.equal(vocabProgressSummary(legacy,date).byMode.reading.count,0);assert.deepEqual(legacy.vocabulary.mastery,{});
});

test('default day supports 24/12/4/8 actual responses within the original 15 minutes',()=>{
  const p=buildPlan(initialState(),bank,date),v=p.tasks.find(t=>t.topic==='vocab');
  assert.equal(p.plannerVersion,PLANNER_VERSION);assert.equal(p.budget,240);assert.equal(p.audit.status,'covered');
  assert.deepEqual(v.blocks.map(b=>[b.id,b.kind,b.mode,b.units,b.minutes]),[
    ['reading','vocab','reading',24,6],['meaning','vocab','meaning',12,3],['cloze','vocab','cloze',4,2],['repair','vocab','reading',8,4]
  ]);
  assert.equal(v.estimatedMinutes,15);assert.equal(v.vocabulary.responses,48);
  assert.equal(v.questionIds.length,new Set(v.blocks.flatMap(b=>b.questionIds)).size);
  assert.ok(v.blocks.filter(b=>b.mode==='reading').flatMap(b=>b.questionIds).every(id=>/\p{Script=Han}/u.test(getVocabContent(id).word)));
  assert.ok(v.blocks.every(b=>b.questionIds.every(id=>vocabModeAvailable(getVocabContent(id),b.mode))));
  assert.equal(p.tasks.find(t=>t.topic==='listening').minutes,45);assert.equal(p.tasks.find(t=>t.topic==='reading').minutes,20);assert.equal(p.tasks.find(t=>t.topic==='report').minutes,5);
  const inflated=structuredClone(v);inflated.minutes=50;inflated.blocks.forEach(b=>b.minutes=12.5);
  assert.equal(reviewWorkload({budget:50,tasks:[inflated]},bank).status,'needs-work');
});

test('selection prioritizes old errors/due recall and includes approximately eight new words',()=>{
  const s=initialState(),oldIds=bank.filter(q=>q.topic==='vocab'&&vocabModeAvailable(getVocabContent(q.id),'reading')).slice(0,20).map(q=>q.id);
  for(const id of oldIds)s.attempts.push({questionId:id,subject:'japanese',topic:'vocab',date:'2026-10-05',correct:id!=='v1',hinted:true});
  answer(s,'vx140','reading',{response:'こかく'},'2026-10-05');
  const ids=selectVocabIds(s,bank,date,{mode:'reading',count:24,oldTarget:16});
  const seen=new Set([...oldIds,'vx140']);assert.equal(ids.filter(id=>seen.has(id)).length,16);assert.equal(ids.filter(id=>!seen.has(id)).length,8);
  assert.ok(ids.includes('vx140'));assert.ok(ids.includes('v1'));
  assert.ok(!ids.some(id=>!vocabModeAvailable(getVocabContent(id),'reading')));
  const normal=buildPlan(initialState(),bank,date),changed=buildPlan(s,bank,date);
  assert.deepEqual(changed.allocations,normal.allocations);assert.equal(changed.tasks.find(t=>t.topic==='listening').minutes,normal.tasks.find(t=>t.topic==='listening').minutes);
  assert.deepEqual(recommend(s,bank,{date,fatigue:2,available:240}).allocations,recommend(initialState(),bank,{date,fatigue:2,available:240}).allocations);
});

test('vocabulary evidence needs the exact assigned mode and block, never text or free practice',()=>{
  const s=initialState(),task=ensurePlan(s,bank,date).tasks[0],reading=task.blocks[0],id=reading.questionIds[0];
  answer(s,id);assert.equal(taskEvidence(s,task,date).completedMinutes,0);
  assert.throws(()=>applyAction(s,bank,{type:'saveBlock',taskId:task.id,blockId:reading.id,text:'已经全都掌握'.repeat(20),minutes:6},date),/通过答题/);
  assert.throws(()=>answer(s,id,'meaning',{taskId:task.id,blockId:reading.id}),/对应词汇/);
  assert.throws(()=>answer(s,'v2','reading',{taskId:task.id,blockId:reading.id}),/对应词汇/);
  assert.throws(()=>answer(s,id,'reading',{taskId:task.id}),/同时指定/);
  assert.throws(()=>applyAction(s,bank,{type:'answer',attemptId:'legacy',questionId:id,answer:0,error:'无',taskId:task.id,blockId:reading.id},date),/答题块/);
  for(const b of task.blocks)for(const questionId of b.questionIds)answer(s,questionId,b.mode,{taskId:task.id,blockId:b.id});
  assert.equal(vocabBlockProgress(s,task,reading,date).completed,24);
  assert.equal(taskEvidence(s,task,date).complete,true);assert.equal(s.attempts.length,0);
  assert.equal(s.vocabulary.attempts.filter(a=>a.blockId==='repair').every(a=>a.helped&&!a.independent&&!a.intervalAdvanced),true);
  assert.equal(s.vocabulary.mastery[id].reading.streak,1,'repair preserves the original first independent pass');
  const complete={type:'completeTask',taskId:task.id,minutes:12.5,note:'读音复测后仍有两个混淆词',completed:true};
  applyAction(s,bank,complete,date);const points=s.points;applyAction(s,bank,complete,date);assert.equal(s.points,points);
  assert.equal(s.records[task.id].minutes,12.5);assert.match(makeReport(s,bank,date),/自报学习 12.5 分钟/);
  assert.match(makeReport(s,bank,date),/词汇分项/);assert.match(makeReport(s,bank,date),/已包含在任务自报分钟内，不重复累加/);
});

test('empty-but-explicit recall answers complete only their real block and same-id replay does not double time',()=>{
  const s=initialState(),task=ensurePlan(s,bank,date).tasks[0],block=task.blocks[0];
  for(const questionId of block.questionIds)answer(s,questionId,'reading',{taskId:task.id,blockId:block.id,response:'',skipped:true,seconds:3});
  const row=s.vocabulary.attempts.at(-1),before=s.points;
  answer(s,row.questionId,row.mode,{attemptId:row.id,taskId:task.id,blockId:block.id,seconds:500});
  assert.equal(vocabBlockProgress(s,task,block,date).actualSeconds,72);assert.equal(s.points,before);
  assert.equal(taskEvidence(s,task,date).completedMinutes,6);assert.equal(taskEvidence(s,task,date).complete,false);
  assert.throws(()=>applyAction(s,bank,{type:'completeTask',taskId:task.id,minutes:6,note:'只完成首轮',completed:true},date),/任务尚缺产出/);
});

test('legacy completed/started days are preserved, supplement answers do not rewrite them',()=>{
  for(const activity of ['attempt','record','block','learning','vocab']){
    const s=initialState(),old={plannerVersion:3,date,budget:15,tasks:[{id:date+'-legacy-vocab',subject:'japanese',topic:'vocab',minutes:15,questionIds:['v1'],blocks:[{id:'answer',kind:'questions',questionIds:['v1'],minutes:15}]}]};s.plans[date]=structuredClone(old);
    if(activity==='attempt')s.attempts.push({questionId:'v1',date,subject:'japanese',topic:'vocab',correct:true,hinted:true});
    if(activity==='record')s.records.old={date,completed:true,minutes:15};
    if(activity==='block')s.blockRecords.old={date,text:'保留旧产出'};
    if(activity==='learning')s.learning.reviews.push({cardId:'old',date});
    if(activity==='vocab')answer(s);
    assert.deepEqual(ensurePlan(s,bank,date),old,activity);
    answer(s,'vx290','reading',{taskId:null,blockId:null});assert.deepEqual(s.plans[date],old,activity+' supplement');
  }
  const s=initialState();s.plans[date]={plannerVersion:3,date,tasks:[]};assert.equal(ensurePlan(s,bank,date).plannerVersion,PLANNER_VERSION);
  const future=addDays(date,1);s.plans[future]={plannerVersion:3,date:future,tasks:[],marker:'keep'};answer(s,'vx290','reading',{},future);
  applyAction(s,bank,{type:'report',fatigue:2,available:240,note:'今天读音开始练习，明天按计划继续。'},date);assert.equal(s.plans[future].marker,'keep');
});

test('all remaining dates and small budgets keep an honest vocabulary workload',()=>{
  for(let i=0;i<33;i++){const p=buildPlan(initialState(),bank,addDays(date,i)),v=p.tasks.find(t=>t.topic==='vocab');assert.equal(p.tasks.reduce((n,t)=>n+t.minutes,0),p.budget);assert.ok(v.estimatedMinutes<=v.minutes*1.2);assert.ok(!p.audit.issues.some(e=>e.taskId===v.id));}
  const s=initialState();s.coachPlans=[{fromDate:date,toDate:date,allocations:{japanese:15,math:15,physics:15,chemistry:15},focus:{},note:'短日'}];
  const p=buildPlan(s,bank,date);assert.equal(p.budget,60);assert.equal(p.tasks[0].minutes,5);assert.equal(p.tasks[0].estimatedMinutes,5);
});
