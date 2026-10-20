// 学习目标: exam date, baseline/target per subject, daily minutes, weak units.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Subject } from '@shared/types.ts';
import { daysBetween, parseDate, weekdayZh } from '@shared/dates.ts';
import { update, useApp } from '../../lib/store.ts';
import { cx, fmtMinutes, SUBJECT_NAME } from '../../lib/format.ts';
import { Icon, SUBJECT_ICON } from '../../components/Icon.tsx';
import { SubjectDot } from '../../components/ui.tsx';
import { Row, SettingCard, Slider } from './controls.tsx';

const ORDER: Subject[] = ['japanese', 'math', 'physics', 'chemistry'];
/** EJU scale per subject (日语 = 读解 + 听解·听读解; 记述 is scored separately). */
const MAX: Record<Subject, number> = { japanese: 400, math: 200, physics: 100, chemistry: 100 };

type Kind = 'baseline' | 'targets';

function validate(kind: Kind, subject: Subject, text: string, other: number): string | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return '请输入整数';
  const n = Number(t);
  if (n > MAX[subject]) return `满分 ${MAX[subject]}`;
  if (kind === 'targets' && n < other) return '目标不能低于现在';
  if (kind === 'baseline' && n > other) return '比目标还高，先调目标';
  return null;
}

function ScoreInput({ kind, subject, value, other, onCommit }: { kind: Kind; subject: Subject; value: number; other: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  const error = validate(kind, subject, text, other);

  const commit = () => {
    setFocused(false);
    if (error) {
      setText(String(value));
      return;
    }
    const n = Number(text.trim());
    if (n !== value) onCommit(n);
    else setText(String(value));
  };

  return (
    <label className={cx('sg-score', error && 'is-error', kind === 'targets' && 'is-target')}>
      <input
        className="num"
        inputMode="numeric"
        value={text}
        aria-label={`${SUBJECT_NAME[subject]}${kind === 'targets' ? '目标' : '现在'}分数`}
        aria-invalid={!!error}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value.replace(/[^\d０-９]/g, '').replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10)))}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
          if (e.key === 'Escape') {
            setText(String(value));
            e.currentTarget.blur();
          }
        }}
      />
      <span className="sg-score-max">/ {MAX[subject]}</span>
      {error && focused && <span className="sg-score-error">{error}</span>}
    </label>
  );
}

export function GoalsCard({ onPlanStale }: { onPlanStale: () => void }) {
  const profile = useApp((s) => s.state?.profile);
  const today = useApp((s) => s.today);
  const bank = useApp((s) => s.bank);
  const [minutes, setMinutes] = useState(profile?.dailyMinutes ?? 360);
  const minutesRef = useRef(minutes);
  minutesRef.current = minutes;

  useEffect(() => {
    if (profile) setMinutes(profile.dailyMinutes);
  }, [profile?.dailyMinutes]);

  const units = useMemo(
    () => (bank ? ORDER.map((s) => ({ subject: s, units: bank.bundle.taxonomy.subjects[s].units.map((u) => ({ id: u.id, name: u.name })) })) : []),
    [bank],
  );

  if (!profile) return null;

  const left = daysBetween(today, profile.examDate);
  const exam = parseDate(profile.examDate);
  const baseTotal = ORDER.reduce((s, k) => s + profile.baseline[k], 0);
  const targetTotal = ORDER.reduce((s, k) => s + profile.targets[k], 0);

  const setScore = (kind: Kind, subject: Subject, n: number) => {
    update((d) => {
      d.profile[kind][subject] = n;
      d.profile.targetTotal = ORDER.reduce((s, k) => s + d.profile.targets[k], 0);
    });
    onPlanStale();
  };

  const commitMinutes = () => {
    const m = minutesRef.current;
    if (m === profile.dailyMinutes) return;
    update((d) => {
      d.profile.dailyMinutes = m;
    });
    onPlanStale();
  };

  const toggleWeak = (id: string) => {
    update((d) => {
      const set = new Set(d.profile.weakTopics);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      d.profile.weakTopics = [...set];
    });
    onPlanStale();
  };

  const todayOverride = profile.dayMinutes[today];

  return (
    <SettingCard id="goals" icon="target" title="学习目标" desc="计划按这些数字安排每天的量和重点。">
      <div className="sg-exam">
        <div className="sg-exam-date">
          <span className="sg-exam-label">考试日期</span>
          <span className="sg-exam-value">
            {exam.getFullYear()}年{exam.getMonth() + 1}月{exam.getDate()}日 · {weekdayZh(profile.examDate)}
          </span>
        </div>
        <div className="sg-exam-left">
          {left > 0 ? (
            <>
              还有 <b className="num">{left}</b> 天
            </>
          ) : left === 0 ? (
            '就是今天'
          ) : (
            '已结束'
          )}
        </div>
      </div>

      <div className="sg-scores" role="table" aria-label="分数目标">
        <div className="sg-scores-row sg-scores-head" role="row">
          <span role="columnheader">科目</span>
          <span role="columnheader">现在</span>
          <span role="columnheader">目标</span>
          <span role="columnheader" className="sg-col-gain">
            要提高
          </span>
        </div>
        {ORDER.map((s) => {
          const gain = profile.targets[s] - profile.baseline[s];
          return (
            <div key={s} className="sg-scores-row" role="row">
              <span className={cx('sg-subject', `tone-${s}`)} role="cell">
                <span className="sg-subject-icon">
                  <Icon name={SUBJECT_ICON[s]} size={15} />
                </span>
                {SUBJECT_NAME[s]}
              </span>
              <span role="cell">
                <ScoreInput kind="baseline" subject={s} value={profile.baseline[s]} other={profile.targets[s]} onCommit={(n) => setScore('baseline', s, n)} />
              </span>
              <span role="cell">
                <ScoreInput kind="targets" subject={s} value={profile.targets[s]} other={profile.baseline[s]} onCommit={(n) => setScore('targets', s, n)} />
              </span>
              <span role="cell" className="sg-gain num sg-col-gain">
                {gain > 0 ? `+${gain}` : gain}
              </span>
            </div>
          );
        })}
        <div className="sg-scores-row sg-scores-total" role="row">
          <span role="cell">合计</span>
          <span role="cell" className="num">
            {baseTotal}
          </span>
          <span role="cell" className="num">
            {targetTotal}
          </span>
          <span role="cell" className="sg-gain num sg-col-gain">
            +{targetTotal - baseTotal}
          </span>
        </div>
      </div>

      <Row
        title="每天学习时长"
        desc={todayOverride !== undefined ? `今天单独设成了 ${fmtMinutes(todayOverride)}，改这里影响之后的日子。` : '计划会把每天的题量排进这个时间里。'}
        stack
      >
        <Slider
          label="每天学习时长"
          value={minutes}
          min={60}
          max={720}
          step={15}
          onChange={setMinutes}
          onCommit={commitMinutes}
          format={(v) => fmtMinutes(v)}
          marks={[
            [60, '1h'],
            [240, '4h'],
            [360, '6h'],
            [480, '8h'],
            [720, '12h'],
          ]}
        />
      </Row>

      <Row title="薄弱单元" desc="选中的单元会在计划里多排一些。做题数据多了以后，计划主要看真实正确率。" stack>
        <div className="sg-weak">
          {units.map(({ subject, units: list }) => (
            <div key={subject} className="sg-weak-group">
              <span className="sg-weak-subject">
                <SubjectDot subject={subject} />
                {SUBJECT_NAME[subject]}
              </span>
              <div className="sg-chips">
                {list.map((u) => {
                  const on = profile.weakTopics.includes(u.id);
                  return (
                    <button key={u.id} type="button" className={cx('sg-chip', on && 'is-on')} aria-pressed={on} onClick={() => toggleWeak(u.id)}>
                      {on && <Icon name="check" size={13} />}
                      {u.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Row>

    </SettingCard>
  );
}
