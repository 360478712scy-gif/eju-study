// Summary after a session: accuracy, time, mock estimate, wrong items (reviewable in place) and the next step.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Item, PracticeSession, SessionAnswer, Subject } from '@shared/types.ts';
import { blockItems, startBlock, startSession } from '@shared/actions.ts';
import { gradeItem } from '@shared/grading.ts';
import { MOCK_LABEL, sessionLabel } from '@shared/bank.ts';
import { update, useApp } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { Button, IconButton, Ring, SubjectTag } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { optionBadge, optionLabel } from '../../components/question/OptionList.tsx';
import { SUBJECT_NAME, cx, fmtClock } from '../../lib/format.ts';
import { correctionIds, resultRows } from '../mock/mockData.ts';
import { ReviewStage } from './ReviewStage.tsx';

function verdict(a: SessionAnswer | undefined): 'right' | 'wrong' | 'gave' | 'blank' | 'todo' {
  if (!a || !a.submitted) return 'todo';
  if (a.correct) return 'right';
  if (a.response === null || a.response === undefined) return a.gaveUp ? 'blank' : 'wrong';
  return a.gaveUp ? 'gave' : 'wrong';
}

function answerText(item: Item, a: SessionAnswer | undefined): string {
  const v = verdict(a);
  if (v === 'todo') return '没做';
  if (v === 'blank') return '未作答';
  if (item.format === 'choice') {
    const right = item.answer !== undefined ? optionBadge(optionLabel(item, item.answer)) : '?';
    if (v === 'right') return `答对 · ${right}`;
    const mine = typeof a?.response === 'number' ? optionBadge(optionLabel(item, a.response)) : '—';
    return v === 'gave' ? `看了解析 · 正解 ${right}` : `选 ${mine} · 正解 ${right}`;
  }
  const g = gradeItem(item, a?.response ?? null).groups || [];
  const ok = g.filter((x) => x.correct).length;
  return v === 'gave' ? '看了解析' : `对 ${ok} / ${g.length} 组`;
}

function headline(acc: number, wrong: number, done: number): string {
  if (done === 0) return '这组还没开始做';
  if (wrong === 0) return '全对，干净利落';
  if (acc >= 0.85) return '做得很稳';
  if (acc >= 0.65) return '完成了，再把错题吃透';
  return '完成了，今天的错题最值钱';
}

export function FinishView({ session, items }: { session: PracticeSession; items: Item[] }) {
  const mocks = useApp((s) => s.state!.mocks);
  const topics = useApp((s) => s.bank!.topics);
  const state = useApp((s) => s.state!);
  const bank = useApp((s) => s.bank!);
  const today = useApp((s) => s.today);
  const [review, setReview] = useState<{ list: Item[]; start: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const openReview = (list: Item[], start: number) => {
    savedScroll.current = rootRef.current?.parentElement?.scrollTop ?? 0;
    setReview({ list, start });
  };
  // Come back to the same place in the summary after reviewing an item.
  useLayoutEffect(() => {
    if (!review && savedScroll.current && rootRef.current?.parentElement) rootRef.current.parentElement.scrollTop = savedScroll.current;
  }, [review]);

  const mock = useMemo(
    () => (session.mock ? [...mocks].reverse().find((m) => m.startedAt === session.startedAt && m.kind === session.mock!.kind && m.session === session.mock!.session) : undefined),
    [mocks, session],
  );

  // Mock correction: today's planned correction block for this paper if there is one, else the
  // same set the mock result page offers (wrong, blank, partial and unsure answers).
  const correction = useMemo(() => {
    if (!mock) return null;
    const block = state.plans[today]?.blocks.find((b) => b.status === 'todo' && b.reviewOfMock?.kind === mock.kind && b.reviewOfMock.session === mock.session);
    const ids = block ? blockItems(state, bank, block).map((it) => it.id) : correctionIds(resultRows(state, bank, mock));
    // Correction is the obvious next step when it is also the next thing on today's plan.
    const first = !!block && state.plans[today]?.blocks.find((b) => b.status === 'todo')?.id === block.id;
    return { blockId: block?.id, ids, first };
  }, [mock, state, bank, today]);

  const total = items.length;
  const correct = items.filter((it) => session.answers[it.id]?.correct).length;
  const todo = items.filter((it) => verdict(session.answers[it.id]) === 'todo');
  const wrong = items.filter((it) => {
    const v = verdict(session.answers[it.id]);
    return v !== 'right' && v !== 'todo';
  });
  const right = items.filter((it) => verdict(session.answers[it.id]) === 'right');
  const done = total - todo.length;
  const hasBlanks = items.some((it) => it.format === 'blanks');
  const doneItems = items.filter((it) => verdict(session.answers[it.id]) !== 'todo');
  const scoreSum = doneItems.reduce((s, it) => {
    const a = session.answers[it.id];
    return s + (a?.score ?? (a?.correct ? 1 : 0));
  }, 0);
  // Blanks items earn partial credit per box group, so their sets show a score rate;
  // a mock shows its own (time-weighted) raw score, the number its prediction is built on.
  const acc = mock ? mock.raw : done ? (hasBlanks ? scoreSum / done : correct / done) : 0;
  /** Timed set (not a mock): questions left empty stay fresh and are not in the mistake book. */
  const freshBlanks = session.exam && session.kind !== 'mock' ? wrong.filter((it) => verdict(session.answers[it.id]) === 'blank').length : 0;
  const booked = wrong.length - freshBlanks;
  const used = session.elapsedSec;
  const planned = session.timeLimitSec ?? items.reduce((s, it) => s + it.targetSec, 0);
  const worked = doneItems.filter((it) => {
    const v = verdict(session.answers[it.id]);
    return v === 'right' || v === 'wrong';
  });
  const itemSecs = worked.reduce((s, it) => s + (session.answers[it.id]?.seconds ?? 0), 0);
  const avg = worked.length ? itemSecs / worked.length : 0;
  const avgTarget = worked.length ? worked.reduce((s, it) => s + it.targetSec, 0) / worked.length : 0;
  const tone = wrong.length === 0 ? 'success' : acc >= 0.65 ? 'primary' : 'warning';

  const redo = () => {
    const s = update((d) =>
      startSession(d, { kind: 'review', title: `错题重做 · ${wrong.length} 题`, subject: session.subject, itemIds: wrong.map((it) => it.id) }),
    );
    navigate('/session/' + s.id);
  };

  const correct_ = () => {
    if (!mock || !correction?.ids.length) return;
    const s = update((d, bk, day) => {
      const b = correction.blockId ? d.plans[day]?.blocks.find((x) => x.id === correction.blockId && x.status === 'todo') : undefined;
      const fromPlan = b ? startBlock(d, bk, b) : null;
      return (
        fromPlan ??
        startSession(d, {
          kind: 'review',
          title: `模考订正 · ${sessionLabel(mock.session)} ${MOCK_LABEL[mock.kind]}`,
          subject: session.subject,
          itemIds: correction.ids,
        })
      );
    });
    navigate('/session/' + s.id);
  };

  if (review) return <ReviewStage session={session} list={review.list} start={review.start} onClose={() => setReview(null)} />;

  const row = (it: Item, list: Item[], i: number) => {
    const a = session.answers[it.id];
    const v = verdict(a);
    const n = items.indexOf(it) + 1;
    return (
      <button key={it.id} type="button" className={cx('pl-fin-row', `is-${v}`)} onClick={() => openReview(list, i)}>
        <span className="pl-fin-n num">{n}</span>
        <span className="pl-fin-row-main">
          <span className="pl-fin-row-title">{topics.get(it.topic)?.name ?? it.topic}</span>
          <span className="pl-fin-row-src">{it.source.label}</span>
        </span>
        <span className={cx('pl-fin-verdict', `is-${v}`)}>{answerText(it, a)}</span>
        <span className="pl-fin-time num">{fmtClock(a?.seconds ?? 0)}</span>
        <Icon name="right" size={16} className="pl-fin-chev" />
      </button>
    );
  };

  return (
    <div className="pl-fin" ref={rootRef}>
      <header className="pl-fin-top">
        <IconButton icon="arrowLeft" label="回到今日" onClick={() => navigate('/')} />
        <span className="pl-fin-top-title">{session.title}</span>
        <SubjectTag subject={session.subject} size="sm" />
      </header>

      <div className="pl-fin-wrap">
        <section className="pl-fin-hero">
          <Ring value={acc} size={148} stroke={12} tone={tone}>
            <span className="pl-fin-pct num">
              {Math.round(acc * 100)}
              <small>%</small>
            </span>
            <span className="pl-fin-pct-label">{mock || hasBlanks ? '得分率' : '正确率'}</span>
          </Ring>
          <div className="pl-fin-hero-main">
            <div className="pl-fin-eyebrow">
              <Icon name="checkCircle" size={14} />
              {session.exam ? '已交卷' : '本组完成'}
            </div>
            <h1 className="pl-fin-title">{headline(acc, wrong.length, done)}</h1>
            <p className="pl-fin-sub">
              {done === 0
                ? '这组没有作答记录，回到今日页挑下一项任务吧。'
                : mock && correction?.ids.length
                  ? `没拿到分和没把握的 ${correction.ids.length} 题趁热订正，错题已经进了错题本。`
                  : booked > 0
                    ? `错的 ${booked} 题已经进了错题本，2 天后再练。`
                    : wrong.length === 0
                      ? '这一组的题都拿下了，继续保持这个节奏。'
                      : ''}
              {freshBlanks > 0 && `没来得及做的 ${freshBlanks} 题不进错题本，之后还会出现。`}
              {todo.length > 0 && `还有 ${todo.length} 题没做，不算错。`}
            </p>
            <div className="pl-fin-stats">
              <div className="pl-fin-stat">
                <span className="pl-fin-stat-label">答对</span>
                <span className="pl-fin-stat-value num">
                  {correct}
                  <small> / {done}</small>
                </span>
              </div>
              <div className="pl-fin-stat">
                <span className="pl-fin-stat-label">用时</span>
                <span className={cx('pl-fin-stat-value num', used > planned * 1.15 && 'is-over')}>{fmtClock(used)}</span>
                <span className="pl-fin-stat-sub">计划 {fmtClock(planned)}</span>
              </div>
              <div className="pl-fin-stat">
                <span className="pl-fin-stat-label">平均每题</span>
                <span className={cx('pl-fin-stat-value num', avg > avgTarget * 1.15 && 'is-over')}>{worked.length ? fmtClock(avg) : '—'}</span>
                <span className="pl-fin-stat-sub">目标 {fmtClock(avgTarget || items[0].targetSec)}</span>
              </div>
            </div>
            <div className="pl-fin-cta">
              {mock && correction?.first && correction.ids.length > 0 ? (
                <>
                  <Button variant="primary" size="lg" icon="refresh" onClick={correct_}>
                    订正错题 · {correction.ids.length}
                  </Button>
                  <Button variant="secondary" size="lg" iconRight="arrowRight" onClick={() => navigate('/')}>
                    回到今日
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="lg" iconRight="arrowRight" onClick={() => navigate('/')}>
                  下一项任务
                </Button>
              )}
              {mock
                ? !correction?.first &&
                  !!correction?.ids.length && (
                    <Button variant="secondary" size="lg" icon="refresh" onClick={correct_}>
                      订正错题 · {correction.ids.length}
                    </Button>
                  )
                : wrong.length > 0 && (
                    <Button variant="secondary" size="lg" icon="refresh" onClick={redo}>
                      重做错题 · {wrong.length}
                    </Button>
                  )}
            </div>
          </div>
        </section>

        {mock && (
          <section className="pl-card pl-fin-mock">
            <div className="pl-fin-mock-main">
              <div className="pl-fin-eyebrow">
                <Icon name="target" size={14} />
                {sessionLabel(mock.session)} · {MOCK_LABEL[mock.kind]}
              </div>
              <div className="pl-fin-score">
                <span className="pl-fin-score-label">预测得分</span>
                <span className="pl-fin-score-num num">{mock.estimate}</span>
                <span className="pl-fin-score-of num">/ 200</span>
              </div>
              <div className="faint text-sm">
                原始得分率 {Math.round(mock.raw * 100)}% · 答对 {mock.correct} / {mock.total}
              </div>
            </div>
            {mock.bySubject && Object.keys(mock.bySubject).length > 1 && (
              <div className="pl-fin-subjects">
                {(Object.entries(mock.bySubject) as [Subject, { correct: number; total: number; raw: number; estimate: number }][]).map(([subj, b]) => (
                  <div key={subj} className={cx('pl-fin-subj', `tone-${subj}`)}>
                    <div className="row-between">
                      <span className="pl-fin-subj-name">{SUBJECT_NAME[subj]}</span>
                      <span className="num pl-fin-subj-est">
                        {b.estimate}
                        <small> 预测</small>
                      </span>
                    </div>
                    <div className="pl-fin-bar">
                      <div style={{ width: `${Math.round(b.raw * 100)}%` }} />
                    </div>
                    <span className="faint text-xs num">
                      {b.correct} / {b.total} 题
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Button variant="soft" iconRight="arrowRight" onClick={() => navigate('/mock/' + mock.id)}>
              模考分析
            </Button>
          </section>
        )}

        {wrong.length > 0 && (
          <section className="pl-card pl-fin-list">
            <header className="pl-card-head">
              <span className="pl-card-title">
                <Icon name="alert" size={15} />
                需要再看的题
                <span className="pl-fin-badge num">{wrong.length}</span>
              </span>
              <span className="faint text-xs">点开逐题看解析，可以问 AI</span>
            </header>
            <div className="pl-fin-rows">{wrong.map((it, i) => row(it, wrong, i))}</div>
          </section>
        )}

        {right.length > 0 && (
          <details className="pl-card pl-fin-list pl-fin-right" open={wrong.length === 0}>
            <summary className="pl-card-head">
              <span className="pl-card-title">
                <Icon name="checkCircle" size={15} />
                答对的题
                <span className="pl-fin-badge is-ok num">{right.length}</span>
              </span>
              <Icon name="down" size={16} className="pl-fin-sum-chev" />
            </summary>
            <div className="pl-fin-rows">{right.map((it, i) => row(it, right, i))}</div>
          </details>
        )}
      </div>
    </div>
  );
}
