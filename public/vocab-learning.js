import {getVocabContent} from './vocab-content.js';

export const VOCAB_MODES = Object.freeze(['reading','meaning','cloze']);
export const VOCAB_MODE_LABELS = Object.freeze({reading:'读音提取',meaning:'释义辨析',cloze:'语境应用'});
export const VOCAB_INTERVALS = Object.freeze([1,3,7,14]);
const addDays=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const hash=text=>[...text].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
const hasHan=text=>/\p{Script=Han}/u.test(String(text||''));

/** Script/width/spacing normalization only: small kana and long vowels matter. */
export function normalizeVocabReading(text) {
  return String(text??'').normalize('NFKC').replace(/\s/gu,'')
    .replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).normalize('NFC');
}

export function vocabModeAvailable(content,mode) {
  if(!content||!VOCAB_MODES.includes(mode))return false;
  if(mode==='reading')return hasHan(content.word)&&typeof content.reading==='string'&&content.reading.length>0;
  const options=mode==='meaning'?content.meaningOptions:content.cloze?.options;
  const answer=mode==='meaning'?content.meaningAnswer:content.cloze?.answer;
  return Array.isArray(options)&&options.length>=2&&Number.isInteger(answer)&&answer>=0&&answer<options.length;
}

export function gradeVocabAnswer(content,mode,response,{skipped=false}={}) {
  const available=vocabModeAvailable(content,mode),answerIndex=mode==='reading'?null:mode==='meaning'?content?.meaningAnswer??null:content?.cloze?.answer??null;
  const options=mode==='meaning'?content?.meaningOptions:content?.cloze?.options;
  const acceptedReadings=[...new Set([content?.reading,...(content?.acceptedReadings||[])].filter(Boolean))];
  const expected=mode==='reading'?acceptedReadings.join(' ／ '):options?.[answerIndex]||'';
  const normalizedResponse=mode==='reading'?normalizeVocabReading(response):response;
  const empty=response===null||response===undefined||typeof response==='string'&&!response.trim();
  let reason='';
  if(!available)reason='这个词尚未提供已核验的此类练习';
  else if(skipped)reason='本次选择想不起来，已记入复习';
  else if(empty)reason='请先作答，或明确选择想不起来';
  else if(mode==='reading'&&hasHan(response))reason='请写假名读音，不要照抄汉字';
  const correct=available&&!skipped&&!empty&&!reason&&(mode==='reading'?acceptedReadings.some(reading=>normalizedResponse===normalizeVocabReading(reading)):Number.isInteger(response)&&response===answerIndex);
  const explanation=mode==='cloze'?content?.cloze?.explanation||'':mode==='meaning'?content?.meaning||'':`${content?.word||''}：${expected}。${content?.meaning||''}`;
  return {available,correct,mode,response:response??null,normalizedResponse,expected,answerIndex,explanation,reason};
}

export function vocabBlockProgress(state,task,block,date) {
  const ids=[...new Set(block.questionIds||[])];
  const attempts=(state.vocabulary?.attempts||[]).filter(a=>a.date===date&&a.taskId===task.id&&a.blockId===block.id&&a.mode===block.mode&&ids.includes(a.questionId));
  const completedIds=ids.filter(id=>attempts.some(a=>a.questionId===id));
  return {complete:ids.length>0&&completedIds.length===ids.length,total:ids.length,completed:completedIds.length,completedIds,missingIds:ids.filter(id=>!completedIds.includes(id)),actualSeconds:attempts.reduce((n,a)=>n+(a.seconds||0),0)};
}

/** At most one closed-book first response per word/mode/day enters progress. */
export function vocabProgressSummary(state,date) {
  const rows=(state.vocabulary?.attempts||[]).filter(a=>a.date<=date),from=addDays(date,-6),byMode={};
  for(const mode of VOCAB_MODES){
    const all=rows.filter(a=>a.mode===mode),today=all.filter(a=>a.date===date),firstByDay=new Map();
    for(const a of all){const key=a.date+':'+a.questionId;if(!firstByDay.has(key))firstByDay.set(key,a);}
    // Keep only the latest first-of-day observation per word in this window.
    // A same-day correction can never replace the wrong first observation.
    const recent=new Map();for(const a of firstByDay.values())if(a.date>=from){const prior=recent.get(a.questionId);if(!prior||prior.date<a.date)recent.set(a.questionId,a);}
    const independent=[...recent.values()].filter(a=>!a.helped&&a.independent!==false),correct=independent.filter(a=>a.correct).length;
    const states=Object.values(state.vocabulary?.mastery||{}).map(v=>v[mode]).filter(Boolean);
    byMode[mode]={mode,label:VOCAB_MODE_LABELS[mode],count:independent.length,correct,accuracy:independent.length?Math.round(correct/independent.length*100):null,
      todayAttempts:today.length,todayWords:new Set(today.map(a=>a.questionId)).size,todayCorrect:today.filter(a=>a.correct).length,helped:today.filter(a=>a.helped).length,skipped:today.filter(a=>a.skipped).length,
      seconds:today.reduce((n,a)=>n+(a.seconds||0),0),due:states.filter(m=>m.due<=date).length,spaced:states.filter(m=>m.streak>=2).length,
      wrongIds:independent.filter(a=>!a.correct).map(a=>a.questionId)};
  }
  const today=rows.filter(a=>a.date===date);
  return {date,byMode,attempts:today.length,words:new Set(today.map(a=>a.questionId)).size,seconds:today.reduce((n,a)=>n+(a.seconds||0),0),note:'近7天每词每维度保留最近一次当日首答；辅助与同日复测不提高独立正确率。词汇数据不代表听力或读解水平。'};
}

/** Deterministic word selection. Legacy recognition is familiarity, not mastery. */
export function selectVocabIds(state,bank,date,{mode='reading',count=24,oldTarget,excludeIds=[],preferIds=[]}={}) {
  const exclude=new Set(excludeIds),preferred=new Set(preferIds),legacy=(state.attempts||[]).filter(a=>a.date<=date),rows=(state.vocabulary?.attempts||[]).filter(a=>a.date<=date);
  const seen=new Set([...legacy,...rows].map(a=>a.questionId)),lastLegacy=new Map(),lastMode=new Map();
  for(const a of legacy)lastLegacy.set(a.questionId,a);for(const a of rows)if(a.mode===mode)lastMode.set(a.questionId,a);
  const rank=id=>{
    const latest=lastMode.get(id),m=state.vocabulary?.mastery?.[id]?.[mode];
    if(latest&&(!latest.correct||latest.helped)&&m?.due<=date)return -12;
    if(m?.due<=date)return -10;
    if(!latest&&lastLegacy.get(id)?.correct===false)return -8;
    if(preferred.has(id))return -5;
    if(!latest&&seen.has(id))return -3;
    if(latest)return 10;
    return 0;
  };
  const pool=[...new Set(bank.filter(q=>q.subject==='japanese'&&q.topic==='vocab').map(q=>q.id))].filter(id=>!exclude.has(id)&&vocabModeAvailable(getVocabContent(id),mode));
  pool.sort((a,b)=>rank(a)-rank(b)||(state.vocabulary?.mastery?.[a]?.[mode]?.due||'').localeCompare(state.vocabulary?.mastery?.[b]?.[mode]?.due||'')||(hash(a+date)%100003)-(hash(b+date)%100003));
  if(!Number.isInteger(oldTarget))return pool.slice(0,count);
  const old=pool.filter(id=>seen.has(id)),fresh=pool.filter(id=>!seen.has(id)),chosen=[...old.slice(0,oldTarget),...fresh.slice(0,Math.max(0,count-Math.min(old.length,oldTarget)))];
  return [...chosen,...pool.filter(id=>!chosen.includes(id))].slice(0,count);
}
