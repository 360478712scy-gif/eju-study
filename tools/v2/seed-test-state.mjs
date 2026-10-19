#!/usr/bin/env node
// Build a realistic test learner state (3 days of history) for UI development.
// usage: node tools/v2/seed-test-state.mjs <out-dir>   → writes <out-dir>/state-v2.json
import fs from 'node:fs';
import path from 'node:path';
import { migrateV1 } from '../../shared/migrate.ts';
import { indexBank, mockItems } from '../../shared/bank.ts';
import { ensurePlan, startBlock, submitAnswer, finishSession, startSession, recordVocab, addStudyTime } from '../../shared/actions.ts';
import { studyDate, addDays } from '../../shared/dates.ts';

const outDir = process.argv[2];
if (!outDir) throw new Error('out dir required');
const bundle = JSON.parse(fs.readFileSync('content/dist/bank.json', 'utf8'));
const bank = indexBank(bundle);
const v1 = JSON.parse(fs.readFileSync('data/state.json', 'utf8'));
const today = studyDate();
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const P = { math: 0.6, physics: 0.58, chemistry: 0.66, japanese: 0.74 };

const state = migrateV1(v1, new Date(addDays(today, -3) + 'T09:00:00'));
state.profile.onboarded = true;
state.profile.startDate = addDays(today, -3);

function answerFor(it, ok) {
  if (it.format === 'choice') return ok ? it.answer : (it.answer + 1) % it.options.length;
  const r = {};
  for (const [k, v] of Object.entries(it.blanks)) r[k] = ok || rnd() < 0.6 ? v : String((Number(v) + 1) % 10);
  return r;
}

for (let d = 3; d >= 1; d--) {
  const date = addDays(today, -d);
  const plan = ensurePlan(state, bank, date);
  const blocks = plan.blocks.filter((b) => b.itemIds.length).slice(0, d === 1 ? 3 : 5);
  for (const b of blocks) {
    const s = startBlock(state, bank, b, new Date(date + 'T10:00:00'));
    if (!s) continue;
    for (const id of s.itemIds) {
      const it = bank.byId.get(id);
      const ok = rnd() < P[it.subject];
      const sec = Math.round(it.targetSec * (0.7 + rnd() * 0.9));
      submitAnswer(state, bank, { sessionId: s.id, itemId: id, response: answerFor(it, ok), seconds: sec, confidence: rnd() < 0.15 ? 'unsure' : 'sure', date, now: new Date(date + 'T11:00:00') });
      addStudyTime(state, s.id, sec + 40, date);
    }
    finishSession(state, bank, s.id, date, new Date(date + 'T12:00:00'));
  }
  for (let i = 0; i < 40; i++) {
    const v = bundle.vocab[(3 - d) * 40 + i];
    recordVocab(state, { vocabId: v.id, skill: i % 2 ? 'meaning' : 'read', correct: rnd() < 0.75, response: '', seconds: 5, date, now: new Date(date + 'T09:30:00') });
  }
}
// One finished mock on a paper that is not scheduled.
const mockDate = addDays(today, -1);
const mockPaper = ['2015_2', '2016_1', '2016_2', '2017_1', '2017_2', '2018_1', '2021_1', '2020_2'].find((x) => mockItems(bank, 'science', x).length >= 30) || '2015_2';
const items = mockItems(bank, 'science', mockPaper);
if (items.length) {
  const s = startSession(state, { kind: 'mock', title: `理科模考 ${mockPaper}`, subject: 'mixed', itemIds: items.map((i) => i.id), mock: { kind: 'science', session: mockPaper }, exam: true, timeLimitSec: 4800 }, new Date(mockDate + 'T14:00:00'));
  for (const it of items) submitAnswer(state, bank, { sessionId: s.id, itemId: it.id, response: answerFor(it, rnd() < 0.62), seconds: 110, date: mockDate });
  addStudyTime(state, s.id, 4500, mockDate);
  finishSession(state, bank, s.id, mockDate, new Date(mockDate + 'T15:20:00'));
}
ensurePlan(state, bank, today);
state.revision = 1;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'state-v2.json'), JSON.stringify(state));
console.log(`seeded ${outDir}: ${state.attempts.length} attempts, ${Object.values(state.progress).filter((p) => p.inMistakes).length} mistakes, ${state.mocks.length} mock, plan blocks today ${state.plans[today].blocks.length}`);
