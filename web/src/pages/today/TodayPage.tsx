// 今日 — the home screen. Answers "what do I do now?" at a glance: a state-driven heading, one
// hero card with the next step (its main button starts 跟学模式, which walks through the whole
// day), the next few tasks (each startable on its own) and the due reviews under them, and a side
// panel with progress, bedtime, the predicted score and the next mock. Tasks are shown in the
// order 跟学 takes them.
import { useEffect, useMemo, useState } from 'react';
import { useReady, update } from '../../lib/store.ts';
import { href } from '../../lib/router.ts';
import { Button, Dot, Tooltip, toast, useConfirm } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import type { AppState, DayPlan, PlanBlock } from '@shared/types.ts';
import { MOCK_LABEL, type BankIndex } from '@shared/bank.ts';
import { PHASE_INFO, POOLS, calendar, daysLeftOn, freshRemaining, phaseFor } from '@shared/planner.ts';
import { studyDate, weekdayZh } from '@shared/dates.ts';
import { cx, fmtDateShort, fmtMinutes } from '../../lib/format.ts';
import { DurationDialog } from './DurationDialog.tsx';
import { AfterExam, ExamDay } from './ExamDay.tsx';
import { blockKindLabel, blockView, openSessionFor, regenerateDay, resumableSession, runBlock, sessionAnswered } from './blocks.ts';
import { DoneHero, NextHero, RestHero, SkippedHero, StaleNotice, WaitingHero } from './hero.tsx';
import { PlanList, type Entry } from './PlanList.tsx';
import { flowOrder, startFlow, warmupTopics } from '../flow/flowState.ts';
import { BEDTIME_WINDOW, DueCard, MockCard, ProgressCard, ScoreCard, SleepCard, bedtimeFor, clockText, minutesToBed } from './aside.tsx';
import './today.css';

const NO_BLOCKS: PlanBlock[] = [];

export function TodayPage() {
  const { state, bank, today } = useReady();
  const left = daysLeftOn(state, today);
  if (left === 0) return <ExamDay />;
  if (left < 0) return <AfterExam />;
  return <TodayMain state={state} bank={bank} today={today} left={left} />;
}

function greeting(hour: number): string {
  if (hour < 4) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 13) return '中午好';
  if (hour < 18) return '下午好';
  if (hour < 23) return '晚上好';
  return '夜深了';
}

/** Re-render once a minute so the greeting and the bedtime countdown stay current. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

interface Ctx {
  state: AppState;
  bank: BankIndex;
  today: string;
}

function TodayMain({ state, bank, today, left }: Ctx & { left: number }) {
  const plan: DayPlan | undefined = state.plans[today];
  const blocks = plan?.blocks ?? NO_BLOCKS;
  const [durationOpen, setDurationOpen] = useState(false);
  const confirm = useConfirm();
  const now = useMinute();
  const hour = now.getHours();

  // The order 跟学 walks through (速测 → 错题 → 模考 + 订正 → 各科交替 → 文型 → 一页纸 → 词汇).
  const ordered = useMemo(() => flowOrder(blocks), [blocks]);
  const views = useMemo(() => ordered.map((b) => blockView(state, b)), [ordered, state]);
  // The session left mid-way leads the page when it belongs to today's plan or was started today;
  // an older one is offered in a slim notice instead of hiding today's plan.
  const open = resumableSession(state);
  const openBlockIdx = open?.blockId ? ordered.findIndex((b) => b.id === open.blockId) : -1;
  const fresh = !!open && (openBlockIdx >= 0 || studyDate(new Date(open.startedAt)) === today);
  const resume = fresh ? open : undefined;
  const stale = fresh ? undefined : open;
  const activeIdx = views.indexOf('active');
  const nextIdx = openBlockIdx >= 0 && fresh ? openBlockIdx : activeIdx >= 0 ? activeIdx : views.indexOf('todo');
  const heroIdx = resume && openBlockIdx < 0 ? -1 : nextIdx;
  const heroBlock = heroIdx >= 0 ? ordered[heroIdx] : undefined;
  const doneCount = views.filter((v) => v === 'done').length;
  const countable = views.filter((v) => v !== 'skipped').length;
  const allResolved = blocks.length > 0 && nextIdx < 0 && !resume && !views.includes('locked');
  const skippedMock = ordered.find((b, i) => b.kind === 'mock' && views[i] === 'skipped');
  const skippedIds = ordered.filter((_, i) => views[i] === 'skipped').map((b) => b.id);
  // Everything skipped and nothing done is not a finished day.
  const allSkipped = allResolved && doneCount === 0;
  const waiting = blocks.length > 0 && !resume && nextIdx < 0 && !allResolved;

  const phase = phaseFor(left);
  const cal = useMemo(() => calendar(state, bank, state.profile.startDate <= today ? state.profile.startDate : today), [state, bank, today]);
  const phaseDays = cal.filter((d) => d.phase === phase);
  const phaseIdx = phaseDays.findIndex((d) => d.date === today);

  // Bedtime (from D-10): within 90 minutes of the target a banner says how much still fits,
  // and the tasks that do not fit fold away under 明天继续.
  const toBed = minutesToBed(left, now);
  const bedtime = bedtimeFor(left);
  const lateWindow = toBed !== null && toBed <= BEDTIME_WINDOW;
  const pastBed = toBed !== null && toBed <= 0;
  const night = hour < 4 || pastBed;

  const entries: (Entry & { i: number })[] = ordered.map((b, i) => ({ block: b, view: views[i], i }));
  // "第 4 项" counts the tasks that are not skipped, as 跟学 does.
  const counted = ordered.filter((_, i) => views[i] !== 'skipped');
  const stepNo = heroBlock ? counted.indexOf(heroBlock) + 1 : 0;
  const pending = entries.filter((e) => e.i !== heroIdx && (e.view === 'todo' || e.view === 'active' || e.view === 'locked'));
  const finished = entries.filter((e) => e.view === 'done' || e.view === 'skipped');

  const heroSession = resume ?? (heroBlock && views[heroIdx] === 'active' ? openSessionFor(state, heroBlock.id) : undefined);
  const heroRemain = heroBlock ? heroBlock.minutes * (heroSession ? 1 - sessionAnswered(heroSession) / Math.max(1, heroSession.itemIds.length) : 1) : 0;
  let fits = 0;
  let upcoming = pending;
  let later: Entry[] = [];
  if (lateWindow && toBed !== null) {
    let budget = toBed;
    if (heroBlock || resume) {
      budget -= heroRemain;
      if (budget >= 0) fits = 1;
    }
    upcoming = [];
    for (const e of pending) {
      if (budget >= 0 && e.view !== 'locked' && budget - e.block.minutes >= 0 && later.length === 0) {
        budget -= e.block.minutes;
        fits += 1;
        upcoming.push(e);
      } else later.push(e);
    }
  }

  let headline: string;
  const resumeKind = resume ? (heroBlock ? blockKindLabel(heroBlock) : resume.kind === 'review' ? '错题重做' : resume.kind === 'mock' ? '模考' : resume.title) : '';
  if (!blocks.length) headline = '今天是休息日';
  else if (allSkipped) headline = night ? '今天先到这里，去睡吧' : '今天先休息一下';
  else if (allResolved) headline = night ? '今天的任务都完成了，去睡吧' : '今天的任务都完成了';
  else if (waiting) headline = '模考交卷后再订正';
  else if (pastBed) headline = '到点了，今天先到这里';
  else if (lateWindow) headline = `${hour < 4 || hour >= 23 ? '夜深了' : '快收工了'}，${fits > 0 ? '做完这一项就休息吧' : '收个尾就休息吧'}`;
  else if (hour < 4) headline = '夜深了，做完这一项就休息吧';
  else if (resume) headline = `继续${resumeKind} · 还剩 ${Math.max(0, resume.itemIds.length - sessionAnswered(resume))} 题`;
  else if (doneCount === 0 && stepNo <= 1) headline = '从第 1 项开始吧';
  else headline = `第 ${stepNo} 项了，保持节奏`;

  const startMock = async (b: PlanBlock) => {
    const ok = await confirm.ask(`开始${b.mock ? MOCK_LABEL[b.mock.kind] : ''}模考？`, {
      body: (
        <>
          限时 {b.minutes} 分钟，中途不显示对错，交卷后统一判分、估分。
          <br />
          找个安静的地方，准备好草稿纸再开始。
        </>
      ),
      ok: '开始计时',
    });
    if (ok) runBlock(state, bank, b);
  };
  const start = (b: PlanBlock) => {
    if (b.kind === 'mock' && !openSessionFor(state, b.id)) void startMock(b);
    else runBlock(state, bank, b);
  };

  const regen = async () => {
    const ok = await confirm.ask('换一套今天的安排？', {
      body: '已完成和进行中的任务会保留，其余按你最新的正确率和薄弱点重新安排。',
      ok: '换一套',
    });
    if (!ok) return;
    update((d, b, t) => regenerateDay(d, b, t));
    toast('今天的安排已更新', 'success');
  };

  const plannedMinutes = counted.reduce((s, b) => s + b.minutes, 0);

  // 跟学模式 is the main way through the day, except in the last stretch before bedtime (then the
  // hero offers just the one task that still fits) and while a manual task waits for 已完成.
  const remaining = countable - doneCount;
  const canFlow = blocks.length > 0 && !allResolved && !waiting && !lateWindow && remaining > 0;
  const warmN = useMemo(() => (canFlow ? warmupTopics(state, bank, blocks).length : 0), [canFlow, state, bank, blocks]);
  const flow = canFlow
    ? {
        label: doneCount > 0 ? '跟学剩下的' : '开始跟学',
        desc:
          warmN > 0
            ? `先复习 ${warmN} 个考点，再${doneCount > 0 ? '做剩下的' : '按顺序做完'} ${remaining} 项`
            : `按顺序做完${doneCount > 0 ? '剩下的' : '这'} ${remaining} 项，一项接一项`,
        remaining,
        onStart: () => startFlow(today),
      }
    : undefined;
  const supply = useMemo(() => supplyNote(freshRemaining(state, bank)), [state, bank]);

  const showBanner = lateWindow && bedtime !== null && (!!heroBlock || !!resume || later.length > 0);
  const heroShown = !!resume || !!heroBlock;
  const bedLine = showBanner && heroShown && bedtime !== null && toBed !== null ? { clock: clockText(bedtime), toGo: toBed } : undefined;
  // A finished or fully skipped day: the hero carries the summary, so the progress card steps aside.
  const resolved = allResolved;

  let listSub: string;
  if (countable === 0) listSub = `${blocks.length} 项都已跳过`;
  else if (allResolved) listSub = '展开看每一项的结果';
  else if (lateWindow && !pastBed && later.length) listSub = fits > 0 ? `今晚还够做 ${fits} 项，其余明天继续` : '今晚先收尾，其余明天继续';
  else if (pastBed && (upcoming.length || later.length)) listSub = '已过收工时间，剩下的明天继续';
  else listSub = `今天共 ${countable} 项 · 约 ${fmtMinutes(plannedMinutes)}`;

  return (
    <div className="page td">
      <header className="td-head">
        <div className="td-eyebrow">
          <Icon name="calendar" size={14} />
          <span>
            {fmtDateShort(today)} {weekdayZh(today)}
          </span>
          {!headline.startsWith(greeting(hour)) && (
            <>
              <span className="td-eyebrow-sep">·</span>
              <span>{greeting(hour)}</span>
            </>
          )}
          {hour < 4 && <span className="td-late">凌晨 4 点前仍算作今天</span>}
        </div>
        <h1 className="td-title">{headline}</h1>
        <div className="td-phase">
          <Tooltip label={PHASE_INFO[phase].desc} side="bottom">
            <a className="td-phase-pill" href={href('/plan')}>
              <Dot tone="primary" />
              <span className="td-phase-name">{PHASE_INFO[phase].name}</span>
              {phaseIdx >= 0 && (
                <span className="td-phase-day num">
                  第 {phaseIdx + 1} / {phaseDays.length} 天
                </span>
              )}
              <Icon name="right" size={13} className="td-phase-go" />
            </a>
          </Tooltip>
        </div>
      </header>

      {/* Without a hero task the bedtime line has no card to sit in: a slim notice instead. */}
      {showBanner && !heroShown && bedtime !== null && toBed !== null && (
        <div className={cx('td-bed', pastBed && 'is-late')} role="status">
          <Icon name="moon" size={16} />
          {pastBed ? (
            <span>
              已过 <b className="num">{clockText(bedtime)}</b> 收工时间 · 今天先到这里，剩下的明天继续
            </span>
          ) : (
            <span>
              <b className="num">{clockText(bedtime)}</b> 收工 · 还有 <b className="num">{toBed}</b> 分钟 · 剩下的明天继续
            </span>
          )}
        </div>
      )}

      <div className={cx('td-layout', resolved && 'is-resolved')}>
        <div className="td-main">
          {resume || heroBlock ? (
            <NextHero
              state={state}
              bank={bank}
              today={today}
              session={resume}
              block={heroBlock}
              index={stepNo - 1}
              total={countable}
              flow={flow}
              bed={bedLine}
              onStart={start}
            />
          ) : allSkipped ? (
            <SkippedHero state={state} bank={bank} today={today} skipped={skippedIds} night={night} />
          ) : allResolved ? (
            <DoneHero state={state} bank={bank} today={today} skipped={skippedIds} done={doneCount} night={night} />
          ) : !blocks.length ? (
            <RestHero state={state} bank={bank} today={today} onAdjust={() => setDurationOpen(true)} night={night} />
          ) : (
            <WaitingHero skippedMock={skippedMock} />
          )}

          {stale && <StaleNotice session={stale} />}

          {blocks.length > 0 && (
            <PlanList
              state={state}
              bank={bank}
              today={today}
              upcoming={upcoming}
              later={later}
              finished={finished}
              title={upcoming.length || later.length ? '接下来' : '今天的任务'}
              sub={listSub}
              bare={allResolved}
              onStart={start}
              actions={
                // A finished or fully skipped day needs no planning controls here.
                !allResolved && (
                  <>
                    <Button size="sm" variant="ghost" icon="clock" onClick={() => setDurationOpen(true)}>
                      调整时长
                    </Button>
                    <Button size="sm" variant="ghost" icon="refresh" onClick={() => void regen()}>
                      换一套安排
                    </Button>
                  </>
                )
              }
              footer={
                supply && !allResolved ? (
                  <p className="td-supply">
                    <Icon name="info" size={14} />
                    <span>{supply}</span>
                  </p>
                ) : undefined
              }
            />
          )}

          <DueCard state={state} today={today} bank={bank} />
        </div>

        <aside className="td-aside">
          {!resolved && (
            <ProgressCard
              state={state}
              today={today}
              planned={plannedMinutes}
              done={doneCount}
              total={countable || blocks.length}
              started={!!heroSession && sessionAnswered(heroSession) > 0}
              onAdjust={() => setDurationOpen(true)}
            />
          )}
          <SleepCard state={state} bank={bank} today={today} left={left} now={now} inHero={!!bedLine} />
          <div className="td-aside-rest">
            <ScoreCard state={state} bank={bank} />
            <MockCard state={state} bank={bank} today={today} />
          </div>
        </aside>
      </div>

      <DurationDialog open={durationOpen} date={today} onClose={() => setDurationOpen(false)} />
      {confirm.node}
    </div>
  );
}

const MAIN_POOLS = ['math', 'physics', 'chemistry', 'ja-reading', 'ja-listening'] as const;
const LOW_SUPPLY = 10;

/** "物理新题还剩 6 道，之后以错题和限时回炉为主" when a main pool is nearly out of never-seen items. */
function supplyNote(fresh: Record<string, number>): string | null {
  const parts = MAIN_POOLS.filter((p) => (fresh[p] ?? 0) < LOW_SUPPLY).map((p) => {
    const name = POOLS.find((x) => x.id === p)?.name ?? p;
    const n = fresh[p] ?? 0;
    return n > 0 ? `${name}新题还剩 ${n} 道` : `${name}新题已经做完`;
  });
  return parts.length ? `${parts.join('，')}，之后以错题和限时回炉为主` : null;
}
