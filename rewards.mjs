export const REWARDS={walk:{cost:20,name:'散步十分钟',icon:'leaf'},tea:{cost:40,name:'一杯喜欢的饮品',icon:'sun'},episode:{cost:80,name:'一集喜欢的节目',icon:'play'},evening:{cost:150,name:'一个放松的晚上',icon:'star'},amber:{cost:60,name:'琥珀色专注主题',icon:'sun',unlock:'amber'},night:{cost:100,name:'夜读蓝专注主题',icon:'moon',unlock:'night'}};
export function achievements(s){
 const attempts=s.attempts||[],first=new Map();for(const a of attempts)if(!first.has(a.questionId))first.set(a.questionId,a);
 const independent=[...first.values()].filter(a=>a.correct&&!a.hinted&&!a.reviewOf&&!a.repeat&&a.seconds>0).length;
 const reflections=new Set(attempts.filter(a=>typeof a.reflection==='string'&&a.reflection.trim().length>=20).map(a=>a.questionId)).size;
 const transfer=new Set(attempts.filter(a=>a.transferQualified&&a.reviewOf&&a.reviewOf!==a.questionId&&a.correct&&!a.hinted).map(a=>a.reviewOf)).size;
 const focus=new Set((s.focusSessions||[]).filter(x=>x.source==='server-timer'&&x.minutes>=15).map(x=>x.id)).size;
 return [
{id:'first',name:'第一步',desc:'完成1项有实际产出的任务',value:Object.values(s.records||{}).filter(r=>r.completed&&r.evidenceComplete).length,target:1,bonus:5,glyph:'◌'},
{id:'recall',name:'把知识说回来',desc:'3道题各保存20字以上的闭卷复述',value:reflections,target:3,bonus:10,glyph:'✎'},
{id:'transfer',name:'真的会了',desc:'3个薄弱点通过新题验证',value:transfer,target:3,bonus:15,glyph:'◇'},
{id:'independent',name:'独立解题者',desc:'首次独立答对20道不同题',value:independent,target:20,bonus:20,glyph:'✧'},
{id:'focus',name:'专注小岛',desc:'完成5段至少15分钟专注',value:focus,target:5,bonus:15,glyph:'◷'},
{id:'reflection',name:'看见进步',desc:'完成7天有具体产出的复盘，无需连续',value:Object.values(s.reports||{}).filter(r=>typeof r.note==='string'&&r.note.trim().length>=20&&r.completion>0).length,target:7,bonus:25,glyph:'❋'}
].map(a=>({...a,unlocked:a.value>=a.target||!!s.earned?.['achievement-'+a.id]}));}
