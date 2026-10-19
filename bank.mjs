import fs from 'node:fs';
import {QUESTIONS} from './public/content.js';
import {QUESTIONS_EXPANDED} from './public/vocabulary-expanded.js';
import {enrichBank} from './public/transfer.js';
import {VERIFIED_PAIRS} from './public/verified-pairs.js';

// Keep verification attached to the reviewed pair; it must not certify an
// entire chapter or every question with a legacy skill label.
export function attachVerifiedPairs(bank,pairs=VERIFIED_PAIRS){
  const byId=new Map(bank.map(q=>[q.id,q]));
  for(const pair of pairs){
    if(!Array.isArray(pair.ids)||pair.ids.length!==2||pair.ids[0]===pair.ids[1]||pair.ids.some(id=>typeof id!=='string'||!byId.has(id)))throw Error('已核验迁移题对包含无效或不存在的题号：'+JSON.stringify(pair.ids));
    if(pair.ids.some(id=>byId.get(id).subject!==pair.subject))throw Error('已核验迁移题对的科目不一致：'+pair.ids.join('、'));
  }
  return bank.map(q=>{
    const matches=pairs.filter(pair=>pair.ids.includes(q.id));
    if(!matches.length)return q;
    return {...q,
      verifiedTransferWith:[...new Set([...(q.verifiedTransferWith||[]),...matches.flatMap(pair=>pair.ids.filter(id=>id!==q.id))])],
      verifiedTransferEvidence:[...(q.verifiedTransferEvidence||[]),...matches.map(pair=>structuredClone(pair))]
    };
  });
}
export function loadBank(){
  const read=name=>{const url=new URL('./public/'+name,import.meta.url);return fs.existsSync(url)?JSON.parse(fs.readFileSync(url,'utf8')):[];};
  const bank=enrichBank([...read('official.json'),...read('official-expanded.json'),...read('japanese-expanded.json'),...QUESTIONS,...QUESTIONS_EXPANDED]);
  if(new Set(bank.map(q=>q.id)).size!==bank.length)throw Error('题库有重复编号，已停止加载以保护记录。');
  return attachVerifiedPairs(bank);
}
