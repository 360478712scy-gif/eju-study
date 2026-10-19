import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scienceRamp} from '../science-ramp.mjs';
import {VERIFIED_PAIRS} from '../public/verified-pairs.js';
import {transferRelation} from '../public/review-policy.js';

const state=()=>({plans:{},attempts:[],blockRecords:{},reports:{}});
const levelFor=total=>Math.max(0,Math.floor((total-24)/4));
function run(s,bank,date,options={}){
  const total=options.total??24,physics=options.physics??total/2+1,chemistry=total-physics;
  const meta=options.meta||{level:levelFor(total),total,physics,chemistry,trainingTotal:total};
  const tasks=[];
  for(const [subject,count]of Object.entries({physics,chemistry})){
    const ids=[];
    for(let i=0;i<count;i++){
      const id=options.reuse?subject+'-repeat-'+i:date+'-'+subject+'-'+i;ids.push(id);
      if(!bank.some(q=>q.id===id))bank.push({id,subject,official:options.official!==false});
    }
    const t={id:date+'-'+subject,subject,questionIds:ids,blocks:[{id:'answer',kind:'questions',questionIds:ids,minutes:subject==='physics'?39:28},{id:'review',kind:'review',questionIds:ids.slice(0,2),units:2,minChars:20,minutes:10}]};tasks.push(t);
    const done=Math.floor(count*(options.completion??1));
    for(let i=0;i<done;i++)s.attempts.push({id:date+'-'+subject+'-attempt-'+i,date,questionId:ids[i],subject,taskId:options.wrongScope?'some-other-task':t.id,blockId:'answer',seconds:typeof options.seconds==='function'?options.seconds(subject,i):options.seconds??90,correct:options.correct?options.correct(subject,i):true,...options.attempt});
    if(options.review!==false)s.blockRecords[t.id+':review']={date,taskId:t.id,blockId:'review',text:'记录条件差异、关键依据，遮住说明后独立复做并核对结果。',questionIds:ids.slice(0,2),minutes:10};
  }
  s.plans[date]={date,tasks,scienceRamp:meta};s.reports[date]={fatigue:options.fatigue??2};return s.plans[date];
}
function ready(options={}){const s=state(),bank=[];for(const d of ['2026-10-07','2026-10-08','2026-10-09'])run(s,bank,d,options);return {s,bank};}
const invariant=cfg=>{assert.equal(cfg.total,cfg.physics+cfg.chemistry);assert.equal(cfg.preMinutes+cfg.questionMinutes+cfg.reviewMinutes,95);assert.ok(cfg.reviewMinutes>=(cfg.challenge?8:20));};

test('without performed sessions dates alone never promote; first day is 24 and 8+67+20',()=>{
  const s=state();s.plans['2026-10-29']={scienceRamp:{level:3,total:36},tasks:[]};
  for(const d of ['2026-10-06','2026-10-30','2026-11-03']){const cfg=scienceRamp(s,[],d);assert.equal(cfg.total,24);assert.equal(cfg.challenge,false);invariant(cfg);assert.match(cfg.baseline,/80分钟.*25–30/);}
});

test('three valid sessions promote by only two questions; an intermediate target persists',()=>{
  const {s,bank}=ready(),first=scienceRamp(s,bank,'2026-10-10');assert.equal(first.total,26);assert.equal(first.level,0);assert.equal(first.promoted,true);invariant(first);
  run(s,bank,'2026-10-10',{total:26,meta:first});const hold=scienceRamp(s,bank,'2026-10-11');assert.equal(hold.total,26);assert.equal(hold.promoted,false);
  run(s,bank,'2026-10-11',{total:26,meta:hold});const second=scienceRamp(s,bank,'2026-10-12');assert.equal(second.total,28);assert.equal(second.level,1);
  run(s,bank,'2026-10-12',{total:28,meta:second});run(s,bank,'2026-10-13',{total:28,meta:second});assert.equal(scienceRamp(s,bank,'2026-10-14').total,28,'date gate prevents a premature 30');
});

test('the next target must fit measured subject medians and the real preheat budget',()=>{
  const {s,bank}=ready({seconds:159});let cfg=scienceRamp(s,bank,'2026-10-10');assert.equal(cfg.total,26);assert.equal(cfg.promotionCandidatePredictedMinutes,68.9);
  cfg=scienceRamp(s,bank,'2026-10-10',{preMinutes:8});assert.equal(cfg.total,24);assert.match(cfg.reason,/首答超过/);assert.equal(cfg.questionMinutes,67);invariant(cfg);
  const slow=ready({seconds:168});cfg=scienceRamp(slow.s,slow.bank,'2026-10-10');assert.equal(cfg.total,24);assert.equal(cfg.promoted,false);
});

test('pacing uses medians while actual session overruns still block promotion',()=>{
  const {s,bank}=ready({seconds:(sub,i)=>i===0?1200:90});const cfg=scienceRamp(s,bank,'2026-10-10');
  assert.equal(cfg.subjects.physics.medianSeconds,90);assert.equal(cfg.subjects.chemistry.medianSeconds,90);assert.equal(cfg.promotionCandidatePredictedMinutes,39);assert.equal(cfg.total,24);assert.equal(cfg.runs.at(-1).pass,false);
});

test('missing reports, unrecorded correction, assistance, scope mismatch and nonofficial drills cannot unlock a stage',()=>{
  for(const options of [{review:false},{fatigue:4},{attempt:{hinted:true}},{attempt:{assisted:true}},{attempt:{usedHelp:true}},{attempt:{reviewOf:'previous'}},{attempt:{repeat:true}},{wrongScope:true},{official:false},{seconds:0}]){
    const {s,bank}=ready(options);assert.equal(scienceRamp(s,bank,'2026-10-10').promoted,false,JSON.stringify(options));
  }
  const {s,bank}=ready();delete s.reports['2026-10-09'];assert.equal(scienceRamp(s,bank,'2026-10-10').promoted,false);
});

test('repeated questions and retries do not manufacture new independent samples',()=>{
  const {s,bank}=ready({reuse:true});let cfg=scienceRamp(s,bank,'2026-10-10');assert.equal(cfg.subjects.physics.count,13);assert.equal(cfg.enoughEvidence,false);
  const fresh=ready();for(const a of [...fresh.s.attempts])fresh.s.attempts.push({...a,id:a.id+'retry',correct:true,seconds:1});cfg=scienceRamp(fresh.s,fresh.bank,'2026-10-10');assert.equal(cfg.subjects.physics.count,39);assert.equal(cfg.subjects.physics.medianSeconds,90);
});

test('first-ever attempts include prior unscoped errors and cannot be replaced by a successful scoped retry',()=>{
  const {s,bank}=ready();const a=s.attempts.find(x=>x.date==='2026-10-09'&&x.subject==='physics');s.attempts.unshift({...a,date:'2026-10-06',taskId:null,blockId:null,correct:false});
  const cfg=scienceRamp(s,bank,'2026-10-10');assert.equal(cfg.subjects.physics.count,38);
});

test('an unanswered, skipped or incorrect paper is not a completed independent paper',()=>{
  const {s,bank}=ready({completion:.75});const cfg=scienceRamp(s,bank,'2026-10-10');assert.equal(cfg.recovery,true);assert.ok(cfg.total<24);invariant(cfg);
  const skipped=ready({attempt:{skipped:true}});assert.equal(scienceRamp(skipped.s,skipped.bank,'2026-10-10').promoted,false);
});

test('strong chemistry cannot compensate for weak physics; latest poor work blocks promotion',()=>{
  const {s,bank}=ready({correct:(sub,i)=>sub==='chemistry'||i<8});const cfg=scienceRamp(s,bank,'2026-10-10');assert.equal(cfg.promoted,false);assert.equal(cfg.recovery,true);
  const good=ready();good.s.blockRecords['2026-10-09-physics:review'].text='未做';assert.equal(scienceRamp(good.s,good.bank,'2026-10-10').promoted,false);
});

test('eight uncorrected official errors force recovery and are not based on lifetime wrong counters',()=>{
  const {s,bank}=ready();for(let i=0;i<8;i++){const id='backlog-'+i;bank.push({id,subject:'physics',official:true});s.attempts.push({questionId:id,date:'2026-10-09',correct:false,seconds:120});}
  let cfg=scienceRamp(s,bank,'2026-10-10');assert.equal(cfg.backlog,8);assert.equal(cfg.recovery,true);assert.equal(cfg.reviewMinutes,40);assert.equal(cfg.questionMinutes,50);invariant(cfg);
  for(let i=0;i<8;i++)s.attempts.push({questionId:'backlog-'+i,date:'2026-10-09',correct:true,seconds:120});
  s.mastery=Object.fromEntries(bank.map(q=>[q.id,{wrong:20}]));cfg=scienceRamp(s,bank,'2026-10-10');assert.equal(cfg.backlog,0);assert.equal(cfg.recovery,false);
});

test('a saved correction closes the pending correction, while later new errors reopen it',()=>{
  const {s,bank}=ready();const id='2026-10-09-physics-0',a=s.attempts.find(x=>x.questionId===id);a.correct=false;a.at='2026-10-09T12:00:00Z';s.blockRecords['2026-10-09-physics:review'].at='2026-10-09T12:10:00Z';
  assert.equal(scienceRamp(s,bank,'2026-10-10').backlog,0);
  s.attempts.push({...a,id:'again',at:'2026-10-09T13:00:00Z'});assert.equal(scienceRamp(s,bank,'2026-10-10').backlog,1);
});

test('historical corrections accept only this task declared references and retain quantity checks',()=>{
  const {s,bank}=ready(),ids=['historical-physics-1','historical-physics-2'];
  for(const id of ids){bank.push({id,subject:'physics',official:true});s.attempts.push({questionId:id,date:'2026-10-06',correct:false,seconds:180});}
  const t=s.plans['2026-10-09'].tasks.find(x=>x.subject==='physics'),record=s.blockRecords[t.id+':review'];
  t.referenceQuestionIds=ids;t.blocks.find(b=>b.id==='review').questionIds=ids;record.questionIds=ids;
  let cfg=scienceRamp(s,bank,'2026-10-10');assert.equal(cfg.runs.at(-1).recallDone,true);assert.equal(cfg.backlog,0);
  record.unresolvedQuestionIds=[ids[0]];cfg=scienceRamp(s,bank,'2026-10-10');assert.deepEqual(cfg.backlogIds,[ids[0]]);delete record.unresolvedQuestionIds;
  for(const bad of [[ids[0]],[ids[0],ids[0]],[ids[0],'2026-10-09-chemistry-0'],[...ids,'2026-10-09-chemistry-0']]){
    record.questionIds=bad;cfg=scienceRamp(s,bank,'2026-10-10');assert.equal(cfg.runs.at(-1).recallDone,false,JSON.stringify(bad));assert.equal(cfg.backlog,2);
  }
  record.questionIds=ids;delete t.referenceQuestionIds;assert.equal(scienceRamp(s,bank,'2026-10-10').runs.at(-1).recallDone,false);
});

test('correction-only days can clear history; unresolved notes preserve existing errors without creating new ones',()=>{
  const {s,bank}=ready(),ids=['old-error-1','old-error-2','unattempted-reference'];
  for(const id of ids)bank.push({id,subject:'physics',official:true});
  for(const id of ids.slice(0,2))s.attempts.push({questionId:id,date:'2026-10-06',correct:false,seconds:180});
  const t={id:'2026-10-10-physics',subject:'physics',questionIds:[],referenceQuestionIds:ids,blocks:[{id:'review',kind:'review',questionIds:ids,units:3,minChars:20,minutes:40}]};
  s.plans['2026-10-10']={date:'2026-10-10',scienceRamp:{level:0,recovery:true,trainingTotal:24},tasks:[t]};
  const record={date:'2026-10-10',text:'逐项回忆关键条件，并闭卷复做，记录实际仍然没有解决的卡点。',questionIds:ids,unresolvedQuestionIds:[ids[0],ids[2]],minutes:40};s.blockRecords[t.id+':review']=record;
  let cfg=scienceRamp(s,bank,'2026-10-11');assert.deepEqual(cfg.backlogIds,[ids[0]]);assert.equal(cfg.runs.length,3);assert.equal(cfg.runs.at(-1).date,'2026-10-09');
  record.unresolvedQuestionIds=[];cfg=scienceRamp(s,bank,'2026-10-11');assert.equal(cfg.backlog,0);
  // A later explicit "still unresolved" must not be erased by an older note.
  const oldTask=s.plans['2026-10-09'].tasks.find(x=>x.subject==='physics');oldTask.referenceQuestionIds=ids.slice(0,2);oldTask.blocks.find(b=>b.id==='review').questionIds=ids.slice(0,2);s.blockRecords[oldTask.id+':review'].questionIds=ids.slice(0,2);
  record.unresolvedQuestionIds=[ids[0]];assert.deepEqual(scienceRamp(s,bank,'2026-10-11').backlogIds,[ids[0]]);
});

test('basic transfer drills cannot enlarge the official first-attempt time window',()=>{
  const {s,bank}=ready({seconds:(sub,i)=>i===0?1600:90});
  for(const plan of Object.values(s.plans))for(const t of plan.tasks){
    const id=t.id+'-basic';bank.push({id,subject:t.subject,official:false});t.questionIds.push(id);t.blocks.push({id:'transfer',kind:'questions',questionIds:[id],minutes:20});
    s.attempts.push({date:plan.date,questionId:id,subject:t.subject,correct:true,seconds:20,taskId:t.id,blockId:'transfer'});
  }
  const cfg=scienceRamp(s,bank,'2026-10-10');assert.equal(cfg.promoted,false);assert.equal(cfg.subjects.physics.count,39);
  for(const r of cfg.runs){assert.equal(r.limitMinutes,67);assert.equal(r.assignedTotal,24);assert.equal(r.pass,false);}
});

test('only the two scheduled challenge dates can issue 40; the next calendar day is recovery',()=>{
  const s=state(),bank=[];for(const d of ['2026-10-27','2026-10-28','2026-10-29'])run(s,bank,d,{total:36,seconds:100});
  const challenge=scienceRamp(s,bank,'2026-10-30');assert.equal(challenge.challenge,true);assert.equal(challenge.total,40);assert.equal(challenge.trainingTotal,36);assert.equal(challenge.questionMinutes,80);invariant(challenge);
  assert.equal(scienceRamp(s,bank,'2026-10-31').challenge,false);
  assert.equal(scienceRamp(s,bank,'2026-10-30',{preMinutes:8}).challenge,false,'80+8 leaves only 7 minutes for correction, below its minimum');
  run(s,bank,'2026-10-30',{total:40,physics:20,seconds:100,meta:challenge});const recover=scienceRamp(s,bank,'2026-10-31');assert.equal(recover.recovery,true);assert.equal(recover.trainingTotal,36);assert.equal(recover.reviewMinutes,40);invariant(recover);
  run(s,bank,'2026-10-31',{total:recover.total,physics:recover.physics,meta:recover});const resumed=scienceRamp(s,bank,'2026-11-01');assert.equal(resumed.recovery,false);assert.equal(resumed.trainingTotal,36);assert.equal(resumed.total,36);
});

test('challenge accepts real five-minute cards, preserves eight-minute correction minimum and rejects preheat above seven',()=>{
  const s=state(),bank=[];for(const d of ['2026-10-27','2026-10-28','2026-10-29'])run(s,bank,d,{total:36,seconds:100});
  for(const preMinutes of [5,7]){
    const cfg=scienceRamp(s,bank,'2026-10-30',{preMinutes});assert.equal(cfg.challenge,true);assert.equal(cfg.preMinutes,preMinutes);assert.equal(cfg.questionMinutes,80);assert.equal(cfg.reviewMinutes,15-preMinutes);invariant(cfg);
  }
  for(const preMinutes of [7.1,8,10]){const cfg=scienceRamp(s,bank,'2026-10-30',{preMinutes});assert.equal(cfg.challenge,false);assert.equal(cfg.reviewMinutes,20);invariant(cfg);}
  const cfg=scienceRamp(s,bank,'2026-10-30',{preMinutes:5});run(s,bank,'2026-10-30',{total:40,physics:20,seconds:100,meta:cfg});
  const next=scienceRamp(s,bank,'2026-10-31',{preMinutes:5});assert.equal(next.recovery,true);assert.equal(next.reviewMinutes,40);invariant(next);
});

test('a slow challenge prediction is refused despite correct answers',()=>{
  const s=state(),bank=[];for(const d of ['2026-10-27','2026-10-28','2026-10-29']){const p=run(s,bank,d,{total:36,seconds:125});p.tasks.forEach(t=>t.blocks[0].minutes=40);}
  const cfg=scienceRamp(s,bank,'2026-10-30');assert.equal(cfg.eligible,true);assert.equal(cfg.challenge,false);assert.equal(cfg.total,36);
});

test('future attempts, future plans and same-day activity cannot rewrite prior evidence',()=>{
  const {s,bank}=ready();const before=scienceRamp(s,bank,'2026-10-10');run(s,bank,'2026-10-10',{total:36});run(s,bank,'2026-11-02',{total:36});
  const after=scienceRamp(s,bank,'2026-10-10');assert.equal(after.total,before.total);assert.deepEqual(after.subjects,before.subjects);
});

test('small-budget practice cannot substitute for completing the current full training target',()=>{
  const s=state(),bank=[];for(const d of ['2026-10-07','2026-10-08','2026-10-09'])run(s,bank,d,{total:18,meta:{level:0,trainingTotal:24,total:24}});
  const cfg=scienceRamp(s,bank,'2026-10-10');assert.equal(cfg.enoughEvidence,true);assert.equal(cfg.promoted,false);assert.equal(cfg.total,24);
});

test('the latest retained target wins over an old high stage and recovery does not repeatedly downgrade it',()=>{
  const s=state(),bank=[];run(s,bank,'2026-10-23',{total:36});run(s,bank,'2026-10-24',{total:28,completion:.6});run(s,bank,'2026-10-25',{total:28,completion:.6});
  const cfg=scienceRamp(s,bank,'2026-10-26');assert.equal(cfg.trainingTotal,26);assert.equal(cfg.recovery,true);
  run(s,bank,'2026-10-26',{total:cfg.total,physics:cfg.physics,meta:cfg});const next=scienceRamp(s,bank,'2026-10-27');assert.equal(next.trainingTotal,26);assert.equal(next.recovery,false);assert.equal(next.total,26);
});

test('policy is pure and verified pairs reference real source pages without relying on coarse skills',()=>{
  const {s,bank}=ready(),snapshot=structuredClone(s);scienceRamp(s,bank,'2026-10-10');assert.deepEqual(s,snapshot);
  const official=JSON.parse(fs.readFileSync(new URL('../public/official-expanded.json',import.meta.url),'utf8'));
  assert.equal(VERIFIED_PAIRS.length,2);
  for(const pair of VERIFIED_PAIRS){const [a,b]=pair.ids.map(id=>official.find(q=>q.id===id));assert.ok(a&&b);assert.equal(a.subject,b.subject);for(const e of pair.evidence){const q=official.find(x=>x.id===e.questionId);assert.equal(q.pdf,e.pdf);assert.ok(q.pages.includes(e.page));}
    const relation=transferRelation({...a,verifiedTransferWith:[b.id]},b);assert.equal(relation.eligible,true);assert.equal(relation.demonstratesMastery,true);assert.equal(relation.verifiedBy,'authored-pair');
  }
});
