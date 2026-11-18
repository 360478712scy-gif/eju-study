import { useMemo, useState, type CSSProperties } from 'react';
import type { BankIndex } from '@shared/bank.ts';
import { budgetFor, hasActivity, weekDates } from '@shared/calendar.ts';
import { daysBetween, dateRange, monday, addDays } from '@shared/dates.ts';
import { buildDayPlan } from '@shared/planner.ts';
import type { Attempt, PlanBlock } from '@shared/types.ts';
import { t } from '../../copy/index.ts';
import { Aside, Page } from '../../shell/Shell.tsx';
import { Bar, Button, Card, Chip, Empty, Icon, IconButton, List, Orb, RoundPlay, Row, Sheet, Stat, SubjectGlyph, toast } from '../../ui/ui.tsx';
import { blockReason, blockSchoolName, blockStatus, blockTitle, findItem, percent, phaseNames, shortDate, topicName, weekday } from '../../lib/model.ts';
import { go, itemLink, link } from '../../lib/navigation.ts';
import { useStudy } from '../../lib/study.tsx';
import './today.css';

export function TodayQueue({ close }: { close?: () => void }) {
  const { today, state, bank, date, active, startToday } = useStudy();
  const next = today.plan.blocks.find(b => b.status === 'active') ?? today.plan.blocks.find(b => b.status === 'todo');
  const previewDate = useMemo(() => {
    if (next) return null;
    const tomorrow = addDays(date, 1);
    if (today.plan.blocks.length) return tomorrow;
    if ('nextDate' in today.next) return today.next.nextDate;
    // An unrelated active session can hide the next study date from todayView.
    const first = tomorrow < state.profile.startDate ? state.profile.startDate : tomorrow;
    return dateRange(first, state.profile.examDate).find(d => budgetFor(state, d, date) > 0);
  }, [next, today, state, date]);
  const preview = useMemo(() => previewDate ? buildDayPlan(state, bank, previewDate, date) : undefined, [previewDate, state, bank, date]);
  const plan = next ? today.plan : preview;
  const title = next ? t.today.queueTitle
    : previewDate ? t.today.queuePreviewTitle(shortDate(previewDate)) : t.today.queueNoUpcoming;
  return <Aside title={title} actions={close
    ? <IconButton icon="close" label={t.common.closeBtn} onClick={close} />
    : next && <RoundPlay label={t.today.queuePlayTooltip(blockTitle(next, bank))} primary onClick={() => void startToday()} size={40} />}>
    {next && <div className="queue-hero" data-tone={next.subject === 'mixed' ? 'primary' : next.subject}>
      <div className="queue-hero-art"><SubjectGlyph subject={next.subject} size="lg" /></div>
      <div className="queue-hero-title">{blockTitle(next, bank)}</div>
      <div className="queue-hero-sub">{blockReason(next, bank)}</div>
    </div>}
    {plan && (plan.blocks.length ? <>
      <div className="queue-meta t-3">{t.today.queueMeta(plan.blocks.length, plan.budgetMinutes)}</div>
      <List>
        {plan.blocks.map((block, i) => {
          const current = block.id === next?.id;
          const done = !!next && block.status === 'done';
          return <Row key={block.id} index={i + 1} title={blockTitle(block, bank)}
            meta={[block.subject !== 'mixed' && t.common.subjectName(block.subject), next && blockStatus[block.status], t.time.minutes(block.minutes)]}
            current={current} done={done} trail={done ? <Icon name="check" size={15} />
              : current ? <Icon name={active ? 'bolt' : 'play'} size={15} /> : null}
            onClick={current ? () => void startToday() : undefined} />;
        })}
      </List>
    </> : <Empty icon="coffee" title={t.today.queuePreviewNoTasks} />)}
  </Aside>;
}

function coachLine(attempts: Attempt[], blocks: PlanBlock[], bank: BankIndex, date: string, streak: number) {
  const lastDay = attempts.reduce((last, attempt) => attempt.date < date && attempt.date > last ? attempt.date : last, '');
  if (lastDay) {
    const mistakes = new Map<string, number>();
    for (const attempt of attempts) {
      if (attempt.date === lastDay && !attempt.correct) {
        mistakes.set(attempt.topic, (mistakes.get(attempt.topic) ?? 0) + 1);
      }
    }
    const largest = [...mistakes].sort((a, b) => b[1] - a[1])[0];
    if (largest) {
      const [topic, count] = largest;
      const dayLabel = lastDay === addDays(date, -1) ? t.time.daysAgo(1) : shortDate(lastDay);
      return { topic, text: t.today.coachRecentMistakes(dayLabel, topicName(bank, topic), count) };
    }
  }
  const focus = blocks.find(block => block.kind === 'learn');
  const topic = focus?.why.topic ?? focus?.topic;
  if (focus?.why.code === 'weak_focus' && topic && focus.why.mastery != null) {
    return { topic, text: t.today.coachWeakFocus(topicName(bank, topic), percent(focus.why.mastery)) };
  }
  const schoolBlock = blocks.find(block => block.kind === 'school');
  const school = schoolBlock && blockSchoolName(schoolBlock);
  if (school) return { topic: schoolBlock.topic, text: t.today.coachSchoolPractice(school) };
  return { topic, text: streak ? t.today.coachStudyStreak(streak) : t.today.coachReady };
}

function ForecastRange({ low, high, sparse }: { low: number; high: number; sparse: boolean }) {
  return <span className="hstack forecast-summary">
    <span>{t.insights.forecastTotalRange(low, high)}</span>
    {sparse && <Chip tone="warn" sm>{t.insights.sparseBadge}</Chip>}
  </span>;
}

export function Today() {
  const { state, bank, date, today, weekly, predictions, activeBlock, active, paused, seconds, openCoach, action,
    startToday, completeManual, togglePause, startItems } = useStudy();
  const [showQueue, setShowQueue] = useState(false);
  const [showWork, setShowWork] = useState(false);
  const [dismissed, setDismissed] = useState('');
  const { plan, next } = today;
  const rest = !plan.blocks.length && !active;
  const done = next.code === 'day_complete';
  const nextBlock = activeBlock ?? plan.blocks.find(b => b.status === 'todo');
  const countdown = daysBetween(date, state.profile.examDate);
  const day = state.days[date];
  const lit = Math.min(120, Math.floor((day?.seconds ?? 0) / 60));
  const left = Math.max(0, plan.blocks.filter(b => b.status === 'active' || b.status === 'todo').reduce((sum, b) => sum + b.minutes, 0)
    - (activeBlock ? Math.min(activeBlock.minutes, Math.floor(seconds / 60)) : 0));
  const remaining = activeBlock ? Math.max(0, activeBlock.minutes * 60 - seconds) : 0;
  let streak = 0;
  for (let d = hasActivity(state, date) ? date : addDays(date, -1); hasActivity(state, d); d = addDays(d, -1)) streak++;
  const started = plan.blocks.some(b => b.status !== 'todo');
  const mainLabel = activeBlock && !active ? (paused ? t.nav.dockResume : activeBlock.kind === 'break' ? t.today.finishBreak : t.today.finishManual)
    : active ? t.today.resumeTodayBtn
    : started && nextBlock ? t.today.startNextTaskBtn(blockTitle(nextBlock, bank))
    : plan.budgetMinutes === 120 ? t.today.startTodayBtn : t.today.startFor(t.time.durationMin(plan.budgetMinutes));
  const attempts = state.attempts.filter(a => a.date === date);
  const misses = dateRange([addDays(date, -7), state.profile.startDate].sort()[1], addDays(date, -1))
    .filter(d => weekDates(state, d, monday(d)).includes(d) && !hasActivity(state, d));
  const tomorrow = 'nextDate' in next ? next.nextDate : null;
  const available = date >= state.profile.startDate && date < state.profile.examDate;
  const week = dateRange(monday(date), addDays(monday(date), 6));
  const scheduled = weekDates(state, date, monday(date));
  const math = predictions.find(p => p.subject === 'math')!;
  const sciences = predictions.filter(p => p.subject !== 'math');
  const scienceTotal = sciences.reduce((n, p) => n + p.estimate, 0);
  const scienceTarget = state.profile.targets.physics + state.profile.targets.chemistry;
  const advice = useMemo(() => coachLine(state.attempts, plan.blocks, bank, date, streak), [state.attempts, plan.blocks, bank, date, streak]);
  const scriptStart = Math.max(0, Math.min(nextBlock ? plan.blocks.indexOf(nextBlock) - 1 : 0, plan.blocks.length - 4));
  const displayBlocks = plan.blocks.slice(scriptStart, scriptStart + 4);
  let scriptMinutes = plan.blocks.slice(0, scriptStart).reduce((sum, b) => sum + b.minutes, 0);

  return <Page eyebrow={<><Icon name="today" size={14} />{shortDate(date)} {weekday(date)} · {t.time.weekNumber(Math.max(1, Math.floor(daysBetween(monday(state.profile.startDate), date) / 7) + 1))} · {phaseNames[plan.phase]}</>}
    title={t.today.title}
    desc={rest ? t.today.subtitleRest : done ? (plan.budgetMinutes === 120 ? t.today.subtitleCompleted : t.today.completed)
      : started ? t.today.subtitleInProgress(left) : plan.budgetMinutes === 120 ? t.today.subtitleReady : t.today.ready(t.time.durationMin(plan.budgetMinutes))}
    actions={<>
      {streak > 1 && <Chip icon="bolt">{t.today.streak(streak)}</Chip>}
      <Chip icon="calendar">{t.time.days(weekly.activeDays)} {t.common.outOf(weekly.plannedDays)}</Chip>
      <span className="today-queue-trigger"><IconButton icon="list" label={t.today.openQueueDrawerBtn} onClick={() => setShowQueue(true)} /></span>
    </>}>
    {misses.length > 0 && dismissed !== date && <Card title={t.today.missedNoticeTitle(misses.length)} sub={t.today.missedNoticeBody}
      actions={<IconButton icon="close" label={t.today.missedAckBtn} onClick={() => setDismissed(date)} />}>
      <Button size="sm" icon="plan" onClick={() => go(link('plan'))}>{t.today.missedViewPlanBtn}</Button>
    </Card>}
    <section className="today-hero enter">
      <div className="today-orb" title={t.today.orbTicksTooltip(Math.floor((day?.seconds ?? 0) / 60), plan.budgetMinutes)}>
        <Orb size={196} ticks={120} lit={lit} now={activeBlock && lit < 120 ? lit : undefined}
          value={activeBlock ? t.time.timerClock(remaining) : Math.max(0, countdown)}
          unit={activeBlock ? (paused ? t.session.paused : t.today.orbRemainingLabel) : done ? t.today.orbAllDoneLabel : rest ? t.today.orbRestDayLabel : t.nav.countdownUnit} />
      </div>
      <div className="today-script">
        {rest ? <>
          <h2>{t.today.restCardTitle}</h2>
          <p className="page-desc">{available ? t.today.restCardBody : tomorrow ? t.nav.upcoming(shortDate(tomorrow)) : t.nav.examPassed}</p>
          <div className="hstack today-actions">
            <Button icon="cards" variant="primary" onClick={() => go(link('review') + '?deck=cards')}>{t.today.restLightReviewBtn}</Button>
            {available && tomorrow && <Button variant="ghost" icon="calendar" onClick={async () => {
              if (await action({ type: 'move', from: tomorrow, to: date })) toast(t.toast.dayMoved, 'ok');
            }}>{t.today.restMoveStudyHereBtn}</Button>}
          </div>
        </> : <>
          <div className="t-caps today-script-heading">{t.today.scriptDuration(t.time.durationMin(plan.budgetMinutes))}</div>
          <ol className="script">
            {displayBlocks.map((block, i) => {
              const start = scriptMinutes;
              scriptMinutes += block.minutes;
              return <li key={block.id} className={`script-line${block.id === nextBlock?.id ? ' is-now' : ''}`} style={{ '--i': i } as CSSProperties}>
                <span className="script-time num">{Math.floor(start / 60)}:{String(start % 60).padStart(2, '0')}</span>
                <span className="script-text">{blockTitle(block, bank)}<span className="script-kind">{blockReason(block, bank)} · {t.time.minutes(block.minutes)}</span></span>
              </li>;
            })}
          </ol>
          <div className="hstack today-actions">
            {done ? <Button variant="primary" size="lg" icon="history" onClick={() => setShowWork(true)}>{t.today.reviewTodayWorkBtn}</Button>
              : <Button variant="primary" size="lg" icon={activeBlock && !active && !paused ? 'check' : 'play'}
                kbd={activeBlock && !active ? undefined : 'Space'} onClick={() => activeBlock && !active ? paused ? togglePause() : void completeManual() : void startToday()}>{mainLabel}</Button>}
            {!started && !active && <Button variant="ghost" icon="calendar" onClick={async () => {
              if (await action({ type: 'day', date, value: 'off' })) toast(t.toast.markedRestDay, 'ok');
            }}>{t.today.switchTodayToRestBtn}</Button>}
            {plan.blocks.length > 4 && <span className="today-queue-trigger"><Button variant="ghost" icon="list" onClick={() => setShowQueue(true)}>{t.today.showTasks}</Button></span>}
          </div>
        </>}
      </div>
    </section>
    <Card className="coach-line enter-2" pad={false}>
      <span className="coach-line-icon"><Icon name="sparkle" size={18} /></span>
      <p className="coach-line-text"><b>{t.today.coachNoteLabel}</b> · {advice.text}</p>
      <Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => openCoach({ topic: advice.topic ?? nextBlock?.topic, page: t.nav.today })}>{t.nav.dockCoach}</Button>
    </Card>
    <div className="grid grid-3 enter-3 today-stats">
      <Card><Stat label={t.common.math} value={math.estimate} unit={t.common.outOf(math.scale)}
        sub={<ForecastRange low={math.range[0]} high={math.range[1]} sparse={math.evidence === 'sparse'} />} icon="math" />
        <Bar value={math.estimate} max={math.scale} mark={state.profile.targets.math} tone="math" /></Card>
      <Card><Stat label={t.common.science} value={scienceTotal} unit={t.common.outOf(200)}
        sub={<ForecastRange low={sciences.reduce((n, p) => n + p.range[0], 0)} high={sciences.reduce((n, p) => n + p.range[1], 0)}
          sparse={sciences.some(p => p.evidence === 'sparse')} />} icon="layers" />
        <Bar value={scienceTotal} max={200} mark={scienceTarget} tone="physics" /></Card>
      <Card><Stat label={t.today.week} value={weekly.activeDays} unit={t.common.outOf(weekly.plannedDays)} sub={t.time.durationMin(weekly.seconds / 60)} icon="calendar" />
        <div className="week-dots">{week.map((d, i) => <span key={d} className={`week-dot is-${hasActivity(state, d) ? 'done' : d === date ? 'today' : scheduled.includes(d) ? 'plan' : 'rest'}`} title={shortDate(d)}>
          <span className="week-dot-pip" />{t.time.weekdayShort(i + 1)}</span>)}</div></Card>
    </div>
    <Sheet open={showQueue} label={t.today.queueTitle} onClose={() => setShowQueue(false)}>
      <TodayQueue close={() => setShowQueue(false)} />
    </Sheet>
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
  </Page>;
}
