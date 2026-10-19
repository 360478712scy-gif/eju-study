import test from 'node:test';
import assert from 'node:assert/strict';
import {learningSession,applyLearningAction,learningProgress} from '../learning.mjs';

const date='2026-10-06';
const card=(id,subject,topic)=>({id,subject,topic,skill:topic+'-specific',title:id+'知识卡',recallPrompt:'闭卷写出关键关系',answer:'关系与成立条件',keyPoints:['先看条件','再代入'],workedExample:{prompt:'已知条件如何求值？',steps:['列式','代入'],answer:'2'},pitfalls:['不要忘记条件'],terms:[{ja:'条件',reading:'じょうけん',zh:'条件',context:'条件を確認する'}],check:{prompt:'迁移到不同数值后结果为？',options:['2','3','4','5'],answer:2,explanation:'先列式再代入'},estimatedSeconds:120,metadataSource:'test-syllabus',sourceNote:'原创复习内容'});
const cards=[card('m1','math','trig'),card('m2','math','trig'),card('m3','math','integral'),card('p1','physics','wave'),card('p2','physics','wave'),card('p3','physics','electric'),card('c1','chemistry','organic'),card('c2','chemistry','organic'),card('c3','chemistry','purify')];
const state=()=>({mastery:{untouched:{streak:7}},records:{},plans:{[date]:{focus:{math:'trig',physics:'wave',chemistry:'organic'}}}});
const action=(id,extra={})=>({type:'learningAnswer',cardId:id,recallText:'先检查适用条件，再写关系式并核对单位与符号。',recallRating:'remembered',checkAnswer:2,userNote:'我容易漏掉条件，之后先把条件写在左边。',seconds:30,requestId:id+'-first',...extra});

test('daily queue has two cards per science subject and no hidden time extension',()=>{
 const s=state(),before=JSON.stringify(s),session=learningSession(s,cards,date);
 assert.equal(session.cardIds.length,6);assert.deepEqual(session.targets,{math:2,physics:2,chemistry:2});assert.equal(session.estimatedMinutes,12);assert.deepEqual(session.missing,[]);assert.equal(JSON.stringify(s),before);
 const capped=learningSession(s,cards,date,{minutes:8});assert.equal(capped.estimatedMinutes,8);assert.equal(capped.cardIds.length,4);assert.ok(capped.missing.length>0);
});

test('overdue knowledge outranks the current chapter, while fresh cards still match the topic',()=>{
 const s=state();s.learning={reviews:[],notebook:[],sessions:{},cardState:{m3:{due:'2026-10-05',streak:1}}};
 const session=learningSession(s,cards,date);assert.equal(session.cardIds[0],'m3');assert.equal(session.selectionReasons.m3,'到期回忆');assert.ok(session.cardIds.includes('p1'));
});

test('recall is mandatory but forgetting is valid and no minimum timer is imposed',()=>{
 const s=state(),before=JSON.stringify(s);assert.throws(()=>applyLearningAction(s,cards,action('m1',{recallText:''}),date),/先写下/);assert.equal(JSON.stringify(s),before);
 applyLearningAction(s,cards,action('m1',{recallText:'不记得',recallRating:'forgot',seconds:0}),date);
 assert.equal(s.learning.cardState.m1.due,'2026-10-07');assert.equal(s.learning.cardState.m1.streak,0);assert.equal(s.learning.reviews[0].fastTrack,false);
});

test('only remembered and correct independent checks progress across distinct dates',()=>{
 const s=state();applyLearningAction(s,cards,action('m1'),date);assert.equal(s.learning.cardState.m1.streak,1);assert.equal(s.learning.cardState.m1.due,'2026-10-07');
 applyLearningAction(s,cards,action('m1',{requestId:'again'}),date);assert.equal(s.learning.cardState.m1.streak,1);assert.equal(s.learning.cardState.m1.due,'2026-10-07');
 applyLearningAction(s,cards,action('m1',{requestId:'day2'}),'2026-10-07');assert.equal(s.learning.cardState.m1.due,'2026-10-10');
 applyLearningAction(s,cards,action('m1',{requestId:'day5'}),'2026-10-10');assert.equal(s.learning.cardState.m1.due,'2026-10-17');
 applyLearningAction(s,cards,action('m1',{requestId:'day12'}),'2026-10-17');assert.equal(s.learning.cardState.m1.due,'2026-10-31');
 assert.deepEqual(s.mastery,{untouched:{streak:7}});
});

test('wrong, partial recall and assisted checks schedule tomorrow without claiming mastery',()=>{
 for(const extra of [{checkAnswer:0},{recallRating:'partial'},{usedHelp:true},{recallText:'不记得',recallRating:'remembered'}]){
  const s=state();applyLearningAction(s,cards,action('m1',extra),date);assert.equal(s.learning.cardState.m1.streak,0);assert.equal(s.learning.cardState.m1.due,'2026-10-07');assert.equal(s.learning.reviews[0].passed,false);
 }
 const s=state();applyLearningAction(s,cards,action('m1',{checkAnswer:0}),date);applyLearningAction(s,cards,action('m1',{requestId:'correction'}),date);assert.equal(s.learning.cardState.m1.streak,0);
});

test('idempotent submissions create one notebook entry per card/date with complete snapshots',()=>{
 const s=state(),a=action('m1');applyLearningAction(s,cards,a,date);applyLearningAction(s,cards,a,date);assert.equal(s.learning.reviews.length,1);assert.equal(s.learning.notebook.length,1);
 applyLearningAction(s,cards,action('m1',{requestId:'retry',userNote:'',recallText:'第二次回忆我补充了关键条件。'}),date);
 const entry=s.learning.notebook[0];assert.equal(s.learning.notebook.length,1);assert.equal(entry.attemptsToday,2);assert.equal(entry.history.length,2);assert.equal(entry.history[0].recallText,a.recallText);assert.equal(entry.userNote,a.userNote);assert.deepEqual(entry.cardSnapshot,cards[0]);assert.equal(entry.check.correct,true);assert.equal(entry.check.selectedAnswer,2);
 applyLearningAction(s,cards,action('m1',{requestId:'tomorrow'}),'2026-10-07');assert.equal(s.learning.notebook.length,2);
});

test('editing a personal note does not rewrite the lesson or the original recall record',()=>{
 const s=state();applyLearningAction(s,cards,action('p1'),date);const entry=s.learning.notebook[0],snapshot=structuredClone(entry.cardSnapshot),history=structuredClone(entry.history);
 applyLearningAction(s,cards,{type:'learningNote',entryId:entry.id,userNote:'补充：传播方向和振动方向不同。'},date);
 assert.deepEqual(s.learning.notebook[0].cardSnapshot,snapshot);assert.deepEqual(s.learning.notebook[0].history,history);assert.match(s.learning.notebook[0].userNote,/传播方向/);
});

test('daily selection stays stable and completion is separate from card-check success',()=>{
 const s=state(),session=learningSession(s,cards,date);
 for(const [i,id] of session.cardIds.entries())applyLearningAction(s,cards,action(id,{requestId:'complete-'+id,...i===0?{checkAnswer:0}:{} }),date);
 assert.deepEqual(learningSession(s,cards,date).cardIds,session.cardIds);
 const progress=learningProgress(s,cards,date);assert.equal(progress.completed,6);assert.equal(progress.total,6);assert.equal(progress.passed,5);assert.equal(progress.complete,true);assert.equal(progress.estimatedMinutes,12);assert.equal(progress.actualMinutes,3);
});

test('JSON export/restore preserves notebooks and their content even when a card leaves the bank',()=>{
 const s=state();applyLearningAction(s,cards,action('m1'),date);const restored=JSON.parse(JSON.stringify(s));
 assert.deepEqual(learningProgress(restored,cards,date),learningProgress(s,cards,date));assert.deepEqual(restored.learning.notebook,s.learning.notebook);
 assert.equal(learningSession(restored,[],date).cards.length,6);applyLearningAction(restored,[],action('m1',{requestId:'restored'}),'2026-10-07');assert.equal(restored.learning.notebook.length,2);
});

test('invalid answers and mismatched idempotency identifiers preserve existing evidence',()=>{
 const s=state();applyLearningAction(s,cards,action('m1'),date);const before=JSON.stringify(s);
 assert.throws(()=>applyLearningAction(s,cards,action('m1',{requestId:'bad',checkAnswer:99}),date),/应用题选项/);assert.equal(JSON.stringify(s),before);
 assert.throws(()=>applyLearningAction(s,cards,action('p1',{requestId:'m1-first'}),date),/另一张卡片/);assert.equal(JSON.stringify(s),before);
});

test('the planner-selected cards take priority and are frozen exactly on first submission',()=>{
 const s=state();s.plans[date].tasks=[{subject:'math',topic:'integral',blocks:[{id:'recall',kind:'learning',cardIds:['m3'],minutes:2}]},{subject:'physics',topic:'electric',blocks:[{id:'recall',kind:'learning',cardIds:['p3'],minutes:2}]},{subject:'chemistry',topic:'purify',blocks:[{id:'recall',kind:'learning',cardIds:['c3'],minutes:2}]}];
 assert.deepEqual(learningSession(s,cards,date).cardIds,['m3','p3','c3']);
 applyLearningAction(s,cards,action('m3'),date);assert.deepEqual(s.learning.sessions[date].cardIds,['m3','p3','c3']);
 assert.equal(learningProgress(s,cards,date).total,3);assert.equal(learningProgress(s,cards,date).completed,1);
});
