import test from 'node:test';
import assert from 'node:assert/strict';
import {VOCAB, QUESTIONS} from '../public/content.js';
import {VOCAB_EXPANDED, QUESTIONS_EXPANDED} from '../public/vocabulary-expanded.js';

test('expanded vocabulary adds 300 distinct words and never duplicates an existing question or word', () => {
  assert.equal(VOCAB_EXPANDED.length, 300);
  assert.equal(new Set(VOCAB_EXPANDED.map(v => v.word)).size, 300);
  assert.equal(new Set(VOCAB_EXPANDED.map(v => v.id)).size, 300);
  const oldWords = new Set(VOCAB.map(v => v.word));
  const oldIds = new Set(QUESTIONS.map(q => q.id));
  for (const entry of VOCAB_EXPANDED) {
    assert.ok(!oldWords.has(entry.word), `Repeated vocabulary: ${entry.word}`);
    assert.ok(!oldIds.has(entry.id), `Repeated question id: ${entry.id}`);
    assert.equal(entry.questionId, entry.id);
  }
});

test('every card supplies pronunciation, Chinese meaning, original contextual sentence and provenance', () => {
  for (const entry of VOCAB_EXPANDED) {
    assert.ok(entry.reading.length > 0, entry.id);
    assert.match(entry.meaning, /[\u4e00-\u9fff]/, entry.id);
    assert.ok(entry.meaning.length >= 2, entry.id);
    assert.ok(entry.example.includes(entry.word), `${entry.id}: example lacks target word`);
    assert.ok(entry.example.endsWith('。'), entry.id);
    assert.match(entry.source, /原创.*非官方真题/);
    assert.match(entry.source, /不代表完整EJU词表/);
  }
});

test('all questions have four distinct options, one matching answer, and balanced answer positions', () => {
  assert.equal(QUESTIONS_EXPANDED.length, VOCAB_EXPANDED.length);
  const distribution = [0, 0, 0, 0];
  for (const question of QUESTIONS_EXPANDED) {
    assert.equal(question.options.length, 4, question.id);
    assert.equal(new Set(question.options).size, 4, question.id);
    assert.equal(question.options[question.answer], question.meaning, question.id);
    assert.equal(question.options.filter(x => x === question.meaning).length, 1, question.id);
    distribution[question.answer] += 1;
    assert.ok(question.explanation.includes(question.reading), question.id);
    assert.ok(question.explanation.includes(question.example), question.id);
  }
  assert.deepEqual(distribution, [75, 75, 75, 75]);
});

test('workload metadata treats a vocabulary recognition check as 15 seconds, not several minutes', () => {
  for (const question of QUESTIONS_EXPANDED) {
    assert.equal(question.subject, 'japanese');
    assert.equal(question.topic, 'vocab');
    assert.equal(question.type, 'vocab-card');
    assert.equal(question.assessment, 'recognition');
    assert.equal(question.seconds, 15);
    assert.equal(question.minutes, 0.25);
    assert.equal(question.skill, `vocab:${question.word}`);
    assert.ok(question.recallPrompt.includes(question.word));
  }
  // A complete first pass is 75 minutes of estimated active recognition, not
  // enough by itself to justify a 33-day Japanese study programme.
  assert.equal(QUESTIONS_EXPANDED.reduce((sum, q) => sum + q.minutes, 0), 75);
});

test('coverage includes ten distinct academic domains without missing rows', () => {
  const groups = new Map();
  for (const entry of VOCAB_EXPANDED) {
    groups.set(entry.category, (groups.get(entry.category) || 0) + 1);
  }
  assert.equal(groups.size, 10);
  assert.deepEqual([...groups.values()], Array(10).fill(30));
});
