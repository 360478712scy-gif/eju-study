// First launch of v2: welcome back, confirm scores and targets, choose the daily time, start.
import { useMemo, useState, type FormEvent } from 'react';
import { useReady, update } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { Button, SubjectTag } from '../../components/ui.tsx';
import { Icon, type IconName } from '../../components/Icon.tsx';
import type { ScoreMap, Subject } from '@shared/types.ts';
import { SCALE_MAX } from '@shared/stats.ts';
import { budgetFor, daysLeftOn } from '@shared/planner.ts';
import { addDays } from '@shared/dates.ts';
import { cx, fmtDateShort } from '../../lib/format.ts';
import { regenerateDay } from '../today/blocks.ts';
import './onboarding.css';

const ORDER: Subject[] = ['japanese', 'math', 'physics', 'chemistry'];

const HOURS: { h: number; label: string }[] = [
  { h: 4, label: '保底' },
  { h: 5, label: '稳步' },
  { h: 6, label: '推荐' },
  { h: 7, label: '加量' },
  { h: 8, label: '全力冲刺' },
];

type Draft = Record<Subject, string>;

const toDraft = (m: ScoreMap): Draft => ({ japanese: String(m.japanese), math: String(m.math), physics: String(m.physics), chemistry: String(m.chemistry) });

function parse(v: string, s: Subject): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > SCALE_MAX[s]) return null;
  return Math.round(n);
}

export function OnboardingPage() {
  const { state, today } = useReady();
  const profile = state.profile;
  const [step, setStep] = useState<0 | 1>(0);
  const [base, setBase] = useState<Draft>(() => toDraft(profile.baseline));
  const [target, setTarget] = useState<Draft>(() => toDraft(profile.targets));
  const [minutes, setMinutes] = useState(profile.dailyMinutes > 0 ? profile.dailyMinutes : 360);

  const left = Math.max(0, daysLeftOn(state, today));
  const baseNums = ORDER.map((s) => parse(base[s], s));
  const targetNums = ORDER.map((s) => parse(target[s], s));
  const valid = baseNums.every((n) => n !== null) && targetNums.every((n) => n !== null);
  const sumOf = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
  const baseTotal = sumOf(baseNums);
  const targetTotal = sumOf(targetNums);

  // Total planned hours from today to the exam, with the automatic taper before the exam.
  const plannedHours = useMemo(() => {
    const p = { ...state, profile: { ...profile, dailyMinutes: minutes } };
    let total = 0;
    for (let d = today; d < profile.examDate; d = addDays(d, 1)) total += budgetFor(p, d);
    return Math.round(total / 60);
  }, [state, profile, minutes, today]);

  const history = state.attempts.length;
  const vocabHistory = state.vocabAttempts.length;

  const next = (e: FormEvent) => {
    e.preventDefault();
    if (valid) setStep(1);
  };

  const begin = () => {
    if (!valid) return;
    const nums = (xs: (number | null)[]) => Object.fromEntries(ORDER.map((s, i) => [s, xs[i] ?? 0])) as ScoreMap;
    update(
      (d, bank, t) => {
        d.profile.baseline = nums(baseNums);
        d.profile.targets = nums(targetNums);
        d.profile.targetTotal = targetTotal;
        d.profile.dailyMinutes = minutes;
        d.profile.startDate = t;
        d.profile.onboarded = true;
        regenerateDay(d, bank, t);
      },
      { saveNow: true },
    );
    navigate('/', { replace: true, force: true });
  };

  return (
    <div className="ob">
      <div className="ob-card">
        <aside className="ob-hero">
          <div className="ob-brand">
            <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden>
              <rect width="64" height="64" rx="16" fill="rgba(255,255,255,0.18)" />
              <path d="M18 40c6-14 22-14 28 0" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
              <circle cx="32" cy="24" r="5" fill="#fff" />
            </svg>
            <span>澄学 EJU</span>
          </div>

          <div className="ob-count">
            <div className="ob-count-label">欢迎回来 · 距 {fmtDateShort(profile.examDate)} EJU</div>
            <div className="ob-count-row">
              <span className="ob-count-num num">{left}</span>
              <span className="ob-count-unit">天</span>
            </div>
            <div className="ob-count-sub">目标 {targetTotal || profile.targetTotal} 分，从今天开始全力冲刺。</div>
          </div>

          <ul className="ob-points">
            <Point icon="calendar" title={`${left} 天，三个阶段`} text="专项突破 → 套题实战 → 考前调整。每天打开就知道先做什么。" />
            <Point icon="checkCircle" title="每题自动判分 + 详细解析" text="不用再对答案表，做完立刻知道对错和原因。" />
            <Point icon="refresh" title="错题自动回炉" text="做错和没把握的题会在 1、2、4 天后回来，直到真正掌握。" />
          </ul>

          {(history > 0 || vocabHistory > 0) && (
            <div className="ob-kept">
              <Icon name="check" size={14} />
              已保留你之前的{[history > 0 ? `${history} 条做题记录` : '', vocabHistory > 0 ? `${vocabHistory} 次单词练习` : ''].filter(Boolean).join('和')}
            </div>
          )}
        </aside>

        <main className="ob-main">
          <div className="ob-steps" aria-label={`第 ${step + 1} 步，共 2 步`}>
            <span className={cx('ob-step', step === 0 && 'is-on', step > 0 && 'is-done')}>
              <span className="ob-step-dot">{step > 0 ? <Icon name="check" size={12} /> : '1'}</span>
              分数与目标
            </span>
            <span className="ob-step-line" />
            <span className={cx('ob-step', step === 1 && 'is-on')}>
              <span className="ob-step-dot">2</span>
              每天学多久
            </span>
          </div>

          {step === 0 ? (
            <form className="ob-pane" key="scores" onSubmit={next}>
              <h1 className="ob-title">先确认起点和目标</h1>
              <p className="ob-sub">起点填最近一次成绩或自测估计。目标决定每科分到多少时间，之后也能改。</p>

              <div className="ob-table">
                <div className="ob-thead">
                  <span>科目</span>
                  <span>起点</span>
                  <span />
                  <span>目标</span>
                  <span className="ob-th-max">满分</span>
                </div>
                {ORDER.map((s, i) => {
                  const b = baseNums[i];
                  const t = targetNums[i];
                  return (
                    <div key={s} className="ob-row">
                      <SubjectTag subject={s} />
                      <ScoreInput value={base[s]} invalid={b === null} onChange={(v) => setBase({ ...base, [s]: v })} max={SCALE_MAX[s]} label={`起点`} />
                      <Icon name="arrowRight" size={16} className="ob-arrow" />
                      <ScoreInput value={target[s]} invalid={t === null} onChange={(v) => setTarget({ ...target, [s]: v })} max={SCALE_MAX[s]} label={`目标`} strong />
                      <span className={cx('ob-delta num', b !== null && t !== null && t - b > 0 && 'is-up')}>
                        {b !== null && t !== null ? (t - b > 0 ? `+${t - b}` : t - b === 0 ? '持平' : `${t - b}`) : '—'}
                        <small>/ {SCALE_MAX[s]}</small>
                      </span>
                    </div>
                  );
                })}
                <div className="ob-total">
                  <span>合计</span>
                  <span className="num">{baseTotal}</span>
                  <Icon name="arrowRight" size={16} className="ob-arrow" />
                  <span className="num ob-total-target">{targetTotal}</span>
                  <span className="ob-total-gap num">{targetTotal > baseTotal ? `要提 ${targetTotal - baseTotal} 分` : ''}</span>
                </div>
              </div>

              {!valid && <p className="ob-error">分数要在 0 到满分之间。</p>}

              <div className="ob-actions">
                <Button type="submit" variant="primary" size="lg" iconRight="arrowRight" disabled={!valid}>
                  下一步
                </Button>
              </div>
            </form>
          ) : (
            <div className="ob-pane" key="time">
              <h1 className="ob-title">每天学多久？</h1>
              <p className="ob-sub">时间越多，每天的计划越满。之后可以在「冲刺计划」里按天调整或设休息日。</p>

              <div className="ob-hours" role="radiogroup" aria-label="每天学习时长">
                {HOURS.map(({ h, label }) => (
                  <button
                    key={h}
                    type="button"
                    role="radio"
                    aria-checked={minutes === h * 60}
                    className={cx('ob-hour', minutes === h * 60 && 'is-on', h === 6 && 'is-rec')}
                    onClick={() => setMinutes(h * 60)}
                  >
                    <span className="ob-hour-num num">{h}</span>
                    <span className="ob-hour-unit">小时</span>
                    <span className="ob-hour-label">{label}</span>
                  </button>
                ))}
              </div>

              <div className="ob-summary">
                <div className="ob-sum-item">
                  <span className="num">{plannedHours}</span>
                  <small>小时 · 到考试前总计</small>
                </div>
                <div className="ob-sum-note">
                  <Icon name="info" size={15} />
                  <span>考前最后一天自动减量到 2.5 小时以内，前几天也会略减，把状态留给考场。</span>
                </div>
              </div>

              <div className="ob-actions">
                <Button variant="ghost" size="lg" icon="arrowLeft" onClick={() => setStep(0)}>
                  上一步
                </Button>
                <Button variant="primary" size="lg" iconRight="arrowRight" onClick={begin} autoFocus>
                  开始冲刺
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Point({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <li className="ob-point">
      <span className="ob-point-icon">
        <Icon name={icon} size={17} />
      </span>
      <div>
        <div className="ob-point-title">{title}</div>
        <div className="ob-point-text">{text}</div>
      </div>
    </li>
  );
}

function ScoreInput({ value, onChange, max, invalid, label, strong }: { value: string; onChange: (v: string) => void; max: number; invalid: boolean; label: string; strong?: boolean }) {
  return (
    <input
      className={cx('ob-input num', invalid && 'is-invalid', strong && 'is-strong')}
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      step={1}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.select()}
    />
  );
}
