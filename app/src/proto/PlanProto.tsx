// Hi-fi reference for 计划: roadmap to 6/20 + week view + study-day picker (mock).
import { useState } from 'react';
import { Page } from '../shell/Shell.tsx';
import { Button, Card, Chip, Icon, Section, Segmented, Dot, type Tone } from '../ui/ui.tsx';

const START = new Date(2026, 10, 19).getTime();
const END = new Date(2027, 5, 20).getTime();
const pos = (y: number, m: number, d: number) => ((new Date(y, m - 1, d).getTime() - START) / (END - START)) * 100;

const PHASES = [
  { name: '打地基', sub: '弱项逐个补齐', from: pos(2026, 11, 19), to: pos(2027, 1, 24), tone: 'math' as Tone },
  { name: '强化', sub: '专项提速 · 题型全覆盖', from: pos(2027, 1, 25), to: pos(2027, 3, 28), tone: 'physics' as Tone },
  { name: '综合', sub: '整卷模考 + 校内考', from: pos(2027, 3, 29), to: pos(2027, 5, 30), tone: 'chemistry' as Tone },
  { name: '冲刺', sub: '查漏 · 调状态', from: pos(2027, 5, 31), to: 100, tone: 'school' as Tone },
];
const MONTHS = [
  ['12月', pos(2026, 12, 1)],
  ['1月', pos(2027, 1, 1)],
  ['2月', pos(2027, 2, 1)],
  ['3月', pos(2027, 3, 1)],
  ['4月', pos(2027, 4, 1)],
  ['5月', pos(2027, 5, 1)],
  ['6月', pos(2027, 6, 1)],
] as const;
const MILESTONES = [
  { at: pos(2026, 12, 27), label: '第一次整卷', sub: '数学 145 · 理科 135' },
  { at: pos(2027, 2, 28), label: '弱项转正', sub: '数学 165 · 理科 155' },
  { at: pos(2027, 4, 25), label: '稳定高分', sub: '数学 180 · 理科 170' },
  { at: 100, label: 'EJU', sub: '6 月 20 日' },
];

const WEEK = [
  { d: '周一', date: '11/16', state: 'past', tasks: [] as [Tone, string][] },
  { d: '周二', date: '11/17', state: 'past', tasks: [] },
  { d: '周三', date: '11/18', state: 'past', tasks: [] },
  { d: '周四', date: '11/19', state: 'today', tasks: [['physics', '電磁誘導'], ['math', '数列'], ['chemistry', '無機背诵'], ['neutral', '错题']] as [Tone, string][] },
  { d: '周五', date: '11/20', state: 'study', tasks: [['math', '場合の数'], ['chemistry', '熱化学'], ['physics', 'コンデンサー']] as [Tone, string][] },
  { d: '周六', date: '11/21', state: 'study', tasks: [['physics', 'ばね'], ['math', '指数対数'], ['chemistry', '有機流程']] as [Tone, string][] },
  { d: '周日', date: '11/22', state: 'rest', tasks: [] },
];

export function PlanProto() {
  const [days, setDays] = useState([true, true, false, true, true, true, false]);
  const [view, setView] = useState<'week' | 'month'>('week');
  const today = pos(2026, 11, 19);
  return (
    <Page
      title="到 6 月 20 日"
      desc="四个阶段、213 天、约 300 小时。每天学完，后面的安排会跟着你的作答自动调整。"
      actions={
        <>
          <Chip icon="calendar">每周 5 天 · 每天 2 小时</Chip>
        </>
      }
    >
      <Card className="road enter" pad={false}>
        <div className="road-months">
          {MONTHS.map(([m, at]) => (
            <span key={m} style={{ left: `${at}%` }}>
              {m}
            </span>
          ))}
        </div>
        <div className="road-track">
          {PHASES.map((p, i) => (
            <div key={p.name} className={`road-phase${i === 0 ? ' is-now' : ''}`} data-tone={p.tone} style={{ left: `${p.from}%`, width: `${p.to - p.from}%` }}>
              <span className="road-phase-fill" style={i === 0 ? { width: `${((today - p.from) / (p.to - p.from)) * 100}%` } : undefined} />
            </div>
          ))}
          {MILESTONES.map((m) => (
            <span key={m.label} className="road-flag" style={{ left: `${m.at}%` }} />
          ))}
          <span className="road-today" style={{ left: `${today}%` }}>
            <span className="road-today-label">今天</span>
          </span>
        </div>
        <div className="road-phases">
          {PHASES.map((p, i) => (
            <div key={p.name} className={`road-phase-card${i === 0 ? ' is-now' : ''}`} style={{ left: `${p.from}%`, width: `${p.to - p.from}%` }}>
              <div className="hstack" style={{ gap: 6 }}>
                <Dot tone={p.tone} />
                <b>{p.name}</b>
              </div>
              <span>{p.sub}</span>
            </div>
          ))}
        </div>
        <div className="road-miles">
          {MILESTONES.map((m) => (
            <div key={m.label} className="road-mile">
              <Icon name={m.label === 'EJU' ? 'trophy' : 'flag'} size={15} />
              <div>
                <div className="road-mile-title">{m.label}</div>
                <div className="road-mile-sub num">{m.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Section
        title="这一周"
        desc="11 月 16 日 – 22 日 · 第 1 周"
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'week', label: '周' },
                { value: 'month', label: '月' },
              ]}
            />
            <Button size="sm" icon="chev-left" square aria-label="上一周" />
            <Button size="sm" icon="chev-right" square aria-label="下一周" />
          </>
        }
      >
        <div className="week">
          {WEEK.map((w) => (
            <button key={w.d} type="button" className={`wday is-${w.state}`}>
              <div className="wday-head">
                <span>{w.d}</span>
                <span className="num">{w.date}</span>
              </div>
              {w.state === 'rest' ? (
                <div className="wday-rest">
                  <Icon name="coffee" size={20} />
                  休息
                </div>
              ) : w.state === 'past' ? (
                <div className="wday-rest">计划开始前</div>
              ) : (
                <>
                  <div className="wday-tasks">
                    {w.tasks.map(([tone, t]) => (
                      <span key={t} className="wday-task">
                        <Dot tone={tone} />
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="wday-foot num">120 分钟</div>
                </>
              )}
            </button>
          ))}
        </div>
      </Section>

      <Section title="学习日" desc="选满 5 天。某天有事，在当天点“挪到明天”就行。">
        <Card>
          <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
            {['一', '二', '三', '四', '五', '六', '日'].map((d, i) => (
              <button
                key={d}
                type="button"
                className={`daypill${days[i] ? ' is-on' : ''}`}
                aria-pressed={days[i]}
                onClick={() => setDays(days.map((v, j) => (j === i ? !v : v)))}
              >
                {d}
              </button>
            ))}
            <span className="spacer" />
            <span className="t-3 num" style={{ fontSize: 'var(--fs-sm)' }}>
              已选 {days.filter(Boolean).length} / 5 天
            </span>
          </div>
        </Card>
      </Section>
      <div style={{ height: 16 }} />
    </Page>
  );
}
