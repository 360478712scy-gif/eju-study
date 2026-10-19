import {REWARDS,achievements} from './rewards.mjs';
import {reviewQueue} from './public/transfer.js';
import {PROFILE,SUBJECTS,TOPICS,QUESTIONS} from './public/content.js';
import {timing,transferRelation} from './public/review-policy.js';
export const keys=Object.keys(SUBJECTS);
export function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function addDays(d,n){return new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
export function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&addDays(d,0)===d;}
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function initialState(){return {version:1,revision:0,profile:{...PROFILE,background:'高考约580分，实验班背景，难题能力尚可；主要是知识遗忘、EJU引导式填空不适应与速度慢',trainingMode:'知识唤醒与题型迁移'},plans:{},records:{},blockRecords:{},attempts:[],mastery:{},reports:{},adjustments:[],redemptions:[],points:0,earned:{},drafts:{},timer:null,coachPlans:[],scores:[],preferences:{volume:0.22,track:'music-01'}};}
export function stage(date){if(date<='2026-10-06')return '起点诊断';if(date<='2026-10-17')return '唤醒与题型适应';if(date<='2026-10-28')return '限时应用';if(date<='2026-11-04')return '稳定发挥';return '轻量收尾';}
export function topics(date){if(date<='2026-10-10')return {math:'trig',physics:'wave',chemistry:'organic'};if(date<='2026-10-14')return {math:'integral',physics:'electric',chemistry:'purify'};if(date<='2026-10-19')return {math:'integral',physics:'electric',chemistry:'organic'};if(date<='2026-10-26')return {math:'integral',physics:'magnetic',chemistry:'purify'};return {math:'integral',physics:'wave',chemistry:'organic'};}
export function scaleBudget(total,base={japanese:80,math:65,physics:55,chemistry:40}){let out={},used=0;keys.forEach((k,i)=>{out[k]=i===keys.length-1?total-used:Math.round(total*base[k]/Object.values(base).reduce((a,b)=>a+b,0));used+=out[k];});return out;}
function pick(s,bank,date,subject,topic,count){let pool=bank.filter(q=>q.subject===subject&&(q.topic===topic||q.topics?.includes(topic)));const day=Math.floor(Date.parse(date)/86400000);pool.sort((a,b)=>{const rank=q=>{const m=s.mastery[q.id];return m?.due<=date&&q.topic==='vocab'?0:!m?(q.official?1:2):3;};return rank(a)-rank(b)||((bank.indexOf(a)+day*3)%Math.max(1,bank.length))-((bank.indexOf(b)+day*3)%Math.max(1,bank.length));});return pool.slice(0,count).map(q=>q.id);}
export function buildPlan(s,bank,date){assert(validDate(date),'日期不正确');if(date>=s.profile.examDate)return {date,stage:'考试与后续',budget:0,tasks:[],reason:'本轮备考结束；历史记录与题库仍可使用。'};
const idx=Math.max(0,Math.floor((Date.parse(date)-Date.parse(s.profile.startDate))/86400000));
let budget=date>='2026-11-05'?(date==='2026-11-07'?90:150):idx%7===6?120:s.profile.minutes;
let allocations=scaleBudget(budget),focus=topics(date),reason=idx%7===6?'每周减量日：保留复习，留出恢复时间。':'先短时闭卷唤醒，再练官方题的设问路线。日语80、数学65、物理55、化学40分钟。';
const adj=s.adjustments.findLast(x=>x.date===date&&!x.reverted);if(adj){allocations=adj.allocations;budget=Object.values(allocations).reduce((a,b)=>a+b,0);focus={...focus,...adj.focus};reason=adj.reason;}
const coach=s.coachPlans.findLast(p=>p.fromDate<=date&&p.toDate>=date&&!p.reverted);if(coach){allocations=coach.allocations;budget=Object.values(allocations).reduce((a,b)=>a+b,0);focus={...focus,...coach.focus};reason='已应用你与教练确认的计划：'+coach.note;}
let jm=allocations.japanese;const vocab=Math.max(1,Math.round(jm/4)),listen=Math.max(1,Math.round(jm/2)),reading=jm-vocab-listen;
const writing=(idx%7===2||idx%7===5)&&jm>=60;
const specs=[['vocab','japanese','vocab',vocab,'词汇回忆','先回忆再揭晓，优先复习到期词。',6],['listening','japanese','listening',writing?listen-10:listen,'听懂关键转折','首听作答 → 定位漏听 → 看原文 → 遮住再听。',2],['math','math',focus.math,allocations.math,'数学 · '+(TOPICS[focus.math]||'综合'),'8分钟公式唤醒 → 限时填空链 → 标出超时步骤。沿题目给定变量解题。',3],['physics','physics',focus.physics,allocations.physics,'物理 · '+(TOPICS[focus.physics]||'综合'),'先唤醒公式；圈日文条件，限时读图、列式和判断选项。',3],['chemistry','chemistry',focus.chemistry,allocations.chemistry,'化学 · '+(TOPICS[focus.chemistry]||'综合'),'名称双向唤醒；限时辨认正确/错误设问，逐项判断反应与分离依据。',3],['reading','japanese',writing?'writing':'reading',writing?reading+10:reading,writing?'30分钟记述':'阅读找依据',writing?'限时写作并保存原文；发给教练批改，不自动估分。':'做题后标出原文依据和错误选项的问题。',1]];
const tasks=specs.filter(x=>x[3]>0).map(([id,subject,topic,minutes,title,method,count])=>({id:date+'-'+id,subject,topic,minutes,title,method,questionIds:topic==='writing'?[]:pick(s,bank,date,subject,topic,budget<=150?Math.min(2,count):count)}));
// Maintenance is inside existing study time, never added on top.
if(idx%3===2&&budget>150){for(const sub of ['math','physics','chemistry']){const task=tasks.find(t=>t.subject===sub);const extra=pick(s,bank,date,sub,'mixed',1).find(id=>!task.questionIds.includes(id));if(extra)task.questionIds[task.questionIds.length-1]=extra;}}
const reviews=reviewQueue(s,bank,date).filter(r=>r.questionId);for(const task of tasks){task.reviewLinks={};const related=reviews.filter(r=>bank.find(q=>q.id===r.questionId)?.subject===task.subject&&(task.subject!=='japanese'||bank.find(q=>q.id===r.questionId)?.topic===task.topic)).slice(0,Math.min(2,task.questionIds.length));for(const [i,r] of related.entries()){task.questionIds=task.questionIds.filter(id=>id!==r.questionId);task.questionIds.splice(Math.min(i,task.questionIds.length),0,r.questionId);task.questionIds=task.questionIds.slice(0,budget<=150?2:task.subject==='japanese'?(task.topic==='vocab'?6:2):3);task.reviewLinks[r.questionId]=r.originalId;}}
if(adj?.speedMode){const task=tasks.find(t=>t.subject==='math');task.questionIds=task.questionIds.slice(0,2);task.method='本次减少新题：先按空格编号做一轮，约90秒无进展先标记；回收后计时复走卡住的一段。总时长不增加。';}
return {date,stage:stage(date),budget,allocations,tasks,reason};}
export function ensurePlan(s,bank,date){if(!s.plans[date])s.plans[date]=buildPlan(s,bank,date);return s.plans[date];}
function award(s,id,n){if(!s.earned[id]){s.earned[id]=n;s.points+=n;}}
function firstAttempts(s,date){
 const seen=new Set(),out=[];
 for(const a of s.attempts){if(a.date>date||seen.has(a.questionId))continue;seen.add(a.questionId);out.push(a);}
 return out;
}
function sampleStats(items){
 const independent=items.filter(a=>!a.hinted&&!a.reviewOf&&!a.repeat&&!a.assisted);
 return {count:independent.length,correct:independent.filter(a=>a.correct).length,assisted:items.filter(a=>a.hinted||a.assisted).length,firstCount:items.length,accuracy:independent.length?Math.round(100*independent.filter(a=>a.correct).length/independent.length):null};
}
export function stats(s,bank,date){
 const from=addDays(date,-6),first=firstAttempts(s,date).filter(a=>a.date>=from),out={};
 for(const sub of keys){const aa=first.filter(a=>a.subject===sub),all=s.attempts.filter(a=>a.subject===sub&&a.date>=from&&a.date<=date);out[sub]={...sampleStats(aa),repeated:all.length-aa.length,domains:{}};
  if(sub==='japanese')for(const topic of ['vocab','listening','reading'])out[sub].domains[topic]=sampleStats(aa.filter(a=>a.topic===topic));
  out[sub].official=sampleStats(aa.filter(a=>bank.find(q=>q.id===a.questionId)?.official));
 }
 return out;
}
export function recommend(s,bank,report){
 const date=addDays(report.date,1);let base=scaleBudget(report.available),reason=[];
 if(report.fatigue>=4){base=scaleBudget(Math.max(60,Math.floor(report.available*.8)));reason.push('疲劳较高，明天减量约20%，保留听力与订正');}
 const recent=Object.values(s.reports).filter(r=>r.date<=report.date).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2);
 if(report.fatigue<4&&recent.length===2&&recent.every(r=>r.completion<.65)){base=scaleBudget(Math.max(60,Math.floor(report.available*.8)));reason.push('连续两次有效任务完成不足65%，先降低任务量，不补叠积压');}
 const from=addDays(report.date,-6),first=firstAttempts(s,report.date).filter(a=>a.date>=from&&!a.hinted&&!a.reviewOf&&!a.repeat&&!a.assisted),ss=stats(s,bank,report.date);
 // Vocabulary quizzes cannot establish listening or reading proficiency.
 const jp=sampleStats(first.filter(a=>a.subject==='japanese'&&['listening','reading'].includes(a.topic)));
 const measured=keys.filter(k=>(k==='japanese'?jp:ss[k]).count>=5).sort((a,b)=>(a==='japanese'?jp:ss[a]).accuracy-(b==='japanese'?jp:ss[b]).accuracy);
 const metric=k=>k==='japanese'?jp:ss[k];
 if(measured.length>=2&&metric(measured[0]).accuracy<65&&metric(measured.at(-1)).accuracy>=80){const weak=measured[0],strong=measured.at(-1),floor=strong==='japanese'?50:25,delta=Math.min(15,Math.max(0,base[strong]-floor));base[strong]-=delta;base[weak]+=delta;if(delta)reason.push(`${SUBJECTS[weak]}不同题首次独立正确率${metric(weak).accuracy}%，从${SUBJECTS[strong]}调入${delta}分钟`);}
 const focus={};for(const sub of ['math','physics','chemistry']){const counts={};first.filter(a=>a.subject===sub&&!a.correct).forEach(a=>counts[a.topic]=(counts[a.topic]||0)+1);const item=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];if(item&&item[1]>=2){focus[sub]=item[0];reason.push(`${SUBJECTS[sub]}先订正${TOPICS[item[0]]||item[0]}，依据${item[1]}道不同题的首次错误`);}}
 const speedSubjects=[],speedEvidence={};
 for(const sub of keys){const timed=first.filter(a=>a.subject===sub&&a.correct&&a.seconds>0&&(sub!=='japanese'||a.topic!=='vocab'));
  const slow=timed.filter(a=>{const q=bank.find(q=>q.id===a.questionId);return q&&a.seconds>timing(q,[],bank).baselineSeconds;});
  if(timed.length>=5&&slow.length/timed.length>=.35){speedSubjects.push(sub);speedEvidence[sub]={count:timed.length,slow:slow.length,ratio:slow.length/timed.length};reason.push(`${SUBJECTS[sub]}独立做对但超过试行配速：${slow.length}/${timed.length}道，在该科原预算内练衔接与两轮作答`);}}
 if(date>='2026-11-05'){const cap=date==='2026-11-07'?90:150;if(Object.values(base).reduce((a,b)=>a+b,0)>cap)base=scaleBudget(cap,base);reason.push('考前收尾保持减量');}
 return {id:'adjust-'+report.date,date,allocations:base,focus,speedMode:false,speedSubjects,speedEvidence,reason:reason.join('；')||'不同题的首次独立样本不足或表现稳定，保持原比例，继续积累有效证据。',createdAt:new Date().toISOString(),kind:'local-rules'};
}

export function taskBlocks(task){
 if(Array.isArray(task.blocks)&&task.blocks.length)return task.blocks;
 return task.topic==='writing'?[{id:'writing',kind:'writing',minutes:task.minutes,minChars:100,title:task.title}]:[{id:'questions',kind:'questions',questionIds:task.questionIds||[],minutes:task.minutes,title:task.title}];
}
export function taskEvidence(s,task,date){
 const blocks=taskBlocks(task).map(block=>{let complete=false,reason='';
  if(block.kind==='questions'){
   const ids=block.questionIds||[],missing=ids.filter(id=>!s.attempts.some(a=>a.date===date&&a.taskId===task.id&&a.blockId===block.id&&a.questionId===id));
   complete=ids.length>0&&!missing.length;reason=ids.length?`尚有${missing.length}题未在本练习块提交`:'此练习块尚无题目';
  }else{
   const record=s.blockRecords?.[task.id+':'+block.id],report=block.kind==='report'?s.reports[date]:null;
   const text=record?.date===date?record.text:report?.note||'';
   const minChars=Number.isInteger(block.minChars)?block.minChars:block.kind==='writing'?100:20;
   complete=typeof text==='string'&&text.trim().length>=minChars;reason=`需保存至少${minChars}字的${block.kind==='writing'?'作文':block.kind==='review'?'订正':block.kind==='recall'?'闭卷回忆':'复盘'}产出`;
  }
  return {id:block.id,kind:block.kind,title:block.title||block.id,minutes:block.minutes||0,complete,reason:complete?'':reason};
 });
 return {complete:blocks.length>0&&blocks.every(b=>b.complete),blocks,missing:blocks.filter(b=>!b.complete).map(b=>({blockId:b.id,title:b.title,reason:b.reason})),completedMinutes:blocks.filter(b=>b.complete).reduce((n,b)=>n+b.minutes,0),totalMinutes:blocks.reduce((n,b)=>n+b.minutes,0)};
}
function awardBlocks(s,task,date){for(const block of taskEvidence(s,task,date).blocks)if(block.complete)award(s,'block-'+task.id+':'+block.id,3);}
function elapsedTimer(t,now){return Math.min(t.total,Math.max(0,t.elapsedSeconds||0)+(t.running&&Number.isFinite(t.resumedAt)?Math.max(0,(now-t.resumedAt)/1000):0));}
export function validateCoach(p){assert(p&&validDate(p.fromDate)&&validDate(p.toDate)&&p.fromDate<=p.toDate,'计划日期无效');assert(p.fromDate>=PROFILE.startDate&&p.toDate<PROFILE.examDate,'计划日期须在本轮备考期间');assert(keys.every(k=>Number.isInteger(p.allocations?.[k])&&p.allocations[k]>=15&&p.allocations[k]<=180),'每科时间须为15—180分钟整数');assert(Object.values(p.allocations).length===4&&Object.values(p.allocations).reduce((a,b)=>a+b,0)<=240,'每日总时长不能超过240分钟');assert(typeof p.note==='string'&&p.note.length<=2000,'请填写不超过2000字的调整说明');for(const [k,v] of Object.entries(p.focus||{}))assert(({math:['trig','integral','mixed'],physics:['wave','electric','magnetic','mixed'],chemistry:['purify','organic','mixed']}[k]||[]).includes(v),'专题名称无效');return {...p,id:'coach-'+Date.now(),reverted:false};}
export function applyAction(s,bank,a,date=today()){
 const byId=id=>bank.find(q=>q.id===id),getTask=id=>ensurePlan(s,bank,date).tasks.find(t=>t.id===id);
 if(a.type==='completeTask'){
  const task=getTask(a.taskId);assert(task,'没有这个今日任务');assert(Number.isFinite(a.minutes)&&a.minutes>=1&&a.minutes<=240,'实际学习分钟须在1—240之间');assert(typeof a.note==='string'&&a.note.trim().length>=2&&a.note.length<=3000,'请简单写下完成了什么或卡在哪里');
  if(a.completed){const evidence=taskEvidence(s,task,date);assert(evidence.complete,'任务尚缺产出：'+evidence.missing.map(b=>b.title+'（'+b.reason+'）').join('；'));}
  s.records[a.taskId]={taskId:a.taskId,date,subject:task.subject,minutes:Math.round(a.minutes),note:a.note,completed:!!a.completed,source:'self-report',at:new Date().toISOString()};
  if(a.completed){awardBlocks(s,task,date);award(s,'task-'+a.taskId,10);}
 }
 else if(a.type==='saveBlock'){
  const task=getTask(a.taskId);assert(task,'没有这个今日任务');const block=taskBlocks(task).find(b=>b.id===a.blockId);assert(block&&block.kind!=='questions','这个练习块请通过答题提交产出');
  const minChars=Number.isInteger(block.minChars)?block.minChars:block.kind==='writing'?100:20;
  assert(typeof a.text==='string'&&a.text.trim().length>=minChars&&a.text.length<=20000,`请保存至少${minChars}字、最多20000字的实际产出`);assert(Number.isFinite(a.minutes)&&a.minutes>=1&&a.minutes<=240,'请填写1—240分钟的实际学习时间');
  s.blockRecords ||= {};s.blockRecords[a.taskId+':'+a.blockId]={taskId:a.taskId,blockId:a.blockId,text:a.text,minutes:Math.round(a.minutes),source:'self-report',date,at:new Date().toISOString()};
  if(block.kind==='writing')s.drafts['writing-'+date]=a.text;
  awardBlocks(s,task,date);
 }
 else if(a.type==='answer'){
  const q=byId(a.questionId);assert(q,'题目不存在');assert(typeof a.attemptId==='string'&&a.attemptId.length>0&&a.attemptId.length<100,'缺少作答编号');if(s.attempts.some(x=>x.id===a.attemptId))return s;
  assert(['知识','记忆','读题','计算','时间','听音','逻辑','引导衔接','无'].includes(a.error),'错因无效');
  let task=null,block=null;if(a.taskId||a.blockId){assert(typeof a.taskId==='string'&&typeof a.blockId==='string','任务答题需要同时指定任务和练习块');task=getTask(a.taskId);assert(task,'没有这个今日任务');block=taskBlocks(task).find(b=>b.id===a.blockId);assert(block?.kind==='questions'&&block.questionIds?.includes(q.id),'这道题不在该任务的答题块中');}
  let correct;if(q.selfGrade){assert(typeof a.correct==='boolean','请核对官方答案后自评');correct=a.correct;assert(typeof a.response==='string'&&a.response.trim().length>0,'先填写作答过程');}else{assert(Number.isInteger(a.answer)&&a.answer>=0&&a.answer<q.options.length,'请选择一个选项');correct=a.answer===q.answer;}
  assert(a.seconds===undefined||(Number.isFinite(a.seconds)&&a.seconds>=0&&a.seconds<=14400),'作答时间无效');
  let original=null,relation=null;if(a.reviewOf&&a.reviewOf!==q.id){original=byId(a.reviewOf);relation=transferRelation(original,q);assert(original&&s.mastery[a.reviewOf]&&relation.eligible,'迁移题与原题缺少已核验的细考点关系');}
  const previous=s.attempts.filter(x=>x.questionId===q.id),prior=s.mastery[q.id]||{streak:0,wrong:0},independent=!a.hinted,sameDay=previous.some(x=>x.date===date);
  const streak=correct&&independent?(sameDay?prior.streak:prior.streak+1):0;
  const due=correct&&independent&&sameDay?prior.due:addDays(date,correct&&independent?([1,3,7,14][Math.min(Math.max(streak-1,0),3)]):1);
  s.mastery[q.id]={...prior,streak,wrong:prior.wrong+(!correct&&!previous.some(x=>x.date===date&&!x.correct)?1:0),due,last:date};
  const transferQualified=!!relation?.demonstratesMastery&&correct&&independent&&previous.length===0;
  const row={id:a.attemptId,questionId:q.id,subject:q.subject,topic:q.topic,date,correct,answer:a.answer??null,response:String(a.response||'').slice(0,5000),error:correct?'无':a.error,obstacle:a.error,seconds:Math.round(a.seconds||0),overtime:(a.seconds||0)>timing(q,[],bank).baselineSeconds,note:String(a.note||'').slice(0,2000),at:new Date().toISOString(),selfGrade:!!q.selfGrade,hinted:!!a.hinted,reflection:'',reviewOf:a.reviewOf||null,taskId:task?.id||null,blockId:block?.id||null,repeat:previous.length>0,firstAttempt:previous.length===0,transferKind:relation?.kind||null,transferQualified};
  s.attempts.push(row);
  if(original){const m=s.mastery[original.id],advance=transferQualified&&m.lastTransfer?.date!==date;const successes=advance?(m.transferStreak||0)+1:!correct||!independent?0:m.transferStreak||0;m.transferStreak=successes;if(advance)m.due=addDays(date,[3,7,14][Math.min(successes-1,2)]);else if(!correct||!independent||relation.kind==='bridge')m.due=addDays(date,1);m.lastTransfer={questionId:q.id,date,correct,independent,kind:relation.kind,qualified:advance};}
  if(task)awardBlocks(s,task,date);
 }
 else if(a.type==='reflection'){
  const item=s.attempts.find(x=>x.id===a.attemptId);assert(item,'找不到这次作答');assert(typeof a.text==='string'&&a.text.trim().length>=5&&a.text.length<=3000,'请用自己的话至少写5个字');item.reflection=a.text;
 }
 else if(a.type==='report'){
  assert(Number.isInteger(a.fatigue)&&a.fatigue>=1&&a.fatigue<=5,'疲劳程度须为1—5');assert(Number.isInteger(a.available)&&a.available>=60&&a.available<=240,'明日时间须为60—240分钟');assert(typeof a.note==='string'&&a.note.length<=6000,'汇报文字过长');
  const p=ensurePlan(s,bank,date),report={date,fatigue:a.fatigue,available:a.available,note:a.note,completion:0,minutes:Object.values(s.records).filter(r=>r.date===date).reduce((x,r)=>x+r.minutes,0),source:'self-report',at:new Date().toISOString()};s.reports[date]=report;
  const evidence=p.tasks.map(t=>taskEvidence(s,t,date)),total=evidence.reduce((n,e)=>n+e.totalMinutes,0);report.completion=total?evidence.reduce((n,e)=>n+e.completedMinutes,0)/total:0;
  const adj=recommend(s,bank,report);s.adjustments=s.adjustments.filter(x=>x.id!==adj.id);if(adj.date<s.profile.examDate){s.adjustments.push(adj);delete s.plans[adj.date];}
  for(const task of p.tasks)awardBlocks(s,task,date);
  if(a.note.trim().length>=20&&report.completion>0)award(s,'report-'+date,15);
 }
 else if(a.type==='revertAdjustment'){const item=s.adjustments.find(x=>x.id===a.id);assert(item,'找不到调整');assert(item.date>date,'已经开始的日期不改写');item.reverted=true;delete s.plans[item.date];}
 else if(a.type==='coach'){const p=validateCoach(a.plan);assert(p.fromDate>date,'教练计划从明天或以后开始，保留今日任务');s.coachPlans.push(p);for(const d of Object.keys(s.plans))if(d>=p.fromDate&&d<=p.toDate)delete s.plans[d];}
 else if(a.type==='redeem'){const r=REWARDS[a.reward];assert(r,'奖励不存在');assert(typeof a.requestId==='string','缺少兑换编号');if(s.redemptions.some(x=>x.id===a.requestId))return s;assert(!r.unlock||!s.redemptions.some(x=>x.unlock===r.unlock),'这个主题已经解锁');assert(s.points>=r.cost,'星点还不够，慢慢积累就好');s.points-=r.cost;s.redemptions.push({...r,id:a.requestId,date});}
 else if(a.type==='draft'){assert(typeof a.key==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(a.key),'草稿编号无效');assert(typeof a.text==='string'&&a.text.length<=20000,'草稿过长');s.drafts[a.key]=a.text;}
 else if(a.type==='timerComplete'){
  const t=s.timer,now=Date.now();
  if(t?.running&&!t.serverManaged&&Number.isFinite(t.endsAt)&&t.endsAt<=now){s.timer={...t,running:false,remaining:0,rewardEligible:false};s.revision++;return s;}
  assert(t?.running&&t.serverManaged&&elapsedTimer(t,now)>=t.total,'专注时间尚未实际结束');
  if(t.total>=900&&t.rewardEligible!==false){s.focusSessions ||= [];const id=t.sessionId;if(!s.focusSessions.some(x=>x.id===id)){s.focusSessions.push({id,date,minutes:t.total/60,source:'server-timer'});award(s,'focus-'+id,5);}}
  s.timer={...t,running:false,remaining:0,elapsedSeconds:t.total,resumedAt:null};
 }
 else if(a.type==='timer'){
  if(a.timer===null)s.timer=null;
  else{const requested=a.timer,now=Date.now();assert(Number.isFinite(requested.total)&&requested.total>=60&&requested.total<=14400,'计时长度无效');assert(Number.isFinite(requested.remaining)&&requested.remaining>=0&&requested.remaining<=requested.total,'剩余时间无效');assert(typeof requested.label==='string'&&requested.label.length<=100,'计时标题无效');assert(typeof requested.running==='boolean','计时状态无效');
   let old=s.timer;
   if(old&&!old.serverManaged&&old.remaining>0&&old.total===requested.total&&old.label===requested.label){const remaining=old.running&&Number.isFinite(old.endsAt)?Math.max(0,(old.endsAt-now)/1000):old.remaining;old={...old,serverManaged:true,rewardEligible:false,elapsedSeconds:clamp(old.total-remaining,0,old.total),resumedAt:old.running?now:null};}
   const same=old?.serverManaged&&old.total===requested.total&&old.label===requested.label&&old.remaining>0;
   if(same){const elapsed=elapsedTimer(old,now),remaining=Math.max(0,old.total-elapsed);s.timer={...old,elapsedSeconds:elapsed,remaining,running:requested.running,resumedAt:requested.running?now:null,endsAt:requested.running?now+remaining*1000:null};}
   else{assert(requested.remaining===requested.total,'新计时必须从完整时长开始，不能用剩余0秒领取奖励');s.timer={sessionId:crypto.randomUUID(),total:requested.total,remaining:requested.total,label:requested.label,running:requested.running,startedAt:now,resumedAt:requested.running?now:null,elapsedSeconds:0,serverManaged:true,endsAt:requested.running?now+requested.total*1000:null};}
  }
 }
 else if(a.type==='score'){const sc=a.scores;assert(keys.every(k=>Number.isInteger(sc?.[k])&&sc[k]>=0&&sc[k]<=(k==='japanese'?400:k==='math'?200:100)),'分数超出范围');assert(['官方成绩','机构模考'].includes(a.source),'只记录已取得的正式或机构模考成绩');s.scores.push({date,scores:sc,source:a.source});}
 else throw new Error('不支持的操作');
 for(const badge of achievements(s))if(badge.unlocked)award(s,'achievement-'+badge.id,badge.bonus);s.revision++;return s;
}
export function makeReport(s,bank,date){const p=s.plans[date]||buildPlan(s,bank,date),r=s.reports[date],ss=stats(s,bank,date);const done=p.tasks.filter(t=>s.records[t.id]?.completed).length;const rows=p.tasks.map(t=>{const x=s.records[t.id];return `- ${t.title}：${x?.completed?'完成':x?'部分完成':'未记录'}，实际 ${x?.minutes||0}/${t.minutes} 分钟。${x?.note||''}`;});const todayAnswers=s.attempts.filter(a=>a.date===date),wrong=todayAnswers.filter(a=>!a.correct);return `EJU 每日学习汇报 | ${date}\n目标：2026-11-08，630分（不含记述）；当前基线539；每天上限240分钟。\n背景：衡水实验班、高考约580分；较能处理难题，但知识遗忘、EJU引导式设问不适应、速度慢。重点是知识唤醒与题型迁移，不从零重学。\n薄弱项：物理波与电磁；数学积分与三角公式；化学除杂与有机名称；日语词汇与听力。\n今日任务 ${done}/${p.tasks.length}；自报学习 ${Object.values(s.records).filter(x=>x.date===date).reduce((n,x)=>n+x.minutes,0)} 分钟。\n${rows.join('\n')}\n\n最近7天不同题首次独立正确率（按全历史首答去重，提示与迁移不进入分母；非EJU尺度分）：\n${keys.map(k=>`${SUBJECTS[k]}：${ss[k].count?ss[k].correct+'/'+ss[k].count+'，'+ss[k].accuracy+'%；其中提示作答'+ss[k].assisted+'次':'无作答数据'}`).join('\n')}\n\n日语分域（词汇不代表听力能力）：\n${['vocab','listening','reading'].map(k=>{const x=ss.japanese.domains[k];return `${TOPICS[k]||k}：${x.count?x.correct+'/'+x.count+'，'+x.accuracy+'%':'首次独立样本不足'}`;}).join('\n')}\n\n任务块产出：\n${p.tasks.map(t=>{const e=taskEvidence(s,t,date);return `${t.title}：${e.blocks.filter(b=>b.complete).length}/${e.blocks.length}块；${e.missing.map(b=>b.title+'未完成').join('、')||'产出齐全'}`;}).join('\n')}\n\n做对但超时：${todayAnswers.filter(a=>a.correct&&a.overtime).map(a=>`${a.questionId} 用时${a.seconds}秒，瓶颈${a.obstacle}`).join('；')||'暂无计时记录'}\n\n今日错题：\n${wrong.map(a=>{const q=bank.find(q=>q.id===a.questionId);return `- ${q?.title||q?.prompt||a.questionId} [${a.questionId}] / ${TOPICS[a.topic]||a.topic} / ${a.error}：${a.note||'待分析'}`;}).join('\n')||'暂无记录'}\n\n提示使用与吸收：\n${todayAnswers.filter(a=>a.hinted||a.reflection).map(a=>`${a.questionId}：${a.hinted?'提示后作答':'独立作答'}；闭卷复述：${a.reflection||'尚未填写'}`).join('\n')||'暂无提示/复述记录'}\n\n迁移验证：${todayAnswers.filter(a=>a.reviewOf).map(a=>a.reviewOf+' → '+a.questionId+'：'+(a.transferQualified?'独立迁移通过':a.transferKind==='bridge'?'仅基础唤醒，未证明原题掌握':'仍需练习')).join('；')||'暂无'}\n\n主观汇报：${r?.note||'尚未填写'}\n疲劳：${r?.fatigue||'未填'}/5；明日可用：${r?.available||240}分钟。\n${Object.entries(s.drafts).filter(([k])=>k.startsWith('writing-'+date)).map(([,v])=>'记述原文：\n'+v).join('\n')}\n\n本地建议：${s.adjustments.findLast(a=>a.id==='adjust-'+date&&!a.reverted)?.reason||'尚未生成'}\n\n请结合以上记录分析错因，优化接下来的学习题目和时间，并保持每天不超过4小时。软件支持导入JSON：{\"fromDate\":\"${addDays(date,1)}\",\"toDate\":\"${addDays(date,3)}\",\"allocations\":{\"japanese\":80,\"math\":65,\"physics\":55,\"chemistry\":40},\"focus\":{\"math\":\"integral\",\"physics\":\"wave\",\"chemistry\":\"purify\"},\"note\":\"调整原因\"}。也可以直接修改本机软件的计划。`;
}
