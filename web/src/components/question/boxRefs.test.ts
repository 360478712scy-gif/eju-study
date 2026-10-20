// Range references ("\bx{C} 〜 \bx{G} には…") are labels, not boxes to fill.
// Run: node --test web/src/components/question/boxRefs.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { markRangeRefs, markSlot, rangeRefLabel, SLOT_LABEL } from './boxRefs.ts';

const STEM = '(1)　次の文中の \\bx{C} 〜 \\bx{G} には，下の ⓪ 〜 ⑨ の中から適するものを選びなさい。\n\n(i)　$0<b\\leqq\\bx{C}$ のとき';

test('a range reference becomes two static label chips', () => {
  const out = markRangeRefs(STEM);
  assert.ok(out.includes('\\bx{0C} 〜 \\bx{0G}'));
  assert.equal(rangeRefLabel('0C'), 'C');
  assert.equal(rangeRefLabel('0G'), 'G');
});

test('real boxes, inside or outside math, are untouched', () => {
  const out = markRangeRefs(STEM);
  assert.ok(out.includes('$0<b\\leqq\\bx{C}$'));
  assert.equal(markRangeRefs('\\bx{A} と \\bx{B}'), '\\bx{A} と \\bx{B}');
  assert.equal(rangeRefLabel('C'), null);
  assert.equal(rangeRefLabel('7'), null);
  assert.equal(rangeRefLabel(SLOT_LABEL), null);
});

test('full-width and ASCII tildes both count as a range', () => {
  assert.equal(markRangeRefs('\\bx{L}～\\bx{N}'), '\\bx{0L}～\\bx{0N}');
  assert.equal(markRangeRefs('\\bx{L} ~ \\bx{N}'), '\\bx{0L} ~ \\bx{0N}');
});

test('only the first grammar blank becomes the slot', () => {
  const s = '知識が深まった（　　）。\n\n（　　）に入る最も適当なものはどれですか。';
  const out = markSlot(s);
  assert.ok(out.startsWith(`知識が深まった\\bx{${SLOT_LABEL}}。`));
  assert.ok(out.includes('（　　）に入る'));
});
