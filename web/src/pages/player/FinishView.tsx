// Summary after a session: accuracy, time, mock estimate, wrong items (reviewable in place) and the next step.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Item, PracticeSession, SessionAnswer, Subject } from '@shared/types.ts';
import { blockItems, startBlock, startSession } from '@shared/actions.ts';
import { gradeItem } from '@shared/grading.ts';
import { MOCK_LABEL, sessionLabel } from '@shared/bank.ts';
import { update, useApp } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { Button, IconButton, List, ListRow, Meta, Ring, StatTile, SubjectDot } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { optionBadge, optionLabel } from '../../components/question/OptionList.tsx';
import { SUBJECT_NAME, cx, fmtClock, fmtMinutes } from '../../lib/format.ts';
import { correctionIds, resultRows } from '../mock/mockData.ts';
import { blockView, runBlock } from '../today/blocks.ts';
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

/** "2015年第2回 物理 問13（解答番号13）" → "2015年第2回 物理 問13": the 問 tells rows apart, the topic goes to the meta line. */
function shortSource(label: string): string {
  return label.replace(/\s*[（(]解答番号[^）)]*[）)]\s*$/, '');
}

function headline(acc: number, wrong: number, booked: number, done: number): string {
  if (done === 0) return '这组还没开始做';
  if (wrong === 0) return '全对，干净利落';
  if (acc >= 0.85) return '这一组很稳';
  if (acc >= 0.6) return booked > 0 ? `不错，错的 ${booked} 题已排进错题本` : '不错，再把错题吃透';
  return `难度不小，先把这 ${wrong} 题弄懂`;
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
  // Indigo is for actions: a score is green when it is good, otherwise neutral (never red for a result).
  const tone = done > 0 && (wrong.length === 0 || acc >= 0.85) ? 'success' : 'neutral';

  // What comes next today, and how far along the day is.
  const plan = state.plans[today];
  const nextBlock = plan?.blocks.find((b) => b.id !== session.blockId && blockView(state, b) === 'todo');
  const dayBlocks = plan?.blocks.filter((b) => b.status !== 'skipped') ?? [];
  const dayDone = dayBlocks.filter((b) => b.status === 'done').length;
  const daySecs = state.days[today]?.seconds ?? 0;
  const goNext = () => {
    if (!nextBlock || nextBlock.kind === 'mock') navigate('/');
    else runBlock(state, bank, nextBlock);
  };
  const nextLabel = nextBlock ? `下一项：${nextBlock.title} · ${fmtMinutes(nextBlock.minutes)}` : '回到今日';

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
      <ListRow
        key={it.id}
        lead={<span className="pl-fin-n num">{n}</span>}
        title={shortSource(it.source.label)}
        meta={topics.get(it.topic)?.name ?? it.topic}
        trail={
          <>
            <span className={cx('pl-fin-verdict', `is-${v}`)}>{answerText(it, a)}</span>
            <span className="pl-fin-time num">{fmtClock(a?.seconds ?? 0)}</span>
          </>
        }
        chevron
        onClick={() => openReview(list, i)}
      />
    );
  };

  const ringLabel = mock ? '得分率' : hasBlanks ? '按组得分' : '正确率';
  const title = headline(acc, wrong.length, booked, done);
  /** The headline already says the wrong ones are in the mistake book (60–85%). */
  const titleBooked = title.includes('错题本');
  const sub =
    done === 0
      ? '这组没有作答记录，回到今日页挑下一项任务吧。'
      : [
          mock && correction?.ids.length
            ? `没拿到分和没把握的 ${correction.ids.length} 题趁热订正${titleBooked || !booked ? '' : '，错题已经进了错题本'}。`
            : booked > 0 && !titleBooked
              ? `错的 ${booked} 题已经进了错题本，2 天后再练。`
              : wrong.length === 0
                ? '这一组的题都拿下了，继续保持这个节奏。'
                : booked > 0
                  ? '2 天后再练一次，趁现在先看懂。'
                  : '',
          freshBlanks > 0 ? `没来得及做的 ${freshBlanks} 题不进错题本，之后还会出现。` : '',
          todo.length > 0 ? `还有 ${todo.length} 题没做，不算错。` : '',
        ].join('');

  return (
    <div className="pl-fin" ref={rootRef}>
      <header className="pl-fin-top">
        <IconButton icon="arrowLeft" label="回到今日" tooltipSide="bottom" onClick={() => navigate('/')} />
        <SubjectDot subject={session.subject} />
        <span className="pl-fin-top-title">{session.title}</span>
      </header>

      <div className="pl-fin-wrap">
        <section className="card card-hero pl-fin-hero">
          <Ring value={acc} size={140} stroke={10} tone={tone}>
            <span className="pl-fin-pct num num-xl">
              {Math.round(acc * 100)}
              <span className="pl-fin-pct-unit">%</span>
            </span>
            <span className="pl-fin-pct-label">{ringLabel}</span>
          </Ring>
          <div className="pl-fin-hero-main">
            <div className="pl-fin-eyebrow">
              <Icon name="checkCircle" size={14} />
              {session.exam ? '已交卷' : '本组完成'}
            </div>
            <h1 className="pl-fin-title">{title}</h1>
            {sub && <p className="pl-fin-sub">{sub}</p>}
            <div className="pl-fin-stats">
              <StatTile label={hasBlanks ? '全对' : '答对'} value={correct} unit={`/ ${done} 题`} size="lg" />
              <StatTile label="用时" value={fmtClock(used)} sub={`计划 ${fmtClock(planned)}`} size="lg" tone={used > planned * 1.15 ? 'warning' : undefined} />
              <StatTile
                label="平均每题"
                value={worked.length ? fmtClock(avg) : '—'}
                sub={`目标 ${fmtClock(avgTarget || items[0].targetSec)}`}
                size="lg"
                tone={avg > avgTarget * 1.15 ? 'warning' : undefined}
              />
            </div>
            {plan && dayBlocks.length > 0 && session.blockId && (
              <Meta className="pl-fin-day">
                <span>
                  今日 <span className="num">{dayDone}</span> / <span className="num">{dayBlocks.length}</span> 项
                </span>
                <span>已学 {fmtMinutes(daySecs / 60)}</span>
              </Meta>
            )}
            <div className="pl-fin-cta">
              {mock && correction?.first && correction.ids.length > 0 ? (
                <>
                  <Button variant="primary" size="lg" icon="refresh" onClick={correct_}>
                    订正错题 · {correction.ids.length}
                  </Button>
                  <Button variant="secondary" size="lg" iconRight="arrowRight" onClick={goNext}>
                    {nextLabel}
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="lg" iconRight="arrowRight" onClick={goNext}>
                  {nextLabel}
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
          <section className="card card-flush pl-fin-list">
            <header className="card-head pl-fin-list-head">
              <div>
                <h3 className="card-title">
                  需要再看的题 <span className="pl-fin-count num">{wrong.length}</span>
                </h3>
                <p className="card-sub">点开逐题看解析，可以问 AI</p>
              </div>
            </header>
            <List>{wrong.map((it, i) => row(it, wrong, i))}</List>
          </section>
        )}

        {right.length > 0 && (
          <details className="card card-flush pl-fin-list pl-fin-right" open={wrong.length === 0}>
            <summary className="pl-fin-sum">
              <h3 className="card-title">
                答对的题 <span className="pl-fin-count num">{right.length}</span>
              </h3>
              <Icon name="down" size={16} className="pl-fin-sum-chev" />
            </summary>
            <List>{right.map((it, i) => row(it, right, i))}</List>
          </details>
        )}
      </div>
    </div>
  );
}
