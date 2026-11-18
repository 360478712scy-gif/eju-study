// 今天 — a study checklist on glass: the day's timeline, the tasks in order, and the few numbers that matter.
import { useMemo, useState } from 'react';
import type { BankIndex } from '@shared/bank.ts';
import { budgetFor, hasActivity, weekDates } from '@shared/calendar.ts';
import { daysBetween, dateRange, monday, addDays } from '@shared/dates.ts';
import { buildDayPlan } from '@shared/planner.ts';
import type { Attempt, PlanBlock } from '@shared/types.ts';
import { t } from '../../copy/index.ts';
import { Aside, Page } from '../../shell/Shell.tsx';
import { Bar, Button, Card, Chip, Empty, Icon, IconButton, List, Row, Sheet, toast, cx } from '../../ui/ui.tsx';
import { blockReason, blockSchoolName, blockTitle, findItem, percent, phaseNames, shortDate, topicName, weekday } from '../../lib/model.ts';
import { go, itemLink, link } from '../../lib/navigation.ts';
import { useStudy } from '../../lib/study.tsx';
import './today.css';

const clock = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const subjectTone = (block: PlanBlock) => (block.kind === 'school' ? 'school' : block.subject === 'mixed' ? 'neutral' : block.subject);

function coachLine(attempts: Attempt[], blocks: PlanBlock[], bank: BankIndex, date: string, streak: number) {
  const lastDay = attempts.reduce((last, attempt) => (attempt.date < date && attempt.date > last ? attempt.date : last), '');
  if (lastDay) {
    const mistakes = new Map<string, number>();
    for (const attempt of attempts) {
      if (attempt.date === lastDay && !attempt.correct) mistakes.set(attempt.topic, (mistakes.get(attempt.topic) ?? 0) + 1);
    }
    const largest = [...mistakes].sort((a, b) => b[1] - a[1])[0];
    if (largest) {
      const [topic, count] = largest;
      const dayLabel = lastDay === addDays(date, -1) ? t.time.daysAgo(1) : shortDate(lastDay);
      return { topic, text: t.today.coachRecentMistakes(dayLabel, topicName(bank, topic), count) };
    }
  }
  const focus = blocks.find((block) => block.kind === 'learn');
  const topic = focus?.why.topic ?? focus?.topic;
  if (focus?.why.code === 'weak_focus' && topic && focus.why.mastery != null) {
    return { topic, text: t.today.coachWeakFocus(topicName(bank, topic), percent(focus.why.mastery)) };
  }
  const schoolBlock = blocks.find((block) => block.kind === 'school');
  const school = schoolBlock && blockSchoolName(schoolBlock);
  if (school) return { topic: schoolBlock.topic, text: t.today.coachSchoolPractice(school) };
  return { topic, text: streak ? t.today.coachStudyStreak(streak) : t.today.coachReady };
}

/** The day as one bar: each task a segment sized by its minutes. */
function DayTimeline({ blocks, current }: { blocks: PlanBlock[]; current?: string }) {
  const total = blocks.reduce((n, b) => n + b.minutes, 0) || 1;
  const ticks = [0, 30, 60, 90, 120].filter((m) => m <= total);
  return (
    <div className="day-line" aria-hidden>
      <div className="day-line-track">
        {blocks.map((b) => (
          <span
            key={b.id}
            className={cx('day-seg', `is-${b.status}`, b.id === current && 'is-current', b.kind === 'break' && 'is-break')}
            data-tone={subjectTone(b)}
            style={{ flexGrow: b.minutes }}
          />
        ))}
      </div>
      <div className="day-line-ticks">
        {ticks.map((m) => (
          <span key={m} className="num" style={{ left: `${(m / total) * 100}%` }}>
            {clock(m)}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusMark({ status, current }: { status: PlanBlock['status']; current: boolean }) {
  return (
    <span className={cx('task-mark', `is-${status}`, current && 'is-current')} aria-hidden>
      {status === 'done' && <Icon name="check" size={13} stroke={2.4} />}
      {status === 'skipped' && <Icon name="minus" size={13} stroke={2.2} />}
    </span>
  );
}

function TaskList({ blocks, bank, current, onStart, actionLabel, interactive = true }: {
  blocks: PlanBlock[];
  bank: BankIndex;
  current?: string;
  onStart?: () => void;
  actionLabel?: string;
  interactive?: boolean;
}) {
  let at = 0;
  return (
    <ol className="tasks">
      {blocks.map((b) => {
        const from = at;
        at += b.minutes;
        const isCurrent = b.id === current;
        const school = b.kind === 'school' ? blockSchoolName(b) : null;
        return (
          <li key={b.id} className={cx('task', `is-${b.status}`, isCurrent && 'is-current', b.kind === 'break' && 'is-break')}>
            <StatusMark status={b.status} current={isCurrent} />
            <span className="task-time num">
              {clock(from)}
              <span>–{clock(at)}</span>
            </span>
            <span className="task-main">
              <span className="task-title">
                {blockTitle(b, bank)}
              </span>
              <span className="task-why">{blockReason(b, bank)}</span>
            </span>
            <span className="task-tags">
              <Chip sm tone={subjectTone(b)}>{school ?? t.today.kindLabel(b.kind)}</Chip>
            </span>
            <span className="task-min num">{t.time.minutes(b.minutes)}</span>
            {interactive && isCurrent && onStart && (
              <Button size="sm" variant="primary" iconRight="arrow-right" onClick={onStart}>
                {actionLabel}
              </Button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function Today() {
  const { state, bank, date, today, weekly, predictions, activeBlock, active, paused, seconds, openCoach, action,
    startToday, completeManual, togglePause, startItems } = useStudy();
  const [showWork, setShowWork] = useState(false);
  const [dismissed, setDismissed] = useState('');
  const { plan, next } = today;
  const rest = !plan.blocks.length && !active;
  const done = next.code === 'day_complete';
  const nextBlock = activeBlock ?? plan.blocks.find((b) => b.status === 'active') ?? plan.blocks.find((b) => b.status === 'todo');
  const countdown = daysBetween(date, state.profile.examDate);
  const totalDays = Math.max(1, daysBetween(state.profile.startDate, state.profile.examDate));
  const journey = Math.max(0, Math.min(100, Math.round((daysBetween(state.profile.startDate, date) / totalDays) * 100)));
  const left = Math.max(0, plan.blocks.filter((b) => b.status === 'active' || b.status === 'todo').reduce((sum, b) => sum + b.minutes, 0)
    - (activeBlock ? Math.min(activeBlock.minutes, Math.floor(seconds / 60)) : 0));
  let streak = 0;
  for (let d = hasActivity(state, date) ? date : addDays(date, -1); hasActivity(state, d); d = addDays(d, -1)) streak++;
  const started = plan.blocks.some((b) => b.status !== 'todo');
  const mainLabel = activeBlock && !active ? (paused ? t.nav.dockResume : activeBlock.kind === 'break' ? t.today.finishBreak : t.today.finishManual)
    : active ? t.today.resumeTodayBtn
    : started && nextBlock ? t.today.startNextTaskBtn(blockTitle(nextBlock, bank))
    : plan.budgetMinutes === 120 ? t.today.startTodayBtn : t.today.startFor(t.time.durationMin(plan.budgetMinutes));
  const mainAction = () => (activeBlock && !active ? (paused ? togglePause() : void completeManual()) : void startToday());
  const attempts = state.attempts.filter((a) => a.date === date);
  const misses = dateRange([addDays(date, -7), state.profile.startDate].sort()[1], addDays(date, -1))
    .filter((d) => weekDates(state, d, monday(d)).includes(d) && !hasActivity(state, d));
  const tomorrow = 'nextDate' in next ? next.nextDate : null;
  const available = date >= state.profile.startDate && date < state.profile.examDate;
  const week = dateRange(monday(date), addDays(monday(date), 6));
  const scheduled = weekDates(state, date, monday(date));
  const math = predictions.find((p) => p.subject === 'math')!;
  const sciences = predictions.filter((p) => p.subject !== 'math');
  const scienceTotal = sciences.reduce((n, p) => n + p.estimate, 0);
  const scienceTarget = state.profile.targets.physics + state.profile.targets.chemistry;
  const advice = useMemo(() => coachLine(state.attempts, plan.blocks, bank, date, streak), [state.attempts, plan.blocks, bank, date, streak]);

  // On a rest day (or once today is done) preview the next study day.
  const previewDate = useMemo(() => {
    if (!rest && !done) return null;
    const after = addDays(date, 1);
    if (tomorrow) return tomorrow;
    const first = after < state.profile.startDate ? state.profile.startDate : after;
    return dateRange(first, state.profile.examDate).find((d) => budgetFor(state, d, date) > 0) ?? null;
  }, [rest, done, tomorrow, state, date]);
  const preview = useMemo(() => (previewDate ? buildDayPlan(state, bank, previewDate, date) : undefined), [previewDate, state, bank, date]);

  const forecastRows = [
    { key: 'math', label: t.common.math, tone: 'math' as const, value: math.estimate, max: math.scale, target: state.profile.targets.math, range: math.range, sparse: math.evidence === 'sparse' },
    { key: 'sci', label: t.common.science, tone: 'physics' as const, value: scienceTotal, max: 200, target: scienceTarget,
      range: [sciences.reduce((n, p) => n + p.range[0], 0), sciences.reduce((n, p) => n + p.range[1], 0)] as [number, number], sparse: sciences.some((p) => p.evidence === 'sparse') },
  ];

  return (
    <Page
      eyebrow={<><Icon name="today" size={14} />{shortDate(date)} {weekday(date)} · {t.time.weekNumber(Math.max(1, Math.floor(daysBetween(monday(state.profile.startDate), date) / 7) + 1))} · {phaseNames[plan.phase]}</>}
      title={t.today.title}
      desc={rest ? t.today.subtitleRest : done ? (plan.budgetMinutes === 120 ? t.today.subtitleCompleted : t.today.completed)
        : started ? t.today.subtitleInProgress(left) : plan.budgetMinutes === 120 ? t.today.subtitleReady : t.today.ready(t.time.durationMin(plan.budgetMinutes))}
      actions={<>
        {streak > 1 && <Chip icon="bolt">{t.today.streak(streak)}</Chip>}
      </>}
    >
      {misses.length > 0 && dismissed !== date && (
        <Card className="today-notice" title={t.today.missedNoticeTitle(misses.length)} sub={t.today.missedNoticeBody}
          actions={<IconButton icon="close" label={t.today.missedAckBtn} onClick={() => setDismissed(date)} />}>
          <Button size="sm" icon="plan" onClick={() => go(link('plan'))}>{t.today.missedViewPlanBtn}</Button>
        </Card>
      )}

      <div className="today-grid">
        <div className="today-col">
          <section className="card today-plan enter">
            {rest || (done && !plan.blocks.length) ? (
              <>
                <div className="today-plan-head">
                  <div>
                    <h2 className="today-plan-title">{t.today.restCardTitle}</h2>
                    <p className="today-plan-sub">{available ? t.today.restCardBody : tomorrow ? t.nav.upcoming(shortDate(tomorrow)) : t.nav.examPassed}</p>
                  </div>
                </div>
                <div className="hstack today-actions">
                  <Button icon="cards" variant="primary" onClick={() => go(link('review') + '?deck=cards')}>{t.today.restLightReviewBtn}</Button>
                  {available && tomorrow && (
                    <Button variant="ghost" icon="calendar" onClick={async () => {
                      if (await action({ type: 'move', from: tomorrow, to: date })) toast(t.toast.dayMoved, 'ok');
                    }}>{t.today.restMoveStudyHereBtn}</Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="today-plan-head">
                  <div>
                    <h2 className="today-plan-title">{done ? t.today.doneTitle : t.today.planCardTitle}</h2>
                    <p className="today-plan-sub num">{t.today.planCardMeta(plan.blocks.length, plan.budgetMinutes)}</p>
                  </div>
                  {!started && !active && (
                    <Button variant="ghost" size="sm" icon="coffee" onClick={async () => {
                      if (await action({ type: 'day', date, value: 'off' })) toast(t.toast.markedRestDay, 'ok');
                    }}>{t.today.switchTodayToRestBtn}</Button>
                  )}
                </div>
                <DayTimeline blocks={plan.blocks} current={nextBlock?.id} />
                <TaskList blocks={plan.blocks} bank={bank} current={done ? undefined : nextBlock?.id}
                  onStart={mainAction} actionLabel={started ? t.today.continueThisBtn : t.today.startThisBtn} />
                <div className="hstack today-actions">
                  {done ? (
                    <Button variant="primary" size="lg" icon="history" onClick={() => setShowWork(true)}>{t.today.reviewTodayWorkBtn}</Button>
                  ) : (
                    <Button variant="primary" size="lg" iconRight="arrow-right" kbd={activeBlock && !active ? undefined : 'Space'} onClick={mainAction}>{mainLabel}</Button>
                  )}
                </div>
              </>
            )}
          </section>

          {(rest || done) && preview && previewDate && (
            <section className="card today-preview enter-2">
              <div className="today-plan-head">
                <h3 className="sec-title">{t.today.restNextTitle(`${shortDate(previewDate)} ${weekday(previewDate)}`)}</h3>
                <span className="t-3 num">{t.today.planCardMeta(preview.blocks.length, preview.budgetMinutes)}</span>
              </div>
              {preview.blocks.length
                ? <TaskList blocks={preview.blocks} bank={bank} interactive={false} />
                : <Empty icon="coffee" title={t.today.queuePreviewNoTasks} />}
            </section>
          )}

          <Card className="coach-line enter-3" pad={false}>
            <span className="coach-line-icon"><Icon name="sparkle" size={17} /></span>
            <p className="coach-line-text"><b>{t.today.coachNoteLabel}</b>　{advice.text}</p>
            <Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => openCoach({ topic: advice.topic ?? nextBlock?.topic, page: t.nav.today })}>{t.nav.fabCoach}</Button>
          </Card>
        </div>

        <aside className="today-side">
          <section className="card today-count enter-2">
            <div className="t-eyebrow">{t.today.countdownTitle}</div>
            <div className="today-count-value">
              <span className="num">{Math.max(0, countdown)}</span>
              <span className="today-count-unit">{t.nav.countdownUnit}</span>
            </div>
            <div className="t-3 today-count-date">{t.nav.examDateHint}</div>
            <Bar value={journey} max={100} thin />
            <div className="t-3 today-count-phase">{t.today.phaseProgress(phaseNames[plan.phase], journey)}</div>
          </section>

          <section className="card today-forecast enter-3">
            <div className="hstack" style={{ marginBottom: 6 }}>
              <span className="t-eyebrow">{t.today.forecastTitle}</span>
              <span className="spacer" />
              {forecastRows.some((r) => r.sparse) && <Chip tone="warn" sm>{t.insights.sparseBadge}</Chip>}
            </div>
            {forecastRows.map((r) => (
              <div key={r.key} className="fc-row">
                <div className="fc-head">
                  <span className="fc-label">{r.label}</span>
                  <span className="fc-value num">{r.value}<span> / {r.max}</span></span>
                </div>
                <Bar value={r.value} max={r.max} mark={r.target} tone={r.tone} />
                <div className="fc-foot t-3 num">
                  <span>{t.insights.forecastTotalRange(r.range[0], r.range[1])}</span>
                  <span>{t.today.forecastTarget(r.target)}</span>
                </div>
              </div>
            ))}
          </section>

          <section className="card today-week enter-4">
            <div className="hstack">
              <span className="t-eyebrow">{t.today.week}</span>
              <span className="spacer" />
              <span className="num today-week-count">{weekly.activeDays}<span className="t-3"> / {weekly.plannedDays}</span></span>
            </div>
            <div className="week-cells">
              {week.map((d, i) => {
                const state_ = hasActivity(state, d) ? 'done' : d === date ? 'today' : scheduled.includes(d) ? 'plan' : 'rest';
                return (
                  <span key={d} className={`week-cell is-${state_}`} title={shortDate(d)}>
                    <span className="week-cell-day">{t.time.weekdayShort(i + 1)}</span>
                    <span className="week-cell-mark">{state_ === 'done' ? <Icon name="check" size={12} stroke={2.4} /> : null}</span>
                  </span>
                );
              })}
            </div>
            <div className="t-3 today-week-sub num">{t.time.durationMin(weekly.seconds / 60)}</div>
          </section>
        </aside>
      </div>

      <Sheet open={showWork} label={t.today.todayWorkHeading} onClose={() => setShowWork(false)}>
        <Aside title={t.today.todayWorkHeading} actions={<IconButton icon="close" label={t.common.closeBtn} onClick={() => setShowWork(false)} />}>
          {!attempts.length && <Empty title={t.empty.todayDoneTitle} />}
          <List>{attempts.map(({ id, itemId, sessionId, correct }) => {
            const item = findItem(bank, state, itemId);
            return <Row key={id} title={item?.source.label ?? itemId} trail={<Icon name={correct ? 'check' : 'close'} size={15} />}
              onClick={item ? () => {
                setShowWork(false);
                if (sessionId && state.sessions[sessionId]?.itemIds.includes(itemId)) go(itemLink(sessionId) + '?' + new URLSearchParams({ item: itemId }));
                else void startItems([itemId], 'review');
              } : undefined} />;
          })}</List>
        </Aside>
      </Sheet>
    </Page>
  );
}

