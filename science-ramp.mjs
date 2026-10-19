// These dates open a gate; a calendar date never supplies evidence of improvement.
export const SCIENCE_STAGES=Object.freeze([
  {id:0,from:'2026-10-06',label:'恢复作答',physics:13,chemistry:11,total:24},
  {id:1,from:'2026-10-10',label:'接上设问',physics:15,chemistry:13,total:28},
  {id:2,from:'2026-10-16',label:'稳定提速',physics:17,chemistry:15,total:32},
  {id:3,from:'2026-10-23',label:'接近考场',physics:19,chemistry:17,total:36},
  {id:4,from:'2026-10-30',label:'80分钟挑战',physics:20,chemistry:20,total:40}
]);
const SUBJECTS=['physics','chemistry'],CHALLENGE_DATES=['2026-10-30','2026-11-03'];
const sum=xs=>xs.reduce((n,x)=>n+x,0),round=n=>Math.round(n*10)/10;
const addDays=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const median=xs=>{const a=[...xs].sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length?(a.length%2?a[i]:(a[i-1]+a[i])/2):null;};
const independent=a=>!a.hinted&&!a.assisted&&!a.usedHelp&&!a.reviewOf&&!a.repeat&&!a.isRetry&&!a.skipped;
const positive=n=>Number.isFinite(n)&&n>0;
const split=total=>({physics:total/2+1,chemistry:total/2-1,total});
const levelFor=total=>Math.max(0,Math.min(3,Math.floor((total-24)/4)));
const normalBudget=(total,actualPre)=>{const preMinutes=actualPre??(total<=24?8:total<=28?6:5);return {preMinutes,reviewMinutes:20,questionMinutes:95-preMinutes-20};};

// Recover the retained training target, not a temporary recovery/challenge count.
function retainedTarget(meta={}){
  const fallback=SCIENCE_STAGES[Math.max(0,Math.min(3,Math.floor(meta.level||0)))].total;
  const total=meta.trainingTotal??(!meta.challenge&&!meta.recovery?meta.total:fallback);
  return Number.isInteger(total)&&total>=20&&total<=36&&total%2===0?total:fallback;
}
function validReview(s,task,block,date){
  const r=s.blockRecords?.[task.id+':'+block.id];
  if(!r||r.date!==date||typeof r.text!=='string'||r.text.trim().length<(block.minChars||20))return null;
  const expected=Math.max(1,block.questionIds?.length||block.units||1),ids=r.questionIds||block.questionIds||[];
  if(!Array.isArray(ids))return null;
  const allowed=new Set([...(task.questionIds||[]),...(task.referenceQuestionIds||[])]),valid=[...new Set(ids)];
  if(valid.some(id=>!allowed.has(id)))return null; // Historical references must belong to this task's declared scope.
  return valid.length>=expected?{record:r,ids:valid}:null;
}

/** Pure policy. Only prior, actually attempted sessions can change the training target. */
export function scienceRamp(s,bank,date,options={}){
  const actualPre=Number.isFinite(options.preMinutes)&&options.preMinutes>=0&&options.preMinutes<=15?options.preMinutes:undefined;
  const byId=new Map(bank.filter(q=>q.official&&SUBJECTS.includes(q.subject)).map(q=>[q.id,q]));
  const history=(s.attempts||[]).filter(a=>a.date<date).map((a,index)=>({a,index}))
    .sort((x,y)=>x.a.date.localeCompare(y.a.date)||(x.a.at||'').localeCompare(y.a.at||'')||x.index-y.index).map(x=>x.a);
  const first=new Map();for(const a of history)if(!first.has(a.questionId))first.set(a.questionId,a);
  const corrections=[],runs=[];
  for(const d of Object.keys(s.plans||{}).filter(d=>d<date).sort()){
    const plan=s.plans[d],tasks=(plan.tasks||[]).filter(t=>SUBJECTS.includes(t.subject));
    // A recovery day can contain correction only. Its saved work must close
    // pending corrections even though it supplies no new speed/accuracy sample.
    let expectedReview=0,completedReview=0;const reviewedSubjects=new Set();
    for(const t of tasks)for(const b of t.blocks||[])if(b.kind==='review'){
      const weight=Math.max(1,b.units||b.questionIds?.length||1);expectedReview+=weight;
      const valid=validReview(s,t,b,d);if(valid){completedReview+=weight;reviewedSubjects.add(t.subject);corrections.push({...valid,date:d});}
    }
    const reviewCompletion=expectedReview?completedReview/expectedReview:0;
    const recallDone=reviewCompletion>=.9&&SUBJECTS.every(sub=>reviewedSubjects.has(sub));
    const assigned=new Map();
    for(const t of tasks)for(const b of t.blocks||[])if(b.kind==='questions')for(const id of b.questionIds||[])
      if(byId.get(id)?.subject===t.subject)assigned.set(id,{taskId:t.id,blockId:b.id});
    if(!assigned.size)continue;
    const attempts=[...assigned].map(([id,scope])=>history.find(a=>a.date===d&&a.questionId===id&&a.taskId===scope.taskId&&a.blockId===scope.blockId)).filter(Boolean);
    if(!attempts.length)continue; // Browsing a future plan is not a study session.
    const limit=sum(tasks.flatMap(t=>(t.blocks||[]).filter(b=>b.kind==='questions'&&(b.questionIds||[]).some(id=>byId.get(id)?.subject===t.subject))).map(b=>b.minutes||0));
    const subjects=Object.fromEntries(SUBJECTS.map(sub=>{
      const aa=attempts.filter(a=>byId.get(a.questionId)?.subject===sub&&first.get(a.questionId)===a&&independent(a));
      return [sub,{count:aa.length,correct:aa.filter(a=>a.correct).length,accuracy:aa.length?aa.filter(a=>a.correct).length/aa.length:null,seconds:aa.filter(a=>positive(a.seconds)).map(a=>a.seconds)}];
    }));
    const completion=attempts.filter(a=>!a.hinted&&!a.assisted&&!a.usedHelp&&!a.skipped).length/assigned.size;
    const seconds=sum(attempts.map(a=>positive(a.seconds)?a.seconds:0)),timed=attempts.every(a=>positive(a.seconds));
    const count=sum(SUBJECTS.map(sub=>subjects[sub].count)),accuracy=count?sum(SUBJECTS.map(sub=>subjects[sub].correct))/count:null;
    const fatigue=s.reports?.[d]?.fatigue??5,meta=plan.scienceRamp||{};
    const pass=completion>=.9&&timed&&seconds<=limit*60*1.05&&accuracy>=.75&&subjects.physics.accuracy>=.7&&subjects.chemistry.accuracy>=.75&&recallDone&&fatigue<=3;
    runs.push({date:d,assignedTotal:assigned.size,completion,seconds,limitMinutes:limit,subjects,accuracy,reviewCompletion,recallDone,fatigue,pass,level:meta.level||0,trainingTotal:retainedTarget(meta),challenge:!!meta.challenge,recovery:!!meta.recovery});
  }

  // Backlog means uncorrected errors, not the lifetime number of wrong attempts.
  // A saved correction closes the correction task, but does not certify transfer.
  const pending=new Map();
  for(const a of history){
    if(!byId.has(a.questionId))continue;
    if(!a.correct||a.skipped)pending.set(a.questionId,a);
    else if(!a.hinted&&!a.assisted&&!a.usedHelp)pending.delete(a.questionId);
    if(a.correct&&a.transferQualified&&a.reviewOf&&!a.hinted)pending.delete(a.reviewOf);
  }
  const latestCorrections=new Map();
  for(const c of corrections.sort((a,b)=>a.date.localeCompare(b.date)||(a.record.at||'').localeCompare(b.record.at||'')))for(const id of c.ids)latestCorrections.set(id,c);
  for(const [id,{record,date:d}] of latestCorrections){
    if(record.unresolvedQuestionIds?.includes(id))continue;
    const wrong=pending.get(id);
    if(wrong&&(d>wrong.date||(d===wrong.date&&(!record.at||!wrong.at||record.at>=wrong.at))))pending.delete(id);
  }
  const backlog=pending.size,last=runs.at(-1),recent=runs.filter(r=>!r.challenge&&!r.recovery).slice(-3);
  const maxLevel=Math.min(3,SCIENCE_STAGES.findLast(x=>x.from<=date)?.id||0),maxTotal=SCIENCE_STAGES[maxLevel].total;
  let trainingTotal=Math.min(maxTotal,last?.trainingTotal??24);
  const subjects=Object.fromEntries(SUBJECTS.map(sub=>{
    const count=sum(recent.map(r=>r.subjects[sub].count)),correct=sum(recent.map(r=>r.subjects[sub].correct));
    return [sub,{count,correct,accuracy:count?correct/count:null,medianSeconds:median(recent.flatMap(r=>r.subjects[sub].seconds))}];
  }));
  const count=sum(SUBJECTS.map(sub=>subjects[sub].count)),accuracy=count?sum(SUBJECTS.map(sub=>subjects[sub].correct))/count:null;
  const enough=recent.length===3&&SUBJECTS.every(sub=>subjects[sub].count>=20);
  const stable=recent.filter(r=>r.pass&&r.trainingTotal>=trainingTotal&&r.assignedTotal>=trainingTotal).length>=2;
  const eligible=enough&&stable&&recent.at(-1)?.pass&&accuracy>=.75&&subjects.physics.accuracy>=.7&&subjects.chemistry.accuracy>=.75&&backlog<=4&&last?.fatigue<=3&&!last?.recovery&&!last?.challenge;
  const forecast=target=>SUBJECTS.every(sub=>positive(subjects[sub].medianSeconds))?sum(SUBJECTS.map(sub=>target[sub]*subjects[sub].medianSeconds))/60:null;
  const two=runs.slice(-2),down=two.length===2&&two.every(r=>!r.challenge&&!r.recovery&&(r.completion<.8||SUBJECTS.some(sub=>r.subjects[sub].count>=5&&r.subjects[sub].accuracy<.65)));
  const afterChallenge=!!last?.challenge&&addDays(last.date,1)===date,highBacklog=backlog>=8;
  const recovery=afterChallenge||down||highBacklog;
  let promoted=false,reason='以你80分钟完成约25–30题为基线，先安排24题并留出20分钟订正。';
  if(last)reason='升级证据尚不足，保持已完成的训练档；日期只表示最早升级机会。';
  if(down){trainingTotal=Math.max(20,trainingTotal-2);reason='连续两次完成率或正确率不足，保留较低训练目标，今天先集中订正。';}
  const nextTotal=Math.min(maxTotal,trainingTotal+2),nextTarget=split(nextTotal),nextForecast=forecast(nextTarget);
  if(!recovery&&eligible&&nextTotal>trainingTotal){
    if(nextForecast!==null&&nextForecast<=normalBudget(nextTotal,actualPre).questionMinutes){trainingTotal=nextTotal;promoted=true;reason='最近3次的独立首答、订正与疲劳达到条件，实测中位配速支持加2题。';}
    else reason='正确率与订正已达标，但下一档预计首答超过时间预算；先保持题量练衔接。';
  }
  const challengeTarget={physics:20,chemistry:20,total:40},challengeForecast=forecast(challengeTarget);
  const challenge=!recovery&&CHALLENGE_DATES.includes(date)&&(actualPre===undefined||actualPre<=7)&&trainingTotal===36&&eligible&&recent.filter(r=>r.pass&&r.trainingTotal>=36&&r.assignedTotal>=36).length>=2&&backlog<=2&&challengeForecast!==null&&challengeForecast<=80;
  const level=levelFor(trainingTotal),normal=split(trainingTotal);
  let target=normal,budget=normalBudget(trainingTotal,actualPre);
  if(challenge){target=challengeTarget;budget={preMinutes:actualPre??3,questionMinutes:80,reviewMinutes:15-(actualPre??3)};reason='达到独立首答与配速门槛，今天做80分钟挑战，明天安排40分钟错题消化。';}
  if(recovery){
    target={physics:Math.max(7,Math.floor(normal.physics*.7)),chemistry:Math.max(6,Math.floor(normal.chemistry*.7))};target.total=target.physics+target.chemistry;
    budget={preMinutes:actualPre??5,questionMinutes:55-(actualPre??5),reviewMinutes:40};
    if(afterChallenge)reason='80分钟挑战后的复盘日，减少新题，40分钟处理漏题、错因与不同条件验证。';
    else if(highBacklog)reason=`还有${backlog}个未订正错点，今天先用40分钟消化，暂停加量。`;
  }
  return {...SCIENCE_STAGES[challenge?4:level],...target,...budget,level,trainingTotal,trainingPhysics:normal.physics,trainingChemistry:normal.chemistry,challenge,recovery,promoted,reason,budgetMinutes:95,runs:recent,backlog,backlogIds:[...pending.keys()],subjects,accuracy,enoughEvidence:enough,eligible,promotionCandidateTotal:nextTotal,promotionCandidatePredictedMinutes:nextForecast===null?null:round(nextForecast),predictedMinutes:forecast(target)===null?null:round(forecast(target)),baseline:'80分钟约25–30题（你的自报）',promotionRule:'最近3次常规训练，各科≥20道不同官方题的首次独立样本；至少2次达标且最近一次达标：完成≥90%、合并正确≥75%、物理≥70%、化学≥75%、订正≥90%、疲劳≤3、未订正错点≤4；下一档中位配速预测装得进预算。每次最多加2题。'};
}
