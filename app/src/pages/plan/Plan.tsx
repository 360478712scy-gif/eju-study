import { useMemo, useState } from 'react';
import { addDays, dateRange, daysBetween, formatDate, isValidDate, monday, parseDate } from '@shared/dates.ts';
import { budgetFor, hasActivity } from '@shared/calendar.ts';
import { buildDayPlan } from '@shared/planner.ts';
import { planView } from '@shared/selectors.ts';
import { Page } from '../../shell/Shell.tsx';
import { Button, Card, Chip, Dot, Empty, Field, Icon, List, Modal, Row, Section, Segmented, toast } from '../../ui/ui.tsx';
import { DayPicker } from '../../ui/Learning.tsx';
import { t } from '../../copy/index.ts';
import { blockReason, blockStatus, blockTitle, shortDate, weekday } from '../../lib/model.ts';
import { useStudy } from '../../lib/study.tsx';
import './plan.css';

const phases = [
  { id: 'foundation', tone: 'math', summary: t.plan.phase1Summary },
  { id: 'reinforce', tone: 'physics', summary: t.plan.phase2Summary },
  { id: 'integrate', tone: 'chemistry', summary: t.plan.phase3Summary },
  { id: 'sprint', tone: 'school', summary: t.plan.phase4Summary },
] as const;

function monthOffset(date: string, offset: number) {
  const d = parseDate(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return formatDate(d);
}

export function Plan() {
  const { state, bank, date, action, startItems } = useStudy();
  const [cursor, setCursor] = useState(date);
  const [selected, select] = useState(date);
  const [view, setView] = useState<'week' | 'month'>('week');
  const [moving, setMoving] = useState(false);
  const [destination, setDestination] = useState('');
  const { profile } = state;
  const data = useMemo(() => planView(state, bank, cursor, date), [state, bank, cursor, date]);
  const details = useMemo(() => data.week.find(d => d.date === selected) ?? planView(state, bank, selected, date).week.find(d => d.date === selected)!, [data.week, selected, state, bank, date]);
  const catchUp = useMemo(() => details.missed ? buildDayPlan(state, bank, selected, profile.startDate).blocks.flatMap(b => b.itemIds) : [], [details.missed, state, bank, selected, profile.startDate]);
  const canChange = selected >= date && selected >= profile.startDate && selected < profile.examDate && !hasActivity(state, selected);
  const length = Math.max(1, daysBetween(profile.startDate, profile.examDate));
  const position = (d: string) => Math.max(0, Math.min(100, daysBetween(profile.startDate, d) / length * 100));
  const todayPosition = position(date);
  const months = data.roadmap.filter(d => parseDate(d.date).getDate() === 1);
  const ranges = phases.map((phase, i) => {
    const start = data.roadmap.find(d => d.phase === phase.id)?.date ?? profile.examDate;
    const end = i === 3 ? profile.examDate : addDays(data.milestones[i].date, 1);
    return { ...phase, from: position(start), to: position(end), active: start <= date && date <= end,
      title: t.plan.phaseNameByIndex((i + 1) as 1 | 2 | 3 | 4) };
  });
  const monthStart = monthOffset(cursor, 0);
  const monthEnd = addDays(monthOffset(cursor, 1), -1);
  const monthDays = dateRange(monday(monthStart), addDays(monday(monthEnd), 6));
  const travel = (offset: number) => setCursor(view === 'week' ? addDays(cursor, offset * 7) : monthOffset(cursor, offset));
  const setDay = async (value: 'study' | 'off') => {
    if (await action({ type: 'day', date: selected, value })) toast(value === 'study' ? t.toast.markedStudyDay : t.toast.markedRestDay, 'ok');
  };
  const move = async () => {
    if (!isValidDate(destination) || destination < date || destination < profile.startDate || destination >= profile.examDate ||
      destination === selected || hasActivity(state, destination) || state.calendar.restWeeks.includes(monday(destination))) {
      toast(t.plan.cannotMove, 'warn');
      return;
    }
    if (await action({ type: 'move', from: selected, to: destination })) {
      toast(t.toast.dayMoved, 'ok');
      setMoving(false);
      select(destination);
      setCursor(destination);
    }
  };

  return <Page title={t.plan.title} desc={t.plan.subtitle} actions={<Chip icon="calendar">{t.plan.schedule(profile.weekdays.length, profile.dailyMinutes)}</Chip>}>
    <Card className="road enter" pad={false}>
      <div className="road-months">{months.map(m => <span key={m.date} style={{ left: `${position(m.date)}%` }}>{t.plan.monthLabel(parseDate(m.date).getMonth() + 1)}</span>)}</div>
      <div className="road-track">
        {ranges.map(phase => <div key={phase.id} className={`road-phase${phase.active ? ' is-now' : ''}`} data-tone={phase.tone}
          style={{ left: `${phase.from}%`, width: `${Math.max(0, phase.to - phase.from)}%` }}>
          <span className="road-phase-fill" style={{ width: `${Math.max(0, Math.min(100, (todayPosition - phase.from) / Math.max(1, phase.to - phase.from) * 100))}%` }} />
        </div>)}
        {data.milestones.map(m => <span key={m.date} className="road-flag" title={shortDate(m.date)} style={{ left: `${position(m.date)}%` }} />)}
        <span className="road-today" style={{ left: `${todayPosition}%` }}><span className="road-today-label">{t.plan.todayPin}</span></span>
      </div>
      <div className="road-phases">{ranges.map(phase => <div key={phase.id} className={`road-phase-card${phase.active ? ' is-now' : ''}`} title={phase.summary}
        style={{ left: `${phase.from}%`, width: `${Math.max(0, phase.to - phase.from)}%` }}>
        <div className="hstack"><Dot tone={phase.tone} /><b>{phase.title}</b></div>
        <span>{phase.summary}</span>
      </div>)}</div>
      <div className="road-miles">{data.milestones.map((m, i) => <div className="road-mile" key={m.date}>
        <Icon name={i === 3 ? 'trophy' : 'flag'} size={15} /><div>
          <div className="road-mile-title">{i === 3 ? t.plan.examDayPin : shortDate(m.date)}</div>
          <div className="road-mile-sub num">{t.plan.milestoneScores(m.targets.math, m.targets.physics, m.targets.chemistry)}</div>
        </div>
      </div>)}</div>
    </Card>
    <Section title={t.plan.weekStripTitle}
      desc={view === 'week' ? shortDate(data.week[0].date) + ' – ' + shortDate(data.week[6].date) : t.plan.monthLabel(parseDate(cursor).getMonth() + 1)}
      actions={<>
        <Segmented value={view} onChange={setView} options={[{ value: 'week', label: t.plan.week }, { value: 'month', label: t.plan.month }]} />
        <Button size="sm" icon="chev-left" square aria-label={view === 'week' ? t.plan.prevWeekBtn : t.plan.previousMonth} onClick={() => travel(-1)} />
        <Button size="sm" icon="chev-right" square aria-label={view === 'week' ? t.plan.nextWeekBtn : t.plan.nextMonth} onClick={() => travel(1)} />
        {monday(cursor) !== monday(date) && <Button size="sm" onClick={() => { setCursor(date); select(date); }}>{t.plan.backToThisWeekBtn}</Button>}
      </>}>
      <div className={view === 'week' ? 'week' : 'week month-grid'}>
        {view === 'week' ? data.week.map(d => {
          const completed = !!d.blocks.length && d.blocks.every(b => b.status === 'done' || b.status === 'skipped');
          const status = d.date === date ? 'today' : d.budgetMinutes ? 'study' : d.date < date ? 'past' : 'rest';
          const tasks = d.blocks.filter(b => b.kind !== 'break').filter((b, i) => i < 4 || b.kind === 'school');
          return <Button variant="ghost" key={d.date} className={`wday is-${status}${selected === d.date ? ' is-selected' : ''}`} aria-pressed={selected === d.date} onClick={() => select(d.date)}>
            <span className="wday-head"><span>{weekday(d.date)}</span><span className="num">{d.date.slice(5).replace('-', '/')}</span></span>
            {d.blocks.length ? <span className="wday-tasks">{tasks.map(b => {
              const title = blockTitle(b, bank);
              return <span className={`wday-task${b.kind === 'school' ? ' is-school' : ''}`} key={b.id} title={title}>
                <Dot tone={b.subject === 'mixed' ? 'neutral' : b.subject} /><span className="wday-task-label">{title}</span>
              </span>;
            })}</span>
              : <span className="wday-rest">{d.missed ? t.plan.dayTagRescheduled : d.phase === 'off' ? t.plan.outside : <><Icon name="coffee" size={20} />{t.plan.dayTagRest}</>}</span>}
            {!!d.budgetMinutes && <span className="wday-foot num">{completed ? t.plan.dayTagCompleted : t.time.minutes(d.budgetMinutes)}</span>}
          </Button>;
        }) : monthDays.map(d => {
          const info = data.roadmap.find(day => day.date === d);
          return <Button variant={selected === d ? 'primary' : 'ghost'} key={d} className={`month-day${d < monthStart || d > monthEnd ? ' is-outside' : ''}`}
            aria-label={shortDate(d)} aria-pressed={selected === d} onClick={() => select(d)}>
            <span className="num">{parseDate(d).getDate()}</span>
            {d === date && <Dot tone="primary" />}{info?.missed ? <Dot tone="warn" /> : !!info?.minutes && <Dot tone="ok" />}
          </Button>;
        })}
      </div>
      <Card className="plan-detail" title={t.plan.dayDetailHeading(shortDate(selected), weekday(selected))}>
        {details.blocks.length ? <List>{details.blocks.map(b => <Row key={b.id} lead={<Dot tone={b.subject === 'mixed' ? 'neutral' : b.subject} />}
          title={blockTitle(b, bank)} meta={[blockReason(b, bank), blockStatus[b.status]]} trail={t.time.minutes(b.minutes)} />)}</List>
          : <Empty icon={details.missed ? 'history' : 'coffee'} title={details.missed ? t.plan.dayTagRescheduled : t.plan.dayTagRest} />}
        <div className="hstack plan-actions">
          {canChange && <Button size="sm" onClick={() => void setDay(details.budgetMinutes ? 'off' : 'study')}>{details.budgetMinutes ? t.plan.setDayAsRestBtn : t.plan.setDayAsStudyBtn}</Button>}
          {((canChange && !!details.budgetMinutes) || details.missed) && <Button size="sm" icon="calendar" onClick={() => {
            setDestination(dateRange(date, addDays(date, 14)).find(d => d !== selected && d < profile.examDate && !budgetFor(state, d, date)) ?? '');
            setMoving(true);
          }}>{t.plan.moveDayTasksBtn}</Button>}
          {!!catchUp.length && <Button size="sm" icon="play" onClick={() => void startItems(catchUp, 'drill')}>{t.plan.catchUp}</Button>}
          {selected === date && details.blocks.find(b => b.status === 'todo') && <Button size="sm" variant="ghost" onClick={async () => {
            const block = details.blocks.find(b => b.status === 'todo');
            if (block) await action({ type: 'skipBlock', date, blockId: block.id });
          }}>{t.today.queueSkipBtn}</Button>}
        </div>
      </Card>
    </Section>
    <Section title={t.plan.studyDaysPickerLabel} desc={t.plan.studyDaysCountTip}>
      <Card><div className="hstack plan-actions">
        <DayPicker label={t.plan.studyDaysPickerLabel} value={profile.weekdays} onChange={weekdays => { if (weekdays.length) void action({ type: 'profile', patch: { weekdays } }); }} />
        <span className="spacer" /><span className="t-3">{t.plan.schedule(profile.weekdays.length, profile.dailyMinutes)}</span>
      </div></Card>
    </Section>
    <Modal open={moving} onClose={() => setMoving(false)} title={t.plan.moveModalTitle} closeLabel={t.common.closeBtn}
      footer={<Button variant="primary" disabled={!destination} onClick={() => void move()}>{t.plan.confirmMoveDayBtn}</Button>}>
      <p>{t.plan.moveModalBody}</p><Field type="date" value={destination} onChange={setDestination} placeholder={t.plan.moveDate} />
    </Modal>
  </Page>;
}
