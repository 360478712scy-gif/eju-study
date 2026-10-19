import test from 'node:test';
import assert from 'node:assert/strict';
import {timing, questionKind, transferRelation, transferCandidates} from '../public/review-policy.js';

test('first-attempt pacing distinguishes units and ignores loose legacy minutes', () => {
  assert.equal(timing({id:'p', subject:'physics', official:true, minutes:55}).estimatedSeconds,120);
  assert.equal(timing({id:'c', subject:'chemistry', official:true, minutes:40}).estimatedSeconds,100);
  assert.equal(timing({id:'v', subject:'japanese', topic:'vocab', minutes:20}).estimatedSeconds,15);
  assert.equal(timing({id:'o-2021_1-mIV', subject:'math', official:true, selfGrade:true}).estimatedSeconds,600);
  assert.equal(timing({id:'o-2021_1-mI-1', subject:'math', official:true, selfGrade:true}).estimatedSeconds,480);
  assert.equal(questionKind({id:'m1', subject:'math', topic:'integral'}),'short');
});

test('listening never gets a budget shorter than its supplied audio plus answer time', () => {
  const result=timing({id:'l', subject:'japanese', topic:'listening', official:true, audioDurationSeconds:185});
  assert.equal(result.estimatedSeconds,210);
  assert.equal(result.includesReview,false);
});

test('calibration needs five distinct independent first successes of comparable units', () => {
  const bank=Array.from({length:8},(_,i)=>({id:'p'+i,subject:'physics',official:true}));
  const attempts=bank.slice(0,4).map((q,i)=>({questionId:q.id,correct:true,seconds:[40,60,70,80][i]}));
  assert.equal(timing(bank[7],attempts,bank).calibrated,false);
  attempts.push({questionId:'p4',correct:true,seconds:65});
  assert.equal(timing(bank[7],attempts,bank).estimatedSeconds,65);
  assert.equal(timing(bank[7],attempts,bank).sampleCount,5);
});

test('hints, transfers, retries and a different unit cannot inflate calibration evidence', () => {
  const target={id:'target',subject:'physics',official:true};
  const bank=[target,...['hint','transfer','retry','single'].map(id=>({id,subject:'physics',official:true})),{id:'base',subject:'physics'}];
  const attempts=[
    {questionId:'hint',correct:true,hinted:true,seconds:200},
    {questionId:'transfer',correct:true,reviewOf:'other',seconds:200},
    {questionId:'retry',correct:false,seconds:200},
    {questionId:'retry',correct:true,seconds:200},
    {questionId:'single',correct:true,seconds:100},
    {questionId:'single',correct:true,seconds:200},
    {questionId:'base',correct:true,seconds:200}
  ];
  const result=timing(target,attempts,bank);
  assert.equal(result.calibrated,false);
  assert.equal(result.sampleCount,1);
  assert.equal(result.estimatedSeconds,120);
});

test('one outlier cannot turn a one-minute item into an hour of assigned work', () => {
  const bank=Array.from({length:5},(_,i)=>({id:'m'+i,subject:'math'}));
  const attempts=bank.map(q=>({questionId:q.id,correct:true,seconds:3600}));
  assert.equal(timing(bank[0],attempts,bank).estimatedSeconds,90);
});

test('same chapter, coarse language operation and original id do not certify transfer', () => {
  assert.equal(transferRelation({id:'a',subject:'physics',topic:'wave',skill:'wave'},{id:'b',subject:'physics',topic:'wave',skill:'wave'}).eligible,false);
  assert.equal(transferRelation({id:'a',subject:'japanese',topic:'listening',skill:'listen-main'},{id:'b',subject:'japanese',topic:'listening',skill:'listen-main'}).eligible,false);
  const q={id:'p',subject:'physics',skill:'wave-speed'};
  assert.equal(transferRelation(q,q).eligible,false);
});

test('same fine operation qualifies but a simpler question only provides a bridge', () => {
  const a={id:'a',subject:'physics',official:true,skill:'capacitor-condition'};
  const b={id:'b',subject:'physics',official:true,skill:'capacitor-condition'};
  const c={id:'c',subject:'physics',skill:'capacitor-condition'};
  assert.equal(transferRelation(a,b).demonstratesMastery,true);
  assert.equal(transferRelation(a,c).kind,'bridge');
  assert.equal(transferRelation(a,c).demonstratesMastery,false);
});

test('authored verification can connect a reviewed pair without fuzzy topic matching', () => {
  const a={id:'a',subject:'math',official:true,skill:'math-probability',verifiedTransferWith:['b']};
  const b={id:'b',subject:'math',official:true,skill:'math-probability'};
  assert.equal(transferRelation(a,b).verifiedBy,'authored-pair');
  assert.equal(transferRelation(a,{...b,id:'c'}).eligible,false);
});

test('used candidates are exhausted honestly and unrelated similar titles never fill the gap', () => {
  const a={id:'a',subject:'physics',skill:'wave-speed'},b={id:'b',subject:'physics',skill:'wave-speed'},c={id:'c',subject:'physics',skill:'wave-direction'};
  assert.deepEqual(transferCandidates(a,[a,b,c]).map(q=>q.questionId),['b']);
  assert.deepEqual(transferCandidates(a,[a,b,c],[{questionId:'b'}]),[]);
});
