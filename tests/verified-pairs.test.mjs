import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBank,attachVerifiedPairs} from '../bank.mjs';
import {VERIFIED_PAIRS} from '../public/verified-pairs.js';
import {initialState,applyAction} from '../engine.mjs';
import {reviewQueue} from '../public/transfer.js';
import {transferRelation} from '../public/review-policy.js';

const bank=loadBank(),byId=new Map(bank.map(q=>[q.id,q]));
const date='2026-10-06',reviewDate='2026-10-07';
function answer(state,id,correct,extra={},on=date){
  applyAction(state,bank,{type:'answer',questionId:id,attemptId:`${id}-${state.attempts.length}`,correct,response:'按原题条件列式并写出自己的判断，再核对官方答案。',error:correct?'无':'读题',seconds:100,...extra},on);
}

test('actual bank attaches both directions and preserves each pair’s inspectable source evidence',()=>{
  assert.equal(VERIFIED_PAIRS.length,2);
  for(const pair of VERIFIED_PAIRS)for(const id of pair.ids){
    const q=byId.get(id),other=pair.ids.find(x=>x!==id);
    assert.ok(q.official&&q.selfGrade);
    assert.equal(q.subject,pair.subject);
    assert.ok(q.verifiedTransferWith.includes(other));
    assert.ok(!q.verifiedTransferWith.includes(id));
    assert.deepEqual(q.verifiedTransferEvidence.find(item=>item.ids.includes(other)),pair);
    assert.equal(q.transferSkillVerified,false,'pair verification must not promote every question with the chapter label');
    const source=pair.evidence.find(item=>item.questionId===id);
    assert.equal(source.pdf,q.pdf);
    assert.equal(source.page,q.page);
    assert.match(q.sourceUrl,/^https:\/\/www\.jasso\.go\.jp\//);
    const relation=transferRelation(q,byId.get(other));
    assert.equal(relation.verifiedBy,'authored-pair');
    assert.equal(relation.demonstratesMastery,true);
  }
});

for(const pair of VERIFIED_PAIRS)test(`${pair.subject}: both actual question directions enter reviewQueue and a new independent success advances mastery`,()=>{
  for(const originalId of pair.ids){
    const candidateId=pair.ids.find(id=>id!==originalId),state=initialState();
    answer(state,originalId,false);
    const row=reviewQueue(state,bank,reviewDate).find(item=>item.originalId===originalId);
    assert.equal(row.questionId,candidateId);
    assert.equal(row.kind,'transfer');
    assert.equal(row.demonstratesMastery,true);
    answer(state,candidateId,true,{reviewOf:originalId},reviewDate);
    assert.equal(state.attempts.at(-1).transferQualified,true);
    assert.equal(state.mastery[originalId].transferStreak,1);
    assert.equal(state.mastery[originalId].due,'2026-10-10');
    assert.equal(state.mastery[originalId].lastTransfer.questionId,candidateId);
    assert.ok(!reviewQueue(state,bank,'2026-10-10').some(item=>item.questionId===candidateId),'a used question cannot be recycled as novel transfer');
  }
});

test('an unreviewed actual question with the same chapter and legacy skill remains ineligible',()=>{
  const original=byId.get('o-2018_2-p10'),unreviewed=byId.get('o-2018_1-p10');
  assert.equal(original.subject,unreviewed.subject);
  assert.equal(original.topic,unreviewed.topic);
  assert.equal(original.skill,unreviewed.skill);
  assert.equal(transferRelation(original,unreviewed).eligible,false);
  const state=initialState();answer(state,unreviewed.id,false);
  const row=reviewQueue(state,bank,reviewDate).find(item=>item.originalId===unreviewed.id);
  assert.equal(row.questionId,null);
  assert.equal(row.kind,'awaiting');
  assert.equal(row.demonstratesMastery,false);
  assert.throws(()=>answer(state,original.id,true,{reviewOf:unreviewed.id},reviewDate),/细考点关系/);
  assert.equal(state.mastery[unreviewed.id].transferStreak||0,0);
  assert.equal(state.attempts.length,1);
});

test('a verified pair still cannot turn an assisted answer into independent mastery',()=>{
  const [original,candidate]=VERIFIED_PAIRS[0].ids,state=initialState();
  answer(state,original,false);
  answer(state,candidate,true,{reviewOf:original,hinted:true},reviewDate);
  assert.equal(state.attempts.at(-1).transferQualified,false);
  assert.equal(state.mastery[original].transferStreak,0);
  assert.equal(state.mastery[original].due,'2026-10-08');
});

test('invalid IDs and subject mismatches fail before any pair metadata is applied',()=>{
  const questions=[{id:'a',subject:'physics'},{id:'b',subject:'chemistry'}];
  assert.throws(()=>attachVerifiedPairs(questions,[{ids:['a','missing'],subject:'physics'}]),/不存在/);
  assert.throws(()=>attachVerifiedPairs(questions,[{ids:['a','a'],subject:'physics'}]),/无效/);
  assert.throws(()=>attachVerifiedPairs(questions,[{ids:['a','b'],subject:'physics'}]),/科目不一致/);
  assert.deepEqual(questions,[{id:'a',subject:'physics'},{id:'b',subject:'chemistry'}]);
});
