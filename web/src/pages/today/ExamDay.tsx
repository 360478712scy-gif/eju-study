// Exam day (timetable + checklist) and the calm screen after the exam.
import { useEffect, useMemo, useState } from 'react';
import { useReady } from '../../lib/store.ts';
import { href } from '../../lib/router.ts';
import { Button, IconTile, StatTile } from '../../components/ui.tsx';
import { Icon, type IconName } from '../../components/Icon.tsx';
import { navigate } from '../../lib/router.ts';
import { weekdayZh } from '@shared/dates.ts';
import { cx, fmtDateShort } from '../../lib/format.ts';
import type { Subject } from '@shared/types.ts';
import './exam-day.css';

interface Slot {
  start: string;
  end: string;
  name: string;
  detail: string;
  icon: IconName;
  tone: Subject | 'neutral';
  rest?: boolean;
}

const SLOTS: Slot[] = [
  { start: '09:30', end: '12:00', name: '日语', detail: '记述 30 分 · 读解 40 分 · 听读解 / 听解 55 分', icon: 'languages', tone: 'japanese' },
  { start: '12:00', end: '13:30', name: '午休', detail: '吃饭、喝水、闭眼休息。不对答案，不翻难题。', icon: 'coffee', tone: 'neutral', rest: true },
  { start: '13:30', end: '15:00', name: '理科', detail: '物理 · 化学 共 80 分钟，两科时间自己分配', icon: 'atom', tone: 'physics' },
  { start: '15:00', end: '15:40', name: '休息', detail: '活动一下，看一眼公式速记就够了。', icon: 'coffee', tone: 'neutral', rest: true },
  { start: '15:40', end: '17:10', name: '数学', detail: 'コース2 · 80 分钟，先拿稳会做的大题', icon: 'sigma', tone: 'math' },
];

const CHECKLIST = [
  { id: 'ticket', label: '受験票', hint: '贴好照片' },
  { id: 'id', label: '在留カード / パスポート', hint: '原件，不能用复印件' },
  { id: 'pencil', label: 'HB 铅笔', hint: '多带几支，削好' },
  { id: 'eraser', label: '橡皮', hint: '干净、好擦' },
  { id: 'watch', label: '手表', hint: '只能看时间的普通手表' },
  { id: 'lunch', label: '午饭和水', hint: '吃熟悉的东西' },
  { id: 'phone', label: '手机关机', hint: '进考场前关机放进包里' },
];

const TIPS = [
  '早上只翻错题本和公式速记，不做新题。',
  '听解只播一遍：先扫一眼选项，边听边记关键词。',
  '卡住的题先跳过、做标记，保证会做的都拿到。',
  '每场结束不对答案，把注意力留给下一场。',
];

const STORE_KEY = 'eju-exam-checklist';

function loadChecks(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function nowHM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Cumulative effort since the sprint began: days studied (≥ 30 min), hours, questions, mocks. */
function useEffort() {
  const { state } = useReady();
  const start = state.profile.startDate;
  return useMemo(() => {
    let seconds = 0;
    let days = 0;
    for (const [d, log] of Object.entries(state.days)) {
      if (d < start) continue;
      seconds += log.seconds;
      if (log.seconds >= 1800) days++;
    }
    const answered = state.attempts.filter((a) => a.date >= start).length;
    return { hours: Math.round(seconds / 360) / 10, wholeHours: Math.round(seconds / 3600), days, answered, mocks: state.mocks.length };
  }, [state, start]);
}

export function ExamDay() {
  const { today } = useReady();
  const effort = useEffort();
  const [checks, setChecks] = useState<Record<string, boolean>>(loadChecks);
  const [time, setTime] = useState(nowHM);
  useEffect(() => {
    const t = setInterval(() => setTime(nowHM()), 30_000);
    return () => clearInterval(t);
  }, []);
  const toggle = (id: string) => {
    setChecks((c) => {
      const next = { ...c, [id]: !c[id] };
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        /* per-viewer convenience only */
      }
      return next;
    });
  };
  const ready = CHECKLIST.filter((c) => checks[c.id]).length;
  const curIdx = SLOTS.findIndex((s) => time >= s.start && time < s.end);
  const nextIdx = SLOTS.findIndex((s) => !s.rest && time < s.start);
  const finished = time >= '17:10';
  // Before the first session the checklist is the time-critical card, after the last one the wrap-up:
  // either leads when the layout stacks.
  const leaving = time < SLOTS[0].start;

  return (
    <div className="page ex">
      <header className="ex-head">
        <div>
          <div className="ex-date">
            <Icon name="flag" size={14} />
            {fmtDateShort(today)} {weekdayZh(today)} · 考试日
          </div>
          <h1 className="ex-title">{finished ? '考完了，辛苦了' : '今天就是考试日，按平时的节奏来'}</h1>
          <p className="ex-sub">
            {finished ? (
              '这段时间的努力都是真的。'
            ) : effort.days > 0 ? (
              <>
                <span className="num">{effort.days}</span> 天 · <span className="num">{effort.wholeHours}</span> 小时 · <span className="num">{effort.answered.toLocaleString('en-US')}</span> 题 · 你准备好了
              </>
            ) : (
              '按平时的节奏来，你准备好了。'
            )}
          </p>
        </div>
      </header>

      <div className="ex-layout">
        <section className="card ex-timeline">
          <div className="ex-card-head">
            <h2 className="ex-h2">时间表</h2>
            <span className="ex-now num">
              <Icon name="clock" size={14} />
              现在 {time}
            </span>
          </div>
          <ol className="ex-slots">
            {SLOTS.map((s, i) => {
              const past = time >= s.end;
              const cur = i === curIdx;
              const next = !cur && i === nextIdx;
              return (
                <li key={s.start} className={cx('ex-slot', `tone-${s.tone}`, s.rest && 'is-rest', past && 'is-past', cur && 'is-now', next && 'is-next')}>
                  <div className="ex-slot-time num">
                    <span>{s.start.replace(/^0/, '')}</span>
                    <span className="ex-slot-end">{s.end.replace(/^0/, '')}</span>
                  </div>
                  <div className="ex-slot-dot">
                    <Icon name={past ? 'check' : s.icon} size={s.rest ? 14 : 17} />
                  </div>
                  <div className="ex-slot-body">
                    <div className="ex-slot-name">
                      {s.name}
                      {cur && <span className="ex-tag">进行中</span>}
                      {next && <span className="ex-tag is-next">下一场</span>}
                    </div>
                    <div className="ex-slot-detail">{s.detail}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className={cx('ex-side', (leaving || finished) && 'is-first')}>
          {finished ? (
            <section className="card ex-wrap">
              <IconTile icon="award" tone="success" size="lg" />
              <h2 className="ex-wrap-title">今晚好好休息</h2>
              <p className="ex-wrap-text">不对答案，不翻题。好好吃一顿，早点睡。</p>
              {effort.days > 0 && (
                <div className="ex-wrap-stats">
                  <StatTile boxed label="冲刺" value={effort.days} unit="天" />
                  <StatTile boxed label="学习" value={effort.wholeHours} unit="小时" />
                  <StatTile boxed label="做题" value={effort.answered.toLocaleString('en-US')} unit="题" />
                </div>
              )}
            </section>
          ) : (
            <>
              <section className="card ex-check">
                <div className="ex-card-head">
                  <h2 className="ex-h2">出门前检查</h2>
                  <span className={cx('ex-count num', ready === CHECKLIST.length && 'is-ok')}>
                    {ready}/{CHECKLIST.length}
                  </span>
                </div>
                <ul className="ex-items">
                  {CHECKLIST.map((c) => (
                    <li key={c.id}>
                      <button type="button" className={cx('ex-item', checks[c.id] && 'is-on')} onClick={() => toggle(c.id)} aria-pressed={!!checks[c.id]}>
                        <span className="ex-box">{checks[c.id] && <Icon name="check" size={14} />}</span>
                        <span className="ex-item-text">
                          <span className="ex-item-label">{c.label}</span>
                          <span className="ex-item-hint">{c.hint}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="card ex-tips">
                <h2 className="ex-h2">考场提醒</h2>
                <ul>
                  {TIPS.map((t) => (
                    <li key={t}>
                      <Icon name="check" size={14} />
                      {t}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AfterExam() {
  const summary = useEffort();

  return (
    <div className="page ex-after">
      <section className="ex-after-card">
        <IconTile icon="award" tone="primary" size="lg" className="ex-after-icon" />
        <h1 className="ex-after-title">考试结束，辛苦了</h1>
        <p className="ex-after-sub">不管结果如何，这段时间的努力都是真的。先好好休息几天。</p>
        <div className="ex-after-stats">
          <div>
            <span className="num">{summary.days}</span>
            <small>天认真学习</small>
          </div>
          <div>
            <span className="num">{summary.hours}</span>
            <small>小时</small>
          </div>
          <div>
            <span className="num">{summary.answered}</span>
            <small>道题</small>
          </div>
          <div>
            <span className="num">{summary.mocks}</span>
            <small>次模考</small>
          </div>
        </div>
        <div className="ex-after-actions">
          <Button variant="secondary" icon="chart" onClick={() => navigate('/stats')}>
            回顾学习数据
          </Button>
          <a className="ex-after-link" href={href('/mistakes')}>
            错题本
          </a>
        </div>
      </section>
    </div>
  );
}
