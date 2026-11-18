import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { addDays, daysBetween, monday, parseDate } from '@shared/dates.ts';
import { mastery, matchesTopic } from '@shared/stats.ts';
import { Page } from '../../shell/Shell.tsx';
import { Button, Card, Chip, Empty, Section, Stat } from '../../ui/ui.tsx';
import { t } from '../../copy/index.ts';
import { percent, recentDays, shortDate, topicName } from '../../lib/model.ts';
import { useStudy } from '../../lib/study.tsx';
import './insights.css';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function Insights() {
  const { predictions, mastery: current, weekly, state, date, bank, openCoach } = useStudy();
  const { profile } = state;
  const weak = [...bank.topics.keys()].filter(topic => matchesTopic(profile.weakTopics, topic));
  const weekStart = monday(date);
  const startWeek = monday(profile.startDate);
  const skillWeeks = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const mondayOfWeek = addDays(weekStart, (i - 7) * 7);
    const sunday = addDays(mondayOfWeek, 6);
    const end = sunday < date ? sunday : date;
    const snapshots = mondayOfWeek < startWeek ? new Map<string, number>()
      : new Map(mastery(state, bank, end).filter(row => row.samples > 0).map(row => [row.topic, row.value]));
    return { monday: mondayOfWeek, snapshots };
  }), [weekStart, startWeek, date, state, bank]);
  const days = recentDays(date, 14).map(d => ({ date: d, minutes: Math.round((state.days[d]?.seconds ?? 0) / 60) }));
  const yMax = Math.max(profile.dailyMinutes + 15, ...days.map(d => d.minutes));
  const timed = useMemo(() => {
    const attempts = new Map<string, { sum: number; count: number }>();
    for (const a of state.attempts) {
      if (a.date > date || !a.seconds) continue;
      const entry = attempts.get(a.topic) ?? { sum: 0, count: 0 };
      entry.sum += a.score;
      entry.count += 1;
      attempts.set(a.topic, entry);
    }
    return current.flatMap(row => {
      const entry = attempts.get(row.topic);
      return row.speedRatio != null && entry ? [{ ...row, speed: row.speedRatio, accuracy: entry.sum / entry.count }] : [];
    });
  }, [current, date, state.attempts]);
  const xMax = Math.max(2, ...timed.map(row => row.speed));

  return <Page title={t.insights.title} desc={t.insights.subtitle}>
    <div className="grid grid-2 enter">
      <Card title={t.insights.forecastTitle} sub={t.insights.forecastSubtitle}>
        {predictions.map(({ subject, estimate, range, scale, samples, evidence }) => {
          const goal = profile.targets[subject];
          return <div className="forecast-subject" key={subject}>
            <div className="range-row">
              <span className="range-name">{t.common.subjectName(subject)}</span>
              <div className="range-track" data-tone={subject}
                aria-label={t.insights.forecastSubjectRow(t.common.subjectName(subject), range[0], range[1], scale)}>
                <span className="range-band" style={{ left: `${range[0] / scale * 100}%`, width: `${(range[1] - range[0]) / scale * 100}%` }} />
                <span className="range-mid" style={{ left: `${estimate / scale * 100}%` }} />
                <span className="range-goal" title={t.insights.forecastTargetMark(goal)} style={{ left: `${goal / scale * 100}%` }} />
              </div>
              <span className="range-val num">{range[0]}–{range[1]} <span className="t-3">{t.common.outOf(scale)}</span></span>
            </div>
            <div className="hstack forecast-evidence t-3">
              <span>{evidence === 'sparse' ? t.insights.forecastSamples(samples)
                : t.insights.forecastEvidence(samples, evidence === 'broader' ? t.insights.broader : t.insights.developing)} · {t.insights.forecastTargetMark(goal)}</span>
              {evidence === 'sparse' && <Chip tone="warn" sm>{t.insights.sparseBadge}</Chip>}
            </div>
          </div>;
        })}
      </Card>
      <Card title={t.insights.weeklyReviewTitle} sub={shortDate(weekly.start) + ' – ' + shortDate(weekly.end)}
        actions={<Button size="sm" icon="sparkle" onClick={() => openCoach({ mode: 'weekly', page: t.nav.insights })}>{t.insights.askWeeklyCoachReviewBtn}</Button>}>
        <div className="grid grid-3">
          <Stat label={t.insights.completedDays} value={weekly.activeDays} unit={t.common.outOf(weekly.plannedDays)} />
          <Stat label={t.insights.hours} value={t.time.hours(weekly.seconds / 3600)} />
          <Stat label={t.insights.gains} value={weekly.gains.length} />
        </div>
        <div className="weekly-facts t-2">
          <p>{t.insights.weeklyCompletionRow(Math.round(weekly.seconds / 60), weekly.plannedFocusMinutes)}</p>
          {!weekly.attempts && <p>{t.insights.noWeeklyAttempts}</p>}
          {weekly.gains.map(gain => <p key={gain.topic}>{t.insights.weeklyBestGain(topicName(bank, gain.topic), percent(gain.delta))}</p>)}
          {weekly.focus[0] && <p>{t.insights.weeklyTopGap(topicName(bank, weekly.focus[0].topic))}</p>}
        </div>
      </Card>
    </div>
    {!!weak.length && <Section title={t.insights.heatmapTitle} desc={t.insights.heatmapQuestion}>
      <Card><div className="heat" style={{ gridTemplateColumns: 'minmax(85px, 130px) repeat(8, minmax(0, 1fr))' }}>
        <span />
        {skillWeeks.map(({ monday: week }) => <span key={week} className="heat-col num" title={shortDate(week)}>
          {week < startWeek ? shortDate(week) : t.insights.weekColumn(Math.floor(daysBetween(startWeek, week) / 7) + 1)}
        </span>)}
        {weak.map(topic => <div key={topic} style={{ display: 'contents' }}>
          <span className="heat-name">{topicName(bank, topic)}</span>
          {skillWeeks.map(({ monday: week, snapshots }) => {
            const value = snapshots.get(topic);
            const label = shortDate(week) + ' · ' + (value == null ? t.common.noValue : t.common.mastery(percent(value)));
            return <span key={week} className={`heat-cell${value == null ? ' is-empty' : ''}`} style={{ '--v': value ?? 0 } as CSSProperties}
              aria-label={label} title={label} />;
          })}
        </div>)}
      </div></Card>
    </Section>}
    <Section title={t.insights.hoursChartTitle} desc={t.insights.hoursChartQuestion}>
      <Card><div className="bars">
        {days.map(day => <div className="bars-col" key={day.date} title={shortDate(day.date) + ' · ' + t.time.minutes(day.minutes)}>
          <span className="bars-bar" style={{ height: `${day.minutes / yMax * 100}%` }} />
          <span className="bars-x num">{parseDate(day.date).getDate()}</span>
        </div>)}
        <span className="bars-goal" style={{ bottom: `${profile.dailyMinutes / yMax * 100}%` }}>{t.time.minutes(profile.dailyMinutes)}</span>
      </div></Card>
    </Section>
    <Section title={t.insights.speedScatterTitle} desc={t.insights.speedScatterQuestion}>
      {timed.length ? <Card>
        <div className="t-eyebrow">{t.insights.accuracyAxis}</div>
        <div className="speed-plot">
          <span className="speed-guide is-vertical" style={{ left: `${100 / xMax}%` }} />
          <span className="speed-guide is-horizontal" style={{ bottom: '65%' }} />
          {timed.map(row => <span role="img" key={row.topic} className="speed-point" data-tone={row.subject}
            title={t.insights.speedPoint(topicName(bank, row.topic), Math.round(row.speed * 100) / 100, percent(row.accuracy))}
            aria-label={t.insights.speedPoint(topicName(bank, row.topic), Math.round(row.speed * 100) / 100, percent(row.accuracy))}
            style={{ left: `${clamp(row.speed / xMax) * 100}%`, bottom: `${clamp(row.accuracy) * 100}%` }} />)}
        </div>
        <div className="hstack t-eyebrow"><span className="spacer" />{t.insights.speedAxis}</div>
      </Card> : <Empty title={t.insights.noSpeed} icon="insights" />}
    </Section>
  </Page>;
}
