// Pure domain logic: no filesystem, network, clock, score, or global mastery writes.
const SUBJECTS=['math','physics','chemistry'];
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const addDays=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
function validDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&addDays(date,0)===date;}
function emptyLearning(){return {reviews:[],cardState:{},notebook:[],sessions:{}};}
function learningState(s){
 const learning=s.learning||emptyLearning();
 assert(Array.isArray(learning.reviews||[])&&Array.isArray(learning.notebook||[]),'学习记录格式异常，请保留原备份');
 assert(!learning.cardState||typeof learning.cardState==='object'&&!Array.isArray(learning.cardState),'学习卡片状态格式异常');
 assert(!learning.sessions||typeof learning.sessions==='object'&&!Array.isArray(learning.sessions),'学习会话格式异常');
 return {...emptyLearning(),...learning};
}
const cardSeconds=card=>Number.isFinite(card.estimatedSeconds)&&card.estimatedSeconds>0?card.estimatedSeconds:120;
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const minutes=seconds=>Math.round(seconds/6)/10;
function fallbackFocus(date){
 if(date<='2026-10-10')return {math:'trig',physics:'wave',chemistry:'organic'};
 if(date<='2026-10-19')return {math:'integral',physics:'electric',chemistry:date<='2026-10-14'?'purify':'organic'};
 if(date<='2026-10-26')return {math:'integral',physics:'magnetic',chemistry:'purify'};
 return {math:'mixed',physics:'mixed',chemistry:'mixed'};
}
function topicsFor(s,date,options){
 const result={...fallbackFocus(date),...s.plans?.[date]?.focus};
 for(const task of s.plans?.[date]?.tasks||[])if(SUBJECTS.includes(task.subject)&&task.topic)result[task.subject]=task.topic;
 if(options.topics&&!Array.isArray(options.topics))Object.assign(result,options.topics);
 return result;
}
function matchesTopic(card,topic){const topics=Array.isArray(topic)?topic:[topic];return topics.includes('mixed')||topics.some(t=>card.topic===t||card.topics?.includes(t));}
function knownCards(cards,learning){
 const map=new Map();
 for(const entry of learning.notebook)if(entry.cardSnapshot?.id)map.set(entry.cardSnapshot.id,entry.cardSnapshot);
 for(const session of Object.values(learning.sessions))for(const card of session.cardSnapshots||[])map.set(card.id,card);
 for(const card of cards){assert(card&&typeof card.id==='string'&&card.id.length>0,'学习卡片缺少编号');map.set(card.id,card);}
 return map;
}

/** Deterministic selection. Reading this view never changes the caller's state. */
export function learningSession(s,cards,date,options={}){
 assert(validDate(date),'学习日期无效');assert(Array.isArray(cards),'学习卡片列表无效');
 const learning=learningState(s),map=knownCards(cards,learning),saved=learning.sessions[date];
 const subjects=options.subjects||SUBJECTS;assert(Array.isArray(subjects)&&subjects.length>0&&subjects.every(x=>SUBJECTS.includes(x)),'学习科目应为数学、物理、化学');
 assert(new Set(subjects).size===subjects.length,'学习科目不能重复');
 if(options.minutes!==undefined)assert(Number.isFinite(options.minutes)&&options.minutes>=0,'学习预算分钟无效');
 if(saved&&!Object.keys(options).length){
  const selected=saved.cardIds.map(id=>map.get(id)).filter(Boolean),missingIds=saved.cardIds.filter(id=>!map.has(id));
  return {...structuredClone(saved),cards:structuredClone(selected),missing:[...(saved.missing||[]),...missingIds.map(cardId=>({cardId,reason:'卡片不在当前题库或笔记快照中'}))]};
 }
 const plannedBlocks=(s.plans?.[date]?.tasks||[]).flatMap(t=>t.blocks||[]).filter(b=>b.kind==='learning');
 const plannedIds=[...new Set(plannedBlocks.flatMap(b=>b.cardIds||[]))];
 if(plannedIds.length&&!Object.keys(options).length){
  const selected=plannedIds.map(id=>map.get(id)).filter(Boolean),targets=Object.fromEntries(subjects.map(sub=>[sub,selected.filter(c=>c.subject===sub).length]));
  return {date,cardIds:plannedIds,cards:structuredClone(selected),cardSnapshots:structuredClone(selected),targets,targetTotal:plannedIds.length,dailyTarget:6,estimatedMinutes:minutes(sum(selected.map(cardSeconds))),budgetMinutes:sum(plannedBlocks.map(b=>b.minutes||0)),focus:topicsFor(s,date,options),selectionReasons:Object.fromEntries(plannedIds.map(id=>[id,'已安排的题前预热'])),missing:plannedIds.filter(id=>!map.has(id)).map(cardId=>({cardId,reason:'计划卡片缺少正文或快照'})),scope:'knowledge-recall-not-exam-mastery'};
 }
 const focus=topicsFor(s,date,options),targets=Object.fromEntries(subjects.map(sub=>[sub,2])),pools={},selectionReasons={};
 for(const subject of subjects){
  pools[subject]=[...map.values()].filter(card=>card.subject===subject).map((card,index)=>{
   const state=learning.cardState[card.id],due=state?.due&&state.due<=date,topic=Array.isArray(options.topics)?options.topics:focus[subject],match=matchesTopic(card,topic);
   return {card,index,rank:due?0:!state&&match?1:!state?2:match?3:4,due:due?state.due:'9999-12-31',reason:due?'到期回忆':match?'今日专题':'跨专题保持'};
  }).sort((a,b)=>a.rank-b.rank||a.due.localeCompare(b.due)||a.index-b.index);
 }
 const selected=[],counts=Object.fromEntries(subjects.map(sub=>[sub,0]));let seconds=0;
 const budgetSeconds=options.minutes===undefined?Infinity:options.minutes*60;
 for(let round=0;round<2;round++)for(const subject of subjects){
  const candidate=pools[subject].find(item=>!selected.some(c=>c.id===item.card.id)&&seconds+cardSeconds(item.card)<=budgetSeconds);
  if(!candidate)continue;selected.push(candidate.card);counts[subject]++;seconds+=cardSeconds(candidate.card);selectionReasons[candidate.card.id]=candidate.reason;
 }
 const missing=subjects.filter(sub=>counts[sub]<targets[sub]).map(subject=>({subject,count:targets[subject]-counts[subject],reason:pools[subject].length<targets[subject]?'卡片供给不足':'预算不足，未额外添加学习时间'}));
 return {date,cardIds:selected.map(c=>c.id),cards:structuredClone(selected),cardSnapshots:structuredClone(selected),targets,targetTotal:sum(Object.values(targets)),estimatedMinutes:minutes(seconds),budgetMinutes:options.minutes??null,focus,selectionReasons,missing,scope:'knowledge-recall-not-exam-mastery'};
}

function checkedCard(card){
 const check=card?.check;assert(card&&check&&typeof check.prompt==='string'&&Array.isArray(check.options)&&check.options.length>=2&&check.options.length<=12,'该知识卡缺少可核对的应用题');
 assert(Number.isInteger(check.answer)&&check.answer>=0&&check.answer<check.options.length,'知识卡应用题答案异常，请保留原卡并修订');return check;
}
function noRecall(text){text=text.split('\n术语回忆：')[0];return /^(?:不记得|不知道|不会|忘了|忘记了|忘记|想不起来|完全不记得|记不清)[。.!！\s]*$/.test(text.trim());}

/** Atomic in-memory action: validation failures leave s unchanged; success returns s. */
export function applyLearningAction(s,cards,a,date){
 assert(validDate(date),'学习日期无效');assert(a&&['learningAnswer','learningNote'].includes(a.type),'不支持的知识学习操作');
 const next=structuredClone(learningState(s));
 if(a.type==='learningNote'){
  assert(typeof a.entryId==='string','缺少笔记编号');const entry=next.notebook.find(e=>e.id===a.entryId);assert(entry,'找不到这条学习笔记');
  assert(typeof a.userNote==='string'&&a.userNote.length<=6000,'个人笔记须为不超过6000字的文字');entry.userNote=a.userNote;entry.noteEditedOn=date;s.learning=next;return s;
 }
 assert(typeof a.requestId==='string'&&a.requestId.length>0&&a.requestId.length<=120,'缺少作答请求编号');
 const repeated=next.reviews.find(r=>r.requestId===a.requestId);
 if(repeated){assert(repeated.cardId===a.cardId,'请求编号已用于另一张卡片');return s;}
 const card=knownCards(cards,next).get(a.cardId),check=checkedCard(card);
 assert(typeof a.recallText==='string'&&a.recallText.trim().length>0&&a.recallText.length<=6000,'请先写下自己的回忆；确实忘记时可填写“不记得”');
 assert(['forgot','partial','remembered'].includes(a.recallRating),'请选择真实的回忆情况');
 assert(Number.isInteger(a.checkAnswer)&&a.checkAnswer>=0&&a.checkAnswer<check.options.length,'请选择应用题选项');
 assert(a.userNote===undefined||typeof a.userNote==='string'&&a.userNote.length<=6000,'个人笔记过长');
 assert(a.seconds===undefined||Number.isFinite(a.seconds)&&a.seconds>=0&&a.seconds<=14400,'学习用时无效');
 const previous=next.cardState[card.id]||{streak:0,lapses:0};assert(!previous.lastDate||date>=previous.lastDate,'不能用早于最后学习日的作答覆盖复习安排');
 const sameDay=next.reviews.some(r=>r.cardId===card.id&&r.date===date),checkCorrect=a.checkAnswer===check.answer,independentCheck=!a.hinted&&!a.usedHelp;
 const recallPassed=a.recallRating==='remembered'&&!noRecall(a.recallText),passed=recallPassed&&checkCorrect&&independentCheck;
 const streak=passed?(sameDay?previous.streak:previous.streak+1):0;
 const due=passed&&sameDay?previous.due:addDays(date,passed?[1,3,7,14][Math.min(Math.max(streak-1,0),3)]:1);
 const failedToday=next.reviews.some(r=>r.cardId===card.id&&r.date===date&&!r.passed);
 next.cardState[card.id]={...previous,streak,due,lastDate:date,lapses:previous.lapses+(!passed&&!failedToday?1:0),lastCheckCorrect:checkCorrect,lastRecallRating:a.recallRating,scope:'learning-card-only'};
 const review={id:a.requestId,requestId:a.requestId,cardId:card.id,date,recallText:a.recallText,recallRating:a.recallRating,checkAnswer:a.checkAnswer,checkCorrect,independentCheck,recallPassed,passed,fastTrack:passed,seconds:Math.round((a.seconds||0)*10)/10,userNote:a.userNote||'',sameDayRepeat:sameDay,scope:'learning-card-only'};
 // Freeze the daily queue from the pre-answer state, so answering never changes today's cards.
 if(!next.sessions[date]){const session=learningSession(s,cards,date);delete session.cards;next.sessions[date]=session;}
 next.reviews.push(review);
 const id='learning:'+date+':'+card.id,existing=next.notebook.find(e=>e.id===id),snapshot=structuredClone(card);
 const historyEntry={...structuredClone(review),cardSnapshot:snapshot};
 if(existing){
  existing.history ||= [];existing.history.push(historyEntry);existing.attemptsToday=existing.history.length;
  Object.assign(existing,{recallText:a.recallText,recallRating:a.recallRating,check:{...structuredClone(check),selectedAnswer:a.checkAnswer,correct:checkCorrect},passed,fastTrack:passed,seconds:existing.history.reduce((n,h)=>n+h.seconds,0)});
  if(a.userNote?.trim())existing.userNote=a.userNote;
 }else next.notebook.push({id,cardId:card.id,date,subject:card.subject,topic:card.topic,title:card.title,cardSnapshot:snapshot,recallText:a.recallText,recallRating:a.recallRating,check:{...structuredClone(check),selectedAnswer:a.checkAnswer,correct:checkCorrect},userNote:a.userNote||'',seconds:review.seconds,passed,fastTrack:passed,attemptsToday:1,history:[historyEntry],masteryScope:'learning-card-only'});
 s.learning=next;return s;
}

export function learningProgress(s,cards,date,options={}){
 const session=learningSession(s,cards,date,options),learning=learningState(s),ids=new Set(session.cardIds),todayReviews=learning.reviews.filter(r=>r.date===date&&ids.has(r.cardId)),completedIds=[...new Set(todayReviews.map(r=>r.cardId))];
 const latest=new Map();for(const r of todayReviews)latest.set(r.cardId,r);
 const passedIds=[...latest.values()].filter(r=>r.passed).map(r=>r.cardId),actualSeconds=sum(todayReviews.map(r=>r.seconds||0));
 return {date,cardIds:session.cardIds,completedIds,passedIds,completed:completedIds.length,passed:passedIds.length,total:session.cardIds.length,targetTotal:session.targetTotal,remaining:session.cardIds.filter(id=>!completedIds.includes(id)),complete:session.cardIds.length>0&&completedIds.length===session.cardIds.length&&session.missing.length===0,estimatedMinutes:session.estimatedMinutes,completedEstimatedMinutes:minutes(sum(session.cards.filter(c=>completedIds.includes(c.id)).map(cardSeconds))),actualSeconds,actualMinutes:minutes(actualSeconds),missing:session.missing,scope:'knowledge-recall-not-exam-mastery'};
}
