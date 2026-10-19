import {getVocabContent} from './public/vocab-content.js';
import {gradeVocabAnswer,VOCAB_MODES,VOCAB_INTERVALS} from './public/vocab-learning.js';

const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const addDays=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);

/** Caller resolves and validates assigned task/block before passing them here. */
export function applyVocabAnswer(s,a,date,{task=null,block=null}={}) {
  assert(typeof a.attemptId==='string'&&a.attemptId.length>0&&a.attemptId.length<100,'缺少词汇作答编号');
  if(s.vocabulary?.attempts?.some(x=>x.id===a.attemptId))return s;
  assert(typeof a.questionId==='string'&&VOCAB_MODES.includes(a.mode),'词汇题号或练习类型无效');
  assert(a.helped===undefined||typeof a.helped==='boolean','提示状态无效');
  assert(a.skipped===undefined||typeof a.skipped==='boolean','想不起来状态无效');
  assert(a.seconds===undefined||(Number.isFinite(a.seconds)&&a.seconds>=0&&a.seconds<=14400),'词汇作答时间无效');
  const content=getVocabContent(a.questionId),empty=a.response===null||a.response===undefined||typeof a.response==='string'&&!a.response.trim();
  const feedback=gradeVocabAnswer(content,a.mode,a.response,{skipped:!!a.skipped});assert(feedback.available,feedback.reason);
  assert(a.skipped===true||!empty,'请先作答，或明确选择想不起来');
  if(!empty){if(a.mode==='reading')assert(typeof a.response==='string'&&a.response.length<=200,'读音请填写不超过200字的假名');else{const choices=a.mode==='meaning'?content?.meaningOptions:content?.cloze?.options;assert(Number.isInteger(a.response)&&a.response>=0&&a.response<(choices?.length||0),'请选择一个有效选项');}}
  const priorRows=(s.vocabulary?.attempts||[]).filter(x=>x.questionId===a.questionId&&x.mode===a.mode),firstToday=!priorRows.some(x=>x.date===date),firstAttempt=priorRows.length===0;
  const helped=!!a.helped||!!block?.forceHelped,independent=firstToday&&!helped;
  const prior=s.vocabulary?.mastery?.[a.questionId]?.[a.mode]||{streak:0,intervalDays:0,wrongDays:0};
  // Only a new day's unaided answer at/after its due date advances spacing.
  // Looking at the repair answer after an independent pass does not revoke it,
  // while a real later error still returns the word to tomorrow's queue.
  const failed=!feedback.correct,advance=feedback.correct&&independent&&(!prior.due||prior.due<=date);
  const reset=failed||(helped&&firstToday),streak=reset?0:advance?prior.streak+1:prior.streak;
  const intervalDays=reset?1:advance?VOCAB_INTERVALS[Math.min(streak-1,VOCAB_INTERVALS.length-1)]:prior.intervalDays||1;
  const due=reset||advance?addDays(date,intervalDays):prior.due||addDays(date,1);
  const row={id:a.attemptId,questionId:a.questionId,word:content.word,reading:content.reading,mode:a.mode,response:a.response??null,correct:feedback.correct,expected:feedback.expected,answerIndex:feedback.answerIndex,explanation:feedback.explanation,
    seconds:Math.round((a.seconds||0)*10)/10,helped,skipped:!!a.skipped,date,taskId:task?.id||null,blockId:block?.id||null,firstAttempt,firstToday,independent,intervalAdvanced:advance,reviewDue:due,feedback,contentSnapshot:structuredClone(content),source:'server-auto-grade',gradingStandard:a.mode==='reading'?'假名规范化后与核验读音精确匹配':'与核验内容的正确选项索引匹配',at:new Date().toISOString()};
  s.vocabulary ||= {attempts:[],mastery:{}};s.vocabulary.attempts ||= [];s.vocabulary.mastery ||= {};s.vocabulary.mastery[a.questionId] ||= {};
  s.vocabulary.mastery[a.questionId][a.mode]={...prior,streak,intervalDays,due,lastDate:date,lastAttemptId:a.attemptId,lastCorrect:feedback.correct,lastIndependent:independent,wrongDays:(prior.wrongDays||0)+(failed&&!priorRows.some(x=>x.date===date&&!x.correct)?1:0),lastIndependentDate:independent?date:prior.lastIndependentDate||null};
  s.vocabulary.attempts.push(row);
  return s;
}
