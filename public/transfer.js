import {TRANSFER_QUESTIONS,SKILLS,OFFICIAL_SKILLS} from './transfer-content.js';
import {transferCandidates} from './review-policy.js';
export function enrichBank(bank){return [...bank,...TRANSFER_QUESTIONS].map(q=>({...q,skill:q.skill||SKILLS[q.id]||OFFICIAL_SKILLS[q.id]||(q.topic==='vocab'?q.id:null)}));}
export function reviewQueue(s,bank,date){
 const used=new Set(),out=[];
 const originals=bank.filter(q=>{const m=s.mastery[q.id];return m&&m.due<=date&&(m.wrong>0||s.attempts.some(a=>a.questionId===q.id&&a.hinted));}).sort((a,b)=>s.mastery[a.id].due.localeCompare(s.mastery[b.id].due));
 for(const q of originals){const m=s.mastery[q.id];if(q.topic==='vocab'){out.push({originalId:q.id,questionId:q.id,kind:'recall',due:m.due,skill:q.skill});continue;}
 const candidates=transferCandidates(q,bank,s.attempts,used);
 const chosen=candidates[0];if(chosen)used.add(chosen.questionId);
 out.push({originalId:q.id,questionId:chosen?.questionId||null,kind:chosen?.kind||'awaiting',due:m.due,skill:chosen?.skill||q.skill,demonstratesMastery:!!chosen?.demonstratesMastery,reason:chosen?.reason||'没有未做过且经核验的同细考点题'});
 }return out;
}
