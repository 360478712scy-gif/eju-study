import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {VOCAB,QUESTIONS} from '../public/content.js';
import {VOCAB_EXPANDED,QUESTIONS_EXPANDED} from '../public/vocabulary-expanded.js';
import {VOCAB_CONTENT,VOCAB_CONTENT_METADATA,getVocabContent} from '../public/vocab-content.js';

// Fixed first-day scope, read once from the existing plan; tests never access or
// rewrite the user's production state and are stable as later days accumulate.
const firstDayIds=['vx140','vx290','v25','vx064','vx012','vx162','vx086','vx217','vx141','vx291','v26','vx239','vx013','vx163','vx218','vx035','vx185','vx240','vx057','vx014','vx164','v1','vx112','vx262','vx036','vx186','vx134','vx241','v19','vx058','vx113','vx263','vx080','v20','vx135','vx285','vx059','vx007','vx157','vx264'];
const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/pronunciation/manifest.json',import.meta.url),'utf8'));
const originals=new Map([...VOCAB,...VOCAB_EXPANDED].map(v=>[v.questionId||v.id,v]));

test('all 330 entries retain the exact spellings and readings used by existing offline audio',()=>{
  assert.equal(Object.keys(VOCAB_CONTENT).length,330);
  assert.deepEqual(Object.keys(VOCAB_CONTENT).sort(),Object.keys(manifest.vocabularyByQuestionId).sort());
  for(const [id,entry] of Object.entries(VOCAB_CONTENT)){
    const spoken=manifest.vocabularyByQuestionId[id];
    assert.equal(entry.word,spoken.word,id);assert.equal(entry.reading,spoken.reading,id);
    assert.match(entry.reading,/^[ぁ-ゖァ-ヺー・\s]+$/u,id);
    assert.ok(entry.meaning.length>=5,id);assert.match(entry.meaning,/[\u3400-\u9fff]/u,id);
    assert.notEqual(entry.meaning,entry.word,id);
    assert.equal(getVocabContent(id),entry);
  }
  assert.equal(getVocabContent('not-a-question'),null);
  assert.equal(getVocabContent('__proto__'),null);
});

test('the full real first-day scope has audited meaning and novel-context assessments; other modes remain unavailable',()=>{
  assert.deepEqual(VOCAB_CONTENT_METADATA.reviewedQuestionIds,firstDayIds);
  assert.deepEqual(VOCAB_CONTENT_METADATA.coverage,{entries:330,reading:330,meaning:330,meaningAssessment:40,cloze:40});
  const audited=new Set(firstDayIds);
  for(const [id,entry] of Object.entries(VOCAB_CONTENT))if(!audited.has(id)){
    assert.equal(entry.meaningOptions,null,id);assert.equal(entry.meaningAnswer,null,id);assert.equal(entry.cloze,null,id);
  }
});

test('every assessment has four distinct options and balanced answer positions without reading or word leakage',()=>{
  const meanings=[0,0,0,0],clozes=[0,0,0,0];
  let strictLongest=0,strictShortest=0;
  for(const id of firstDayIds){
    const entry=getVocabContent(id),c=entry.cloze;
    assert.equal(entry.meaningOptions.length,4,id);assert.equal(new Set(entry.meaningOptions).size,4,id);
    assert.ok(Number.isInteger(entry.meaningAnswer)&&entry.meaningAnswer>=0&&entry.meaningAnswer<4,id);
    for(const option of entry.meaningOptions){assert.match(option,/[\u3400-\u9fff]/u,id);assert.doesNotMatch(option,/[ぁ-ゖァ-ヺ]/u,id);assert.notEqual(option,entry.word,id);}
    assert.equal(c.options.length,4,id);assert.equal(new Set(c.options).size,4,id);
    assert.ok(Number.isInteger(c.answer)&&c.answer>=0&&c.answer<4,id);assert.equal(c.options[c.answer],entry.word,id);
    assert.equal((c.prompt.match(/（　）/g)||[]).length,1,id);
    assert.ok(!c.prompt.includes(entry.word),id+' leaks the target word');
    assert.ok(c.explanation.includes(entry.word),id);assert.ok(c.explanation.length>=35,id);
    assert.notEqual(c.prompt,originals.get(id).example.replace(entry.word,'（　）'),id+' merely deleted the original target');
    const size=entry.meaningOptions[entry.meaningAnswer].length,others=entry.meaningOptions.filter((_,i)=>i!==entry.meaningAnswer).map(s=>s.length);
    if(size>Math.max(...others))strictLongest++;
    if(size<Math.min(...others))strictShortest++;
    meanings[entry.meaningAnswer]++;clozes[c.answer]++;
  }
  assert.deepEqual(meanings,[10,10,10,10]);assert.deepEqual(clozes,[10,10,10,10]);
  assert.ok(strictLongest<=15,`longest option shortcut: ${strictLongest}/40`);
  assert.ok(strictShortest<=15,`shortest option shortcut: ${strictShortest}/40`);
});

test('first-day confusions are explained with correct kana, concrete distinctions and defined contexts',()=>{
  assert.equal(getVocabContent('vx290').reading,'きんとう');
  assert.equal(getVocabContent('vx291').reading,'きんいつ');
  assert.equal(getVocabContent('vx185').reading,'こかつ');
  assert.equal(getVocabContent('vx012').reading,'かりに');
  assert.match(getVocabContent('vx290').meaning,/分配/);assert.match(getVocabContent('vx291').meaning,/内部一致/);
  assert.ok(!getVocabContent('vx290').cloze.options.includes('均一'),'do not treat overlapping collocations as unambiguous opposites');
  assert.ok(!getVocabContent('vx291').cloze.options.includes('均等'));
  assert.match(getVocabContent('vx064').cloze.explanation,/一般.*選ぶ/);
  assert.match(getVocabContent('vx140').meaning,/物理.*单位面积.*Pa/);
  assert.doesNotMatch(getVocabContent('vx140').cloze.prompt,/単位面積当たりの（　）/,'pressure must not be divided by area a second time');
  assert.match(getVocabContent('vx113').meaning,/电路.*Ω/);
  assert.match(getVocabContent('vx072').meaning,/偶数.*中间两数/);
  assert.match(getVocabContent('vx117').meaning,/最小正距离/);
});

test('new assessment data stays separate from the historical questions and cannot be mutated in place',()=>{
  assert.ok(Object.isFrozen(VOCAB_CONTENT));
  for(const id of firstDayIds){
    const entry=getVocabContent(id),old=[...QUESTIONS,...QUESTIONS_EXPANDED].find(q=>q.id===id);
    assert.ok(old,id);assert.notEqual(entry.meaningOptions,old.options,id);
    assert.ok(Object.isFrozen(entry)&&Object.isFrozen(entry.meaningOptions)&&Object.isFrozen(entry.cloze)&&Object.isFrozen(entry.cloze.options));
  }
  assert.match(VOCAB_CONTENT_METADATA.source,/原创.*非.*官方/);
  assert.match(VOCAB_CONTENT_METADATA.assessmentNote,/未审核.*null/);
});
