import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { applyAction } from '../shared/actions.ts';
import { indexBank } from '../shared/bank.ts';
import type { AppState, Item, PracticeSession } from '../shared/types.ts';
import { bundle, fresh, now, written } from './fixtures.ts';

test('frontend routes render with real selector state and all question formats', async () => {
  const vite = await createServer({
    configFile: fileURLToPath(new URL('../app/vite.config.ts', import.meta.url)),
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  });
  try {
    const { App } = await vite.ssrLoadModule('/src/App.tsx') as typeof import('../app/src/App.tsx');
    const { Coach } = await vite.ssrLoadModule('/src/pages/coach/Coach.tsx') as typeof import('../app/src/pages/coach/Coach.tsx');
    const { StudyProvider } = await vite.ssrLoadModule('/src/lib/study.tsx') as typeof import('../app/src/lib/study.tsx');
    const { t } = await vite.ssrLoadModule('/src/copy/index.ts') as typeof import('../app/src/copy/index.ts');
    const choice = {
      ...bundle.items[0], id: 'smoke-choice', stem: '定数 $x$ を求める。',
      figures: [{ src: '/assets/smoke.svg' }],
    };
    const blanks: Item = {
      ...choice, id: 'smoke-blanks', format: 'blanks', stem: '$x = \\bx{A}$', options: undefined, answer: undefined, blanks: { A: '1' },
    };
    const content = { ...bundle, items: [...bundle.items, choice, blanks] };
    const bank = indexBank(content);
    const state = fresh();
    state.profile.onboarded = true;
    const render = (hash: string, data: AppState = state) => renderToString(createElement(App, { state: data, bundle: content, hash, date: '2026-11-19' }));
    for (const [route, title] of [
      ['#/', t.today.title], ['#/plan', t.plan.weekStripTitle], ['#/practice', t.practice.tabTopics],
      ['#/review', t.review.title], ['#/review?deck=cards', t.review.flipCardBtn], ['#/mock', t.mock.ejuRowTitle],
      ['#/notes?topic=chem.inorg.ions', t.notes.personal], ['#/insights', t.insights.forecastTitle], ['#/settings', t.settings.groupAppearanceTitle],
    ]) {
      assert.ok(render(route).includes(title), route);
    }
    assert.ok(render('#/', fresh()).includes(t.onboarding.step1Title));
    assert.ok(render('#/session/unavailable').includes(t.session.missing));
    const noop = () => {};
    const coach = renderToString(createElement(StudyProvider, {
      initialState: state, bundle: content, hash: '#/', initialDate: '2026-11-19',
      openCoach: noop, openSearch: noop, openQuickNote: noop,
      children: createElement(Coach, { open: true, onClose: noop, context: { item: choice } }),
    }));
    assert.ok(coach.includes(t.coach.welcomeWithQuestion));

    for (const [item, signature] of [[choice, 'class="katex"'], [blanks, t.session.mathSheetTitle], [written, t.session.revealWrittenAnswerBtn]] as const) {
      const learner = structuredClone(state);
      const session = applyAction(learner, bank, { type: 'startPractice', itemIds: [item.id] }, now) as PracticeSession;
      const html = render('#/session/' + session.id, learner);
      assert.ok(html.includes(signature), item.format);
      if (item === choice) assert.ok(html.includes('/assets/smoke.svg'), 'renders figures');
    }

    const learner = structuredClone(state);
    const paper = bank.papers.find(p => p.itemIds.includes(written.id))!;
    const examNow = new Date();
    const session = applyAction(learner, bank, { type: 'startMock', kind: paper.kind, session: paper.session }, examNow) as PracticeSession;
    const hash = '#/session/' + session.id;
    applyAction(learner, bank, { type: 'draft', sessionId: session.id, itemId: written.id, response: { text: 'V=BLv' }, seconds: 5 }, examNow);
    assert.ok(render(hash, learner).includes(t.session.examWrittenDraft));
    assert.ok(!render(hash, learner).includes(t.session.modelAnswerHeading));
    applyAction(learner, bank, { type: 'finish', sessionId: session.id }, examNow);
    assert.ok(render(hash, learner).includes(t.session.modelAnswerHeading));
    applyAction(learner, bank, { type: 'answer', sessionId: session.id, itemId: written.id, response: { method: 'self', text: 'V=BLv', marks: { '1': [4, 6] } }, seconds: 5 }, examNow);
    applyAction(learner, bank, { type: 'finish', sessionId: session.id }, examNow);
    assert.ok(render('#/mock?report=' + learner.mocks[0].id, learner).includes(t.mock.reportBreakdownTitle));
  } finally {
    await vite.close();
  }
});
