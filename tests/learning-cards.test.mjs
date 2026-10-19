import test from 'node:test';
import assert from 'node:assert/strict';
import {LEARNING_CARDS as cards} from '../public/learning-cards.js';

const byId = new Map(cards.map(card => [card.id, card]));
const q = id => byId.get(id).check;
const selected = id => q(id).options[q(id).answer];
const close = (actual, expected, epsilon = 1e-7) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} differs from ${expected}`);
function simpson(f, a, b, n = 2000) {
  const h = (b - a) / n;
  let total = f(a) + f(b);
  for (let i = 1; i < n; i++) total += (i % 2 ? 4 : 2) * f(a + i * h);
  return total * h / 3;
}

test('36 cards cover every requested weak topic and each carries a complete retrieval-to-application sequence', () => {
  assert.equal(cards.length, 36);
  assert.equal(byId.size, cards.length);
  const counts = Object.fromEntries([...new Set(cards.map(c => c.topic))].map(t => [t, cards.filter(c => c.topic === t).length]));
  assert.deepEqual(counts, {trig:8, integral:6, wave:6, electric:4, magnetic:2, purify:4, organic:6});
  for (const card of cards) {
    for (const field of ['id', 'subject', 'topic', 'skill', 'title', 'recallPrompt', 'answer']) {
      assert.equal(typeof card[field], 'string', `${card.id}.${field}`);
      assert.ok(card[field].trim().length > 0, `${card.id}.${field}`);
    }
    assert.ok(card.keyPoints.length >= 3, card.id);
    assert.ok(card.pitfalls.length >= 2, card.id);
    assert.ok(card.workedExample.steps.length >= 2, card.id);
    assert.ok(card.workedExample.answer.length > 0, card.id);
    assert.notEqual(card.workedExample.prompt, card.check.prompt, card.id);
    assert.equal(card.check.options.length, 4, card.id);
    assert.equal(new Set(card.check.options).size, 4, card.id);
    assert.ok(Number.isInteger(card.check.answer) && card.check.answer >= 0 && card.check.answer < 4, card.id);
    assert.ok(card.check.explanation.length > 20, card.id);
    assert.ok(card.estimatedSeconds >= 120 && card.estimatedSeconds <= 180, card.id);
    assert.match(card.metadataSource, /^https:\/\/www\.jasso\.go\.jp\//);
    assert.match(card.sourceNote, /原创.*非官方真题/);
  }
});

test('108 term entries provide Japanese spelling, pronunciation, Chinese meaning and a contextual sentence', () => {
  const terms = cards.flatMap(c => c.terms);
  assert.equal(terms.length, 108);
  assert.equal(new Set(terms.map(t => t.ja)).size, 107);
  for (const card of cards) {
    assert.equal(card.terms.length, 3, card.id);
    for (const term of card.terms) {
      for (const name of ['ja', 'reading', 'zh', 'context']) assert.ok(term[name]?.trim().length, `${card.id}:${name}`);
      assert.match(term.reading, /^[\u3040-\u30ffー]+$/, `${card.id}:${term.reading}`);
      assert.ok(term.context.includes(term.ja), `${card.id}: term not used in context`);
    }
  }
});

test('trigonometry check answers are independently recalculated, including restricted-domain maximum and all roots', () => {
  const pi = Math.PI, sqrt = Math.sqrt;
  const pairs = [[sqrt(3)/2,1/sqrt(3)],[-sqrt(3)/2,-1/sqrt(3)],[-.5,-sqrt(3)],[-sqrt(3)/2,1/sqrt(3)]];
  const pair = pairs[q('lc-trig-01').answer];
  close(pair[0], Math.cos(5*pi/6)); close(pair[1], Math.tan(5*pi/6));
  const values2 = [(sqrt(6)+sqrt(2))/4,(sqrt(3)-1)/2,(sqrt(6)-sqrt(2))/4,sqrt(2)/4];
  close(values2[q('lc-trig-02').answer], Math.cos(75*pi/180));
  const values3 = [-.5,.5,-sqrt(3)/2,sqrt(3)/2];
  close(values3[q('lc-trig-03').answer], -sqrt((1-.5)/2));
  const values4 = [sqrt(2),1,sqrt(3)/2,(1+sqrt(3))/2];
  const maxOnInterval = Math.max(...Array.from({length:1001}, (_,i) => Math.sin(i*pi/6000)+Math.cos(i*pi/6000)));
  close(values4[q('lc-trig-04').answer], maxOnInterval);
  const roots = [[pi/12,5*pi/12],[7*pi/12,11*pi/12],[7*pi/6,11*pi/6],[7*pi/12]][q('lc-trig-05').answer];
  assert.equal(roots.length, 2);
  for (const x of roots) { assert.ok(x >= 0 && x < pi); close(Math.sin(2*x), -.5); }
  assert.equal(selected('lc-trig-06'), '周期π，左移π/6');
  assert.match(byId.get('lc-trig-06').keyPoints.join(''),/A=0或b=0.*没有最小正周期/);
  close(2*pi/2, pi); close(-(pi/3)/2, -pi/6);
  close([1,5/6,1/5,5/7][q('lc-trig-07').answer], (.5+1/3)/(1-.5/3));
  close([2,sqrt(52),2*sqrt(7),sqrt(12)][q('lc-trig-08').answer], sqrt(4**2+6**2-2*4*6*Math.cos(pi/3)));
});

test('integral check answers agree with differentiation and independent numerical quadrature', () => {
  const antiderivatives = [x=>2*x**3-2*x**2+x,x=>6*x**3-4*x**2+x,x=>2*x**3-4*x**2+x,x=>12*x-4];
  const f = antiderivatives[q('lc-integral-01').answer], h = 1e-5;
  for (const x of [-.7,.3,1.5]) close((f(x+h)-f(x-h))/(2*h), 6*x*x-4*x+1, 1e-6);
  close([3,4.5,2.5,.5][q('lc-integral-02').answer], simpson(x=>3*x*x*(x**3+2),0,1));
  const e2 = Math.exp(2);
  close([2*e2,e2-1,e2,e2+1][q('lc-integral-03').answer], simpson(x=>x*Math.exp(x),0,2));
  close([0,2,4,6][q('lc-integral-04').answer], simpson(x=>x**5+3*x*x+1,-1,1));
  close([4.5,9,1.5,13.5][q('lc-integral-05').answer], simpson(x=>Math.abs(3*x-x*x),0,3));
  close([18,36,12,9][q('lc-integral-06').answer]*Math.PI, simpson(x=>Math.PI*(2*x)**2,0,3));
});

test('wave checks keep propagation direction, phase delay and boundary conditions consistent', () => {
  close([.5,1.5,2.7,4.5][q('lc-wave-01').answer], .90/(.60/3));
  close([.06,-.06,-.006,0][q('lc-wave-02').answer], 3*(-.02));
  const delays = [[.15,Math.PI/2],[.30,Math.PI/2],[.15,Math.PI/4],[.60,2*Math.PI]];
  const [dt,phase] = delays[q('lc-wave-03').answer];
  close(dt,.30/(1.20/.60)); close(phase,2*Math.PI*.30/1.20);
  close([40,80,160,320][q('lc-wave-04').answer],2*80/(2*.50));
  close([170,340,680,510][q('lc-wave-05').answer],3*340/(4*.50));
  close(.90/.30,3); assert.equal(selected('lc-wave-06'),'相长');
  assert.match(byId.get('lc-wave-06').answer,/同相/);
  assert.match(byId.get('lc-wave-05').keyPoints.join(''),/位移图和压强图/);
  assert.match(byId.get('lc-wave-01').answer,/最小正间距/);
  assert.match(byId.get('lc-wave-02').keyPoints.join(''),/纵波图.*沿轴方向/);
});

test('electromagnetism checks preserve charge signs, capacitor constraints and right-hand orientation', () => {
  assert.equal(selected('lc-em-01'),'E=0，V=270V'); close(2*9e9*3e-9/.20,270);
  assert.equal(selected('lc-em-02'),'+2.0×10⁻⁵J'); close((-1e-6)*(5-25),2e-5,1e-12);
  assert.equal(selected('lc-em-03'),'1/3倍'); close((1/3)*1**2/2/(1**2/2),1/3);
  close([3,9,12,36][q('lc-em-04').answer],6**2/4);
  const v=[1,0,0],b=[0,0,1],cross=[v[1]*b[2]-v[2]*b[1],v[2]*b[0]-v[0]*b[2],v[0]*b[1]-v[1]*b[0]];
  assert.deepEqual(cross,[0,-1,0]); assert.equal(selected('lc-em-05'),'−y');
  close(20*.010*Math.abs(.20-.50)/.10,.60);
  assert.equal(selected('lc-em-06'),'0.60V，顺时针');
  assert.match(byId.get('lc-em-06').check.prompt,/向里.*匀减/);
  assert.match(byId.get('lc-em-06').check.prompt,/闭合.*无外加电源/);
  assert.match(byId.get('lc-em-06').check.explanation,/向里补偿减少/);
});

test('chemical check answer keys reflect specific candidates and conditions rather than unlimited rules', () => {
  const correct = {
    'lc-purify-01':'滤液，再结晶', 'lc-purify-02':'NaOH水溶液',
    'lc-purify-03':'CaO', 'lc-purify-04':'适量盐酸',
    'lc-organic-01':'CH₃COCH₃', 'lc-organic-02':'丙醛CH₃CH₂CHO',
    'lc-organic-03':'乙酸', 'lc-organic-04':'CH₃COONa与CH₃OH',
    'lc-organic-05':'加NaOH使水层呈碱性', 'lc-organic-06':'0.25mol',
  };
  for (const [id, answer] of Object.entries(correct)) assert.equal(selected(id),answer,id);
  assert.match(byId.get('lc-organic-02').keyPoints.join(''),/甲酸、还原糖/);
  assert.match(byId.get('lc-organic-06').keyPoints.join(''),/酚.*其他反应/);
  assert.match(byId.get('lc-purify-02').keyPoints.join(''),/有机层不总在上层/);
  assert.match(byId.get('lc-purify-04').keyPoints.join(''),/过滤应在酸化前/);
  close(.25*1,.25); // one C=C consumes one mole of Br2 per mole of propene
});
