import {PLANNER_VERSION} from '../planner.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildHintRequest,finalizeHintResult,previewCoachPlan,finalizeCoachPlan} from '../ai/coach.mjs';
import {initialState,applyAction} from '../engine.mjs';
import {achievements} from '../rewards.mjs';
import {QUESTIONS} from '../public/content.js';
import {enrichBank} from '../public/transfer.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const official=JSON.parse(fs.readFileSync(new URL('../public/official.json',import.meta.url)));
const bank=enrichBank([...official,...QUESTIONS]);
const input={attempt:'我听到了转折，但不知道最后决定。',level:1};
const date='2026-10-06';
const proposal={fromDate:'2026-10-07',toDate:'2026-10-07',allocations:{japanese:80,math:65,physics:55,chemistry:40},focus:{physics:'wave'},note:'保持听力练习，按题设给定变量推进，记录卡住的衔接。'};
const state=()=>{const s=initialState();s.today=date;s.reports[date]={date,available:240,fatigue:2,note:'今天按照题组练习，物理读图仍然不够熟练，明天继续订正。',completion:1};return s;};

test('official listening hints receive script pages and a specific question boundary',()=>{
 const q=official.find(q=>q.id==='o-2018_1-l13'),request=buildHintRequest(q,input,root);
 assert.equal(request.contentMode,'script-images');assert.equal(request.images.length,q.transcriptImages.length);
 assert.ok(request.images.every(p=>p.includes('script')));assert.match(request.prompt,/"listeningNumber":"13"/);assert.match(request.prompt,/没有实际听到音频/);
});

test('authored listening uses the available text, while missing scripts cannot cause invented content',()=>{
 const q=QUESTIONS.find(q=>q.topic==='listening'&&q.transcript),request=buildHintRequest(q,input,root);
 assert.equal(request.contentMode,'script-text');assert.ok(request.prompt.includes(q.transcript));
 const missing=buildHintRequest({id:'unknown',topic:'listening',audio:'/missing.wav',prompt:'请听录音'},input,root);
 assert.equal(missing.contentMode,'method-only');assert.equal(missing.images.length,0);
 const guarded=finalizeHintResult({observation:'我听过对话',hint:'选第二项，因为他要买票',checkQuestion:'听明白了吗'},missing.contentMode);
 assert.match(guarded.observation,/未分析录音内容/);assert.ok(!guarded.hint.includes('第二项'));assert.ok(!guarded.hint.includes('买票'));
});

test('plan preview actually runs the deterministic scheduler without mutating records',()=>{
 const s=state(),before=JSON.stringify(s),preview=previewCoachPlan(s,bank,proposal);
 assert.equal(JSON.stringify(s),before);assert.equal(preview.budget,240);assert.equal(preview.reportMinutes,5);
 assert.equal(preview.tasks.reduce((n,t)=>n+t.minutes,0),240);assert.ok(preview.tasks.every(t=>t.blocks.length>0));assert.ok(preview.audit.rows.length>0);
 assert.equal(preview.tasks.find(t=>t.topic==='report').minutes,5);
});

test('empty supply remains needs-work and precise unsupported instructions are rejected',()=>{
 const s=state(),result=finalizeCoachPlan(s,[],{diagnosis:'缺少题目。',plan:proposal});
 assert.equal(result.readiness,'needs-work');assert.equal(result.preview.ready,false);assert.ok(result.audit.issues.some(i=>i.severity==='error'));assert.match(result.preview.notice,/待补题/);
 assert.throws(()=>finalizeCoachPlan(s,bank,{diagnosis:'调整任务。',plan:{...proposal,note:'数学做1道题，听力做5道题。'}}),/精确题数/);
});

test('fatigue cap is enforced even when a requested allocation is valid in general',()=>{
 const s=state();s.reports[date].fatigue=5;s.reports[date].available=120;
 assert.throws(()=>finalizeCoachPlan(s,bank,{diagnosis:'减少任务',plan:proposal}),/可用时间/);
});

test('bridge successes, empty reports and untrusted timer records unlock no achievements',()=>{
 const s=initialState();s.attempts=Array.from({length:3},(_,i)=>({questionId:'bridge'+i,reviewOf:'original'+i,correct:true,hinted:false,transferQualified:false,reflection:'看懂了'}));
 s.records.fake={completed:true};s.reports=Object.fromEntries(Array.from({length:7},(_,i)=>['day'+i,{note:'',completion:1}]));s.focusSessions=Array.from({length:5},(_,i)=>({id:String(i),minutes:25}));
 const badges=achievements(s);for(const id of ['first','transfer','recall','focus','reflection'])assert.equal(badges.find(b=>b.id===id).unlocked,false,id);
 s.attempts.forEach(a=>a.transferQualified=true);assert.equal(achievements(s).find(b=>b.id==='transfer').unlocked,true);
});

test('new criteria preserve already earned historical badges without granting new ones',()=>{
 const s=initialState();s.earned['achievement-first']=5;assert.equal(achievements(s).find(b=>b.id==='first').unlocked,true);assert.equal(achievements(s).find(b=>b.id==='reflection').unlocked,false);
});

test('decimal self-reported block minutes and selected review questions are retained',()=>{
 const s=state(),task={id:'task',subject:'physics',questionIds:['p1'],minutes:2,blocks:[{id:'review',kind:'review',questionIds:['p1'],title:'订正',minutes:2,minChars:20}]};
 s.plans[date]={plannerVersion:PLANNER_VERSION,date,budget:2,tasks:[task]};
 const action={type:'saveBlock',taskId:'task',blockId:'review',questionIds:['p1'],minutes:.1,text:'这题首先要确定波的传播方向，然后根据此处斜率确定质点的运动方向。'};
 applyAction(s,[],action,date);assert.equal(s.blockRecords['task:review'].minutes,.1);assert.deepEqual(s.blockRecords['task:review'].questionIds,['p1']);
 assert.throws(()=>applyAction(s,[],{...action,questionIds:['outside']},date),/当前任务/);
});
