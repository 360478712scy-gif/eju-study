import {TOPICS, WRITING} from './public/content.js';
import {timing, questionKind} from './public/review-policy.js';
import {reviewQueue} from './public/transfer.js';
import {LEARNING_CARDS} from './public/learning-cards.js';
import {learningSession} from './learning.mjs';
import {scienceRamp} from './science-ramp.mjs';
import {getVocabContent} from './public/vocab-content.js';
import {selectVocabIds,vocabModeAvailable} from './public/vocab-learning.js';

export const PLANNER_VERSION = 4;
const round = n => Math.round(n * 10) / 10;
const sum = xs => xs.reduce((a,b) => a+b,0);
const dayNumber = date => Math.floor(Date.parse(date+'T12:00:00Z') / 86400000);
const hash = s => [...s].reduce((n,c) => (n*31+c.charCodeAt(0)) >>> 0, 0);
const topicMatch = (q,topic) => q.topic===topic || q.topics?.includes(topic);
const stage = d => d<='2026-10-06'?'起点诊断':d<='2026-10-17'?'唤醒与题型适应':d<='2026-10-28'?'限时应用':d<='2026-11-04'?'稳定发挥':'轻量收尾';
const focusAt = d => d<='2026-10-10'?{math:'trig',physics:'wave',chemistry:'organic'}:d<='2026-10-14'?{math:'integral',physics:'electric',chemistry:'purify'}:d<='2026-10-19'?{math:'integral',physics:'electric',chemistry:'organic'}:d<='2026-10-26'?{math:'integral',physics:'magnetic',chemistry:'purify'}:{math:'mixed',physics:'mixed',chemistry:'mixed'};

function allocationsFor(total,weights) {
  const entries=Object.entries(weights), weight=sum(Object.values(weights)); let used=0;
  return Object.fromEntries(entries.map(([key,value],i)=>{const n=i===entries.length-1?total-used:Math.round(total*value/weight);used+=n;return [key,n];}));
}

/** Every minute is backed by question pacing or a specific, countable output. */
export function buildDailyPlan(s, bank, date) {
  const day=dayNumber(date), index=day-dayNumber(s.profile.startDate);
  if(date>=s.profile.examDate)return {plannerVersion:PLANNER_VERSION,date,stage:'考试与后续',budget:0,tasks:[],reason:'本轮备考结束，记录保留。',audit:{status:'complete',issues:[],rows:[]}};
  let budget=Math.min(240,s.profile.minutes),focus=focusAt(date),weights={japanese:80,math:60,physics:55,chemistry:40};
  let reason='按题型配速发题；订正与回忆都指定产出。题组与词项分开统计。预计时长会用你的首次独立作答数据校准。';
  const adj=s.adjustments?.findLast(x=>x.date===date&&!x.reverted);
  const coach=s.coachPlans?.findLast(x=>x.fromDate<=date&&x.toDate>=date&&!x.reverted);
  if(adj){weights=adj.allocations;budget=Math.min(240,sum(Object.values(weights)));focus={...focus,...adj.focus};reason=adj.reason;}
  if(coach){weights=coach.allocations;budget=Math.min(240,sum(Object.values(weights)));focus={...focus,...coach.focus};reason=coach.note;}
  if(date>='2026-11-05'){budget=Math.min(budget,date==='2026-11-07'?90:date==='2026-11-06'?150:180);reason+=' 考前主动减量，不追赶积压。';}
  const reportMinutes=5, allocations=allocationsFor(budget-reportMinutes,weights);
  const provisionalRamp=scienceRamp(s,bank,date);
  const prelearning=learningSession(s,LEARNING_CARDS,date,{topics:focus,minutes:Math.min(18,budget*.12)});
  const warmBySubject=Object.fromEntries(['math','physics','chemistry'].map(sub=>[sub,prelearning.cards.filter(c=>c.subject===sub).slice(0,allocations[sub]<30||(sub!=='math'&&provisionalRamp.challenge)?1:2)]));
  const sciencePreMinutes=sum(['physics','chemistry'].flatMap(sub=>warmBySubject[sub]).map(c=>c.estimatedSeconds/60));
  const ramp=scienceRamp(s,bank,date,{preMinutes:sciencePreMinutes});
  const history=(s.attempts||[]).filter(a=>a.date<date), last=new Map();for(const a of history)last.set(a.questionId,a.date);
  const used=new Set(), gaps=[], reviews=reviewQueue(s,bank,date).filter(r=>r.questionId);
  const paceCache=new Map();const pace=q=>{if(!paceCache.has(q.id))paceCache.set(q.id,timing(q,history,bank).estimatedSeconds/60);return paceCache.get(q.id);};
  function candidates(subject,topic,{official=false,exclude=[]}={}) {
    const omit=new Set(exclude);
    return bank.filter(q=>q.subject===subject&&!used.has(q.id)&&!omit.has(q.id)&&(!official||q.official)&&(subject!=='japanese'||q.topic===topic))
      .filter(q=>!last.has(q.id)||(day-dayNumber(last.get(q.id))>=(topic==='vocab'?1:7)))
      .sort((a,b)=>{
        const rank=q=>{
          const due=reviews.some(r=>r.questionId===q.id);
          const seen=last.has(q.id);
          if(topic==='vocab'&&s.mastery[q.id]?.due<=date)return -2;
          return (due?-5:seen?4:0)+(topicMatch(q,topic)?0:1)+(q.official?0:2);
        };
        return rank(a)-rank(b)||(last.get(a.id)||'').localeCompare(last.get(b.id)||'')||(hash(a.id+date)%100003)-(hash(b.id+date)%100003);
      });
  }
  function select(subject,topic,target,{official=false}={}) {
    const pool=candidates(subject,topic,{official}), chosen=[];let minutes=0;
    for(const q of pool){
      if(used.has(q.id))continue;
      // Shared reading passages are assigned together. Their apportioned times
      // are valid only when the passage's questions are all in the same block.
      const bundle=topic==='reading'&&q.passageId?pool.filter(x=>x.passageId===q.passageId&&!used.has(x.id)):[q];
      const cost=sum(bundle.map(pace));if(minutes+cost>target+Math.min(1,target*.08))continue;
      chosen.push(...bundle);bundle.forEach(x=>used.add(x.id));minutes+=cost;if(minutes>=target-.2)break;
    }
    // Never silently substitute a handful of elementary drills for official paper work.
    if(!chosen.length&&pool.length&&topic!=='reading'&&target>=pace(pool[0])*.7){chosen.push(pool[0]);used.add(pool[0].id);}
    return chosen;
  }
  function qblock(id,title,qs,instruction){return {id,kind:'questions',title,questionIds:qs.map(q=>q.id),minutes:round(sum(qs.map(pace))),instruction,units:qs.length,unitSeconds:qs.map(q=>round(pace(q)*60))};}
  function output(id,kind,title,minutes,instruction,qs=[],units=1,minChars=20){return {id,kind,title,questionIds:qs.map(q=>q.id),minutes:round(minutes),instruction,units,minChars};}
  function finish(id,subject,topic,minutes,title,blocks) {
    const qs=[...new Set(blocks.filter(b=>b.kind==='questions'||b.kind==='vocab').flatMap(b=>b.questionIds))];
    const referenceQuestionIds=[...new Set(blocks.filter(b=>b.kind==='review').flatMap(b=>b.questionIds).filter(id=>!qs.includes(id)))];
    const reserve=candidates(subject,topic,{official:subject!=='japanese'||topic==='reading'||topic==='listening'}).slice(0,subject==='math'?2:6).map(q=>q.id);
    const links=Object.fromEntries(reviews.filter(r=>qs.includes(r.questionId)&&r.originalId!==r.questionId).map(r=>[r.questionId,r.originalId]));
    const vocabSeen=new Set((s.vocabulary?.attempts||[]).filter(a=>a.date<date).map(a=>a.questionId));
    const newCount=qs.filter(id=>!last.has(id)&&!vocabSeen.has(id)).length;
    const vocabulary=topic==='vocab'?{distinctWords:qs.length,responses:sum(blocks.filter(b=>b.kind==='vocab').map(b=>b.questionIds.length)),modes:Object.fromEntries(['reading','meaning','cloze'].map(mode=>[mode,sum(blocks.filter(b=>b.kind==='vocab'&&b.mode===mode).map(b=>b.questionIds.length))])),repair:blocks.find(b=>b.id==='repair')?.questionIds.length||0}:undefined;
    return {id:date+'-'+id,subject,topic,minutes,title,method:'按练习块完成；提前做完可补充备用题，不必等计时结束。',questionIds:qs,referenceQuestionIds,blocks,reserveQuestionIds:reserve,reviewLinks:links,newCount,spacedCount:qs.length-newCount,estimatedMinutes:round(sum(blocks.map(b=>b.minutes))),...(vocabulary?{vocabulary}:{}),coverage:Object.fromEntries(['math-group','official-science','vocab','listening','reading','short'].map(kind=>[kind,qs.filter(id=>questionKind(bank.find(q=>q.id===id))===kind).length]))};
  }
  const tasks=[],jm=allocations.japanese,writing=(index%7===2||index%7===5)&&jm>=65;
  const vm=Math.max(5,Math.round(jm*15/80)), rm=writing?30:Math.max(5,Math.round(jm*20/80)),lm=jm-vm-rm;
  // 6 + 3 + 2 + 4 minutes at the default budget. All four blocks require
  // real answers; a generic text paragraph cannot stand in for retrieval.
  const vocabScale=vm/15,readingCount=Math.max(1,Math.round(24*vocabScale)),meaningCount=Math.max(1,Math.round(12*vocabScale)),clozeCount=Math.max(1,Math.round(4*vocabScale)),repairCount=Math.max(1,Math.round(8*vocabScale));
  const reviewedWords=bank.filter(q=>q.subject==='japanese'&&q.topic==='vocab'&&vocabModeAvailable(getVocabContent(q.id),'meaning')).map(q=>q.id);
  const readingIds=selectVocabIds(s,bank,date,{mode:'reading',count:readingCount,oldTarget:Math.round(readingCount*2/3),preferIds:reviewedWords});
  const meaningIds=selectVocabIds(s,bank,date,{mode:'meaning',count:meaningCount});
  const clozeIds=selectVocabIds(s,bank,date,{mode:'cloze',count:clozeCount});
  const repairIds=selectVocabIds(s,bank.filter(q=>readingIds.includes(q.id)),date,{mode:'reading',count:repairCount,preferIds:['vx140','vx290','vx291']});
  const vocabBlock=(id,mode,title,ids,seconds,instruction,extra={})=>({id,kind:'vocab',mode,title,questionIds:ids,minutes:round(ids.length*seconds/60),units:ids.length,unitSeconds:seconds,instruction,...extra});
  const vocabBlocks=[
    vocabBlock('reading','reading','看词写读音',readingIds,15,'看到汉字词后直接写出假名，不先播放读音。确实想不起来可记录后再核对。'),
    vocabBlock('meaning','meaning','解释性释义辨析',meaningIds,15,'选择能说明该词具体含义的解释，区分相近表达；词形相同不代表已经理解。'),
    vocabBlock('cloze','cloze','把词放进语境',clozeIds,30,'根据句子中的对象、搭配和转折选择最合适的词，再核对区别依据。'),
    vocabBlock('repair','reading','核对后遮住 · 读音复测',repairIds,30,'先核对标准读音和易混点，再遮住答案重新写读音。这一轮是辅助巩固，不提升当天独立掌握。',{forceHelped:true})
  ];
  vocabBlocks.flatMap(b=>b.questionIds).forEach(id=>used.add(id));
  tasks.push(finish('vocab','japanese','vocab',vm,'词汇 · 读音、词义与语境',vocabBlocks));
  if(lm>0){
    if(lm<=10){
      const qs=select('japanese','listening',lm*.55,{official:true}),spent=sum(qs.map(pace));
      tasks.push(finish('listening','japanese','listening',lm,'听力 · 短组保持',[
        qblock('answer','原速首听',qs,'原速听一次，记录最终决定。'),
        output('decode','review','复听并定位一处漏听',Math.max(1,lm-spent),'只复听刚才最不确定的一题，记录一个没听清的片段和脚本中的对应表达。',qs.slice(0,1),1,15)
      ]));
    }else{
    const pool=candidates('japanese','listening',{official:true}),example=pool[0];
    const deepCount=lm>=25?2:1;
    const deepEach=example?((example.audioDurationSeconds||90)*2+90)/60:4.5;
    const textTime=lm>=25?4:2, qs=select('japanese','listening',Math.max(2,lm-deepEach*deepCount-textTime-1),{official:true}),deep=qs.slice(0,deepCount);
    const deepMinutes=sum(deep.map(q=>((q.audioDurationSeconds||90)*2+90)/60));
    const blocks=[qblock('answer','首听作答',qs,'原速听一次后作答。先不看脚本；记录判断依据与最终决定。'),output('decode','review','逐句定位漏听',deepMinutes,'逐题：再听一遍，记下两个没听清的片段；看脚本核对音变或词义；遮住脚本再听。每题记录两个片段与原因。',deep,deep.length*2,Math.max(20,deep.length*20)),output('recall','recall','脱稿复述与跟读',textTime,'从刚才精听材料中每题选一处转折，写“原提案→改变原因→最终决定”；再跟读两轮。',deep,deep.length,30),output('note','recall','记录一个可迁移的听音问题',1,'用一句话记录本组反复漏听的音、词或转折信号。',[],1,10)];
    tasks.push(finish('listening','japanese','listening',lm,'听力 · 官方录音',blocks));
    }
  }
  for(const sub of ['math','physics','chemistry']){
    const minutes=allocations[sub],isMath=sub==='math',topic=focus[sub],reviewUnits=Math.max(1,Math.round((isMath?3:4)*minutes/({math:60,physics:55,chemistry:40}[sub]))),reviewEach=isMath?4:sub==='physics'?3:2;
    const warmCards=warmBySubject[sub];
    const recall=sum(warmCards.map(c=>c.estimatedSeconds/60)),note=2;
    const warmBlock={id:'recall',kind:'learning',title:'知识与术语预热',minutes:round(recall),cardIds:warmCards.map(c=>c.id),questionIds:[],units:warmCards.length,instruction:'闭卷回忆知识点和日文术语；忘记的再补学，完成应用验证后自动存入笔记本。'};
    if(!isMath){
      const scale=minutes/(sub==='physics'?55:40),target=Math.max(2,Math.round(ramp[sub]*scale));
      const dueDrills=ramp.challenge?[]:reviews.map(r=>bank.find(q=>q.id===r.questionId)).filter(q=>q&&q.subject===sub&&!q.official&&!used.has(q.id)).slice(0,2);
      dueDrills.forEach(q=>used.add(q.id));
      const drillMinutes=sum(dueDrills.map(pace));
      const qs=candidates(sub,topic,{official:true}).slice(0,target);qs.forEach(q=>used.add(q.id));
      const reviewMinutes=round(ramp.reviewMinutes*(sub==='physics'?.6:.4)*scale);
      const firstMinutes=round(Math.max(2,minutes-recall-reviewMinutes-drillMinutes));
      const reviewCount=Math.min(qs.length,Math.max(1,Math.round(reviewMinutes/(sub==='physics'?3:2))));
      // Recovery revisits actual unresolved questions, without counting them as
      // new first attempts or pretending an identical redo proves transfer.
      const backlog=ramp.backlogIds.map(id=>bank.find(q=>q.id===id)).filter(q=>q?.subject===sub);
      const previousIds=[...new Set(history.filter(a=>a.subject===sub).sort((a,b)=>b.date.localeCompare(a.date)||Number(a.correct)-Number(b.correct)).map(a=>a.questionId))];
      const oldQuestions=previousIds.map(id=>bank.find(q=>q.id===id)).filter(q=>q?.official);
      const reviewQuestions=ramp.recovery?[...new Map([...backlog,...oldQuestions,...qs].map(q=>[q.id,q])).values()].slice(0,reviewCount):qs.slice(0,reviewCount);
      const first=qblock('answer',`${qs.length} 道理科真题 · 限时首轮`,qs,`先独立作答，最多用 ${firstMinutes} 分钟；不会的标记卡点。题量按你的80分钟25–30题基线逐步提高，没做完也按实际记录。`);
      Object.assign(first,{minutes:firstMinutes,timedScience:true,quantityGoal:target,targetSecondsPerQuestion:qs.length?Math.round(firstMinutes*60/qs.length):0});
      const correction=output('review','review',`集中订正 ${reviewQuestions.length} 道重点题`,reviewMinutes,ramp.recovery?'先处理指定的积压错题。逐题写：原卡点→条件与关系→遮住答案复做结果。仍不会的明确标记；原题订正不代表已通过新题迁移。':'优先处理错题和超时题，每题写：条件→卡点→正确关系→闭卷复做。未解决的明确写“仍不会”，后续用新题验证；全对时复盘最慢的题。',reviewQuestions,reviewQuestions.length,Math.max(25,reviewQuestions.length*20));
      correction.fixedReferences=!!ramp.recovery;
      const blocks=[warmBlock,...(dueDrills.length?[qblock('transfer','到期考点 · 换题验证',dueDrills,'独立完成不同条件的同考点题；基础短题仅用于唤醒，不计为官方题难度掌握。')]:[]),first,correction];
      tasks.push(finish(sub,sub,topic,minutes,({physics:'物理',chemistry:'化学'}[sub])+' · '+(TOPICS[topic]||'综合')+'与混合练习',blocks));
      continue;
    }
    const dueDrills=reviews.map(r=>bank.find(q=>q.id===r.questionId)).filter(q=>q&&q.subject===sub&&!q.official&&!used.has(q.id)).slice(0,2);
    for(const q of dueDrills)used.add(q.id);
    const drillMinutes=sum(dueDrills.map(pace));
    const qs=select(sub,topic,Math.max(2,minutes-reviewUnits*reviewEach-recall-note-drillMinutes),{official:true});
    const selectedReview=qs.slice(0,reviewUnits);
    const cue=sub==='math'?(topic==='trig'?'不看资料写和差、倍角、合成公式，并为各写一个代入例子。':topic==='integral'?'闭卷写幂函数、换元、面积计算的关键式，每种写一个适用条件。':'闭卷写本组涉及的三条公式及适用条件。'):sub==='physics'?'按今天题单，闭卷写三条关系式，逐条标单位、正方向和成立条件。':'从今日题目提取五个物质名或分离操作：写日文、中文与选择依据。';
    const blocks=[
      warmBlock,
      ...(dueDrills.length?[qblock('transfer','到期考点 · 换题验证',dueDrills,'用没做过的同考点题独立作答。基础题只证明基础唤醒，不冒充原真题难度已掌握。')]:[]),
      qblock('answer',isMath?'引导式填空题组':'限时真题小题',qs,isMath?'按空格顺序沿题设变量推进；90秒无进展标记跳过，记录最慢的衔接。每题组提交填空结果与关键步骤。':'圈出日文条件与正误设问后作答；卡住先标记，做完本组再集中订正。'),
      output('review','review',`复盘 ${selectedReview.length} ${isMath?'个题组':'道题'}`,selectedReview.length*reviewEach,'优先选择本组错题或超时题（全对则选指定题）；每题写：题号→卡点→关键依据→遮住解析复做结果。数学再写前一空怎样服务后一空。',selectedReview,selectedReview.length,Math.max(25,selectedReview.length*20)),
      output('note','recall','提炼下次可用的判断',note,'写两条“遇到什么条件→先做哪一步”，不要抄完整解析。',[],2,20)
    ];
    let spare=minutes-sum(blocks.map(b=>b.minutes));
    // Review count can be smaller than its initial reservation. Refill using the
    // actual remaining budget, so a slow learner is not left with an empty hour.
    if(isMath&&spare>0){
      const answerBlock=blocks.find(b=>b.id==='answer');
      for(const q of candidates(sub,topic,{official:true})){
        const cost=pace(q);if(cost>spare+.3)continue;
        used.add(q.id);answerBlock.questionIds.push(q.id);answerBlock.units++;
        answerBlock.unitSeconds.push(round(cost*60));answerBlock.minutes=round(answerBlock.minutes+cost);spare-=cost;
      }
    }
    if(isMath&&spare>=2){
      const drills=[];for(const q of candidates(sub,topic).filter(q=>!q.official)){if(drills.length>=4)break;const cost=pace(q);if(cost>spare)continue;drills.push(q);spare-=cost;}
      if(drills.length){drills.forEach(q=>used.add(q.id));blocks.splice(1,0,qblock('formula','公式应用短练',drills,'只用于公式提取速度；这些基础小题单独统计，不作为大题组掌握证据。'));}
    }
    tasks.push(finish(sub,sub,topic,minutes,({math:'数学',physics:'物理',chemistry:'化学'}[sub])+' · '+(TOPICS[topic]||'综合')+'与混合练习',blocks));
  }
  if(writing){tasks.push(finish('reading','japanese','writing',rm,'记述 · 限时表达',[output('writing','writing','400–500 字记述',30,WRITING[index%WRITING.length],[],1,300)]));}
  else {
    const count=Math.max(1,Math.round(2*rm/20)),eachReview=rm<10?1:2.5,extract=rm<10?.5:2,reviewMin=count*eachReview,qs=select('japanese','reading',Math.max(1,rm-reviewMin-extract),{official:true});
    tasks.push(finish('reading','japanese','reading',rm,'读解 · 原文证据',[
      qblock('answer','限时阅读作答',qs,'先看设问，再找依据。只做当前指定解答番号。'),
      output('review','review',`解释 ${Math.min(count,qs.length)} 道题的干扰选项`,Math.min(count,qs.length)*eachReview,'优先选错题或最不确定的题；逐题写原文定位句、正确选项改写、一个干扰项错在哪里。',qs.slice(0,count),Math.min(count,qs.length),rm<10?15:35),
      output('recall','recall',rm<10?'抽取一个语境词':'抽取语境中的三个词',extract,rm<10?'记录一个影响理解的词及本句词义。':'从本组文章记下三个影响理解的词，写原文搭配和本句词义。',[],rm<10?1:3,rm<10?8:20)
    ]));
  }
  tasks.push(finish('report','japanese','report',reportMinutes,'每日复盘',[output('report','report','汇报今天的结果',5,'记录实际完成情况、最主要瓶颈、疲劳与明日可用时间。汇报可一键交给 Codex 分析。',[],1,20)]));
  if(date>='2026-11-05'){
    for(const t of tasks)t.minutes=Math.min(t.minutes,Math.max(1,Math.ceil(t.estimatedMinutes)));
    budget=sum(tasks.map(t=>t.minutes));
    for(const sub of Object.keys(allocations))allocations[sub]=sum(tasks.filter(t=>t.subject===sub&&t.topic!=='report').map(t=>t.minutes));
    reason+=' 收尾预算按已安排的具体练习收缩，不为填时间追加新难题。';
  }
  const plan={plannerVersion:PLANNER_VERSION,date,stage:stage(date),budget,allocations,reportMinutes,tasks,reason,focus,gaps,scienceRamp:{...ramp,assignedTotal:sum(tasks.filter(t=>['physics','chemistry'].includes(t.subject)).map(t=>t.coverage['official-science']||0)),timedMinutes:round(sum(tasks.filter(t=>['physics','chemistry'].includes(t.subject)).flatMap(t=>t.blocks).filter(b=>b.timedScience).map(b=>b.minutes)))}};
  plan.audit=reviewWorkload(plan,bank,s);
  return plan;
}

export function reviewWorkload(plan,bank,s={attempts:[]}) {
  const issues=[],byId=new Map(bank.map(q=>[q.id,q]));
  const rows=plan.tasks.map(t=>{
    const blocks=t.blocks||[],qMinutes=sum(blocks.filter(b=>b.kind==='questions'||b.kind==='vocab').map(b=>{
      if(b.kind==='vocab')return b.questionIds.filter(id=>vocabModeAvailable(getVocabContent(id),b.mode)).length*(b.mode==='cloze'||b.forceHelped?30:15)/60;
      const estimated=sum(b.questionIds.map(id=>{const q=byId.get(id);if(!q)return 0;const measured=timing(q,s.attempts||[],bank);if(b.timedScience&&q.official&&['physics','chemistry'].includes(q.subject))return measured.calibrated?measured.estimatedSeconds/60:80/27.5;return measured.estimatedSeconds/60;}));
      return b.timedScience?Math.min(b.minutes,estimated):estimated;
    }));
    const outputMinutes=sum(blocks.filter(b=>!['questions','vocab'].includes(b.kind)).map(b=>b.minutes));
    const supported=round(qMinutes+outputMinutes);
    if(!blocks.length)issues.push({taskId:t.id,severity:'error',message:'没有具体练习块，不能把时间标签当成学习量。'});
    if(supported<t.minutes*.85)issues.push({taskId:t.id,severity:'error',message:`题目与具体产出只覆盖约 ${supported}/${t.minutes} 分钟，需要补充练习。`});
    if(supported>t.minutes*1.2)issues.push({taskId:t.id,severity:'warning',message:`预计 ${supported} 分钟，可能超过 ${t.minutes} 分钟预算。`});
    for(const b of blocks){if(['questions','vocab'].includes(b.kind)&&!b.questionIds.length)issues.push({taskId:t.id,severity:'error',message:`${b.title} 缺题。`});if(b.kind==='review'&&(!b.questionIds.length||!b.units))issues.push({taskId:t.id,severity:'error',message:'订正没有指定题目与产出数量。'});if(b.kind==='vocab'&&b.questionIds.some(id=>!vocabModeAvailable(getVocabContent(id),b.mode)))issues.push({taskId:t.id,severity:'error',message:`${b.title} 含未核验内容或不适合该模式的词。`});}
    for(const b of blocks)if(b.kind==='learning'&&!b.cardIds?.length)issues.push({taskId:t.id,severity:'error',message:'题前复习缺少具体知识卡。'});
    return {taskId:t.id,title:t.title,budget:t.minutes,questionMinutes:round(qMinutes),outputMinutes:round(outputMinutes),supportedMinutes:supported,coverage:t.coverage||{},...(t.vocabulary?{vocabulary:t.vocabulary}:{}),newCount:t.newCount||0,spacedCount:t.spacedCount||0,questionCount:t.questionIds.length};
  });
  if(sum(plan.tasks.map(t=>t.minutes))!==plan.budget)issues.push({severity:'error',message:'任务预算总和不一致。'});
  return {version:2,status:issues.some(x=>x.severity==='error')?'needs-work':issues.length?'review':'covered',issues,rows,estimatedMinutes:round(sum(rows.map(r=>r.supportedMinutes))),note:'覆盖检查只证明有具体工作可做。首次配速为试行估计；实际不足时补题，连续偏快或偏慢时重新校准。'};
}
