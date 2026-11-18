// Hi-fi references for 模考, 笔记, 数据, AI 助教 sheet, 首次引导 and 设置 (mock).
import { useState } from 'react';
import { Aside, Page } from '../shell/Shell.tsx';
import {
  Bar,
  Button,
  Card,
  Chip,
  Dot,
  Field,
  Icon,
  IconButton,
  List,
  Orb,
  Row,
  Section,
  Segmented,
  Slider,
  Stat,
  SubjectGlyph,
  ThinkRing,
  Toggle,
  type Tone,
} from '../ui/ui.tsx';

/* ───────── 模考 ───────── */
export function MockProto() {
  return (
    <Page title="模考" desc="整卷按考场时间来。做完看哪些考点丢了分，下一周会多练它们。">
      <Section title="EJU 整卷">
        <div className="grid grid-2">
          {[
            { s: 'math' as const, t: '数学コース2', m: '80 分钟 · 原创整卷 A', last: '还没考过', next: '12 月 27 日（周日）' },
            { s: 'physics' as const, t: '理科 · 物理 + 化学', m: '80 分钟 · 2019 第 1 回', last: '上次 124 / 200', next: '12 月 27 日（周日）' },
          ].map((c) => (
            <Card key={c.t} className="mock-card" onClick={() => {}}>
              <div className="hstack" style={{ gap: 12 }}>
                <SubjectGlyph subject={c.s} size="lg" />
                <div style={{ flex: 1 }}>
                  <div className="mock-title">{c.t}</div>
                  <div className="t-3" style={{ fontSize: 'var(--fs-sm)' }}>{c.m}</div>
                </div>
                <Icon name="chev-right" size={18} />
              </div>
              <div className="mock-foot">
                <span className="t-3">{c.last}</span>
                <span className="spacer" />
                <Chip icon="calendar" sm>
                  计划 {c.next}
                </Chip>
              </div>
            </Card>
          ))}
        </div>
      </Section>
      <Section title="校内考" desc="只有明治（情報科学・数学科）和青山学院理工真的有笔试，其他学校按院校水平拔高来练。">
        <div className="grid grid-3">
          {[
            ['明治 · 理工', '数学 · 记述 60 分钟', '真考'],
            ['青山学院 · 理工', '数学 60 分钟 + 理科 60 分钟', '真考'],
            ['早稻田 · 理工三学部', '院校水平拔高 · 面试思路', '拔高'],
          ].map(([n, d, k]) => (
            <Card key={n} onClick={() => {}} className="mock-card">
              <div className="hstack" style={{ gap: 10 }}>
                <SubjectGlyph subject="school" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{n}</div>
                  <div className="t-3" style={{ fontSize: 'var(--fs-xs)' }}>{d}</div>
                </div>
              </div>
              <div className="mock-foot">
                <Chip tone={k === '真考' ? 'school' : 'neutral'} sm>
                  {k}
                </Chip>
                <span className="spacer" />
                <span className="t-3" style={{ fontSize: 'var(--fs-xs)' }}>3 月起排进计划</span>
              </div>
            </Card>
          ))}
        </div>
      </Section>
      <div style={{ height: 16 }} />
    </Page>
  );
}

/* ───────── 笔记 ───────── */
export function NotesProto() {
  return (
    <Page wide>
      <div className="notes">
        <div className="notes-toc">
          <Field value="" onChange={() => {}} placeholder="搜索笔记" icon="search" pill />
          <div className="t-caps" style={{ margin: '18px 10px 6px' }}>弱项优先</div>
          <List>
            {[
              ['physics', '电磁感应', true],
              ['physics', '电容器', false],
              ['physics', '弹簧与简谐运动', false],
              ['chemistry', '無機 · 必背清单', false],
              ['chemistry', '有機 · 合成路线', false],
              ['math', '置換積分', false],
            ].map(([s, n, on]) => (
              <Row key={n as string} lead={<SubjectGlyph subject={s as 'math'} size="sm" />} title={n as string} current={on as boolean} onClick={() => {}} />
            ))}
          </List>
        </div>
        <article className="notes-read glass-read selectable">
          <div className="page-eyebrow">
            <Chip tone="physics" icon="physics" sm>
              物理 · 电磁学
            </Chip>
            <span className="t-3">读完约 6 分钟</span>
          </div>
          <h1 className="page-title" style={{ marginBottom: 18 }}>
            电磁感应 <span className="ja t-3" style={{ fontSize: '0.6em' }}>電磁誘導</span>
          </h1>
          <h3>一张图记住</h3>
          <p>磁通量变化 → 感应电动势 → 感应电流 → 安培力阻碍运动。四步走完，能量守恒自动成立：外力做的功 = 焦耳热。</p>
          <h3>必背</h3>
          <ul>
            <li>
              法拉第定律：<b>V = −N ΔΦ / Δt</b>；导体棒切割：<b>V = vBL</b>
            </li>
            <li>楞次定律：感应电流的磁场总是“阻碍”变化，不是“相反”</li>
            <li>匀速运动的棒：外力 F = B²L²v / R，功率 P = B²L²v² / R</li>
          </ul>
          <div className="callouts">
            <div className="callout" data-tone="warn">
              <div className="callout-head">
                <Icon name="alert" size={14} /> 易错
              </div>
              线圈匝数 N 只乘在电动势上，算磁通量时不乘。
            </div>
            <div className="callout" data-tone="primary">
              <div className="callout-head">
                <Icon name="clock" size={14} /> 30 秒自检
              </div>
              棒的速度翻倍，焦耳热功率变成几倍？（答：4 倍）
            </div>
          </div>
        </article>
      </div>
    </Page>
  );
}

/* ───────── 数据 ───────── */
const HEAT_TOPICS = ['電磁誘導', 'コンデンサー', 'ばね', '単振り子', '無機', '有機流程', '熱化学', '数列', '場合の数', '指数対数', '積分'];
export function InsightsProto() {
  const weeks = 8;
  return (
    <Page title="数据" desc="每张图只回答一个问题。数据少的时候，会给区间而不是一个数。">
      <div className="grid grid-2 enter">
        <Card title="离目标还有多远" sub="预测分区间 · 竖线是目标">
          {[
            ['数学', 'math', 129, 147, 138, 190, 200],
            ['物理', 'physics', 52, 64, 58, 90, 100],
            ['化学', 'chemistry', 60, 72, 66, 90, 100],
          ].map(([n, t, lo, hi, mid, goal, max]) => (
            <div key={n as string} className="range-row">
              <span className="range-name">{n}</span>
              <div className="range-track" data-tone={t as Tone}>
                <span className="range-band" style={{ left: `${((lo as number) / (max as number)) * 100}%`, width: `${(((hi as number) - (lo as number)) / (max as number)) * 100}%` }} />
                <span className="range-mid" style={{ left: `${((mid as number) / (max as number)) * 100}%` }} />
                <span className="range-goal" style={{ left: `${((goal as number) / (max as number)) * 100}%` }} />
              </div>
              <span className="range-val num">
                {mid}
                <span className="t-3"> / {max}</span>
              </span>
            </div>
          ))}
        </Card>
        <Card title="这周复盘" sub="11 月 16 日 – 22 日" actions={<Chip icon="sparkle" tone="primary" sm>助教</Chip>}>
          <div className="grid grid-3" style={{ gap: 10 }}>
            <Stat label="完成" value="2" unit="/ 5 天" />
            <Stat label="时长" value="3.9" unit="小时" />
            <Stat label="新掌握" value="3" unit="个考点" />
          </div>
          <p className="t-2" style={{ marginTop: 14, fontSize: 'var(--fs-sm)', lineHeight: 1.7 }}>
            电容器从 22% 涨到 38%，最大的坑是“断开电源后 Q 不变”。下周把数列的递推放到周一，状态最好的时候做。
          </p>
        </Card>
      </div>
      <Section title="弱项在变亮吗" desc="每格一周，越亮掌握得越好">
        <Card>
          <div className="heat" style={{ gridTemplateColumns: `110px repeat(${weeks}, 1fr)` }}>
            <span />
            {Array.from({ length: weeks }, (_, i) => (
              <span key={i} className="heat-col num">
                W{i + 1}
              </span>
            ))}
            {HEAT_TOPICS.map((t, r) => (
              <div key={t} style={{ display: 'contents' }}>
                <span className="heat-name ja">{t}</span>
                {Array.from({ length: weeks }, (_, c) => {
                  const v = c < 2 ? Math.min(1, 0.15 + ((r * 7 + c * 13) % 10) / 30 + c * 0.08) : -1;
                  return <span key={c} className={`heat-cell${v < 0 ? ' is-empty' : ''}`} style={{ '--v': Math.max(0, v) } as React.CSSProperties} />;
                })}
              </div>
            ))}
          </div>
        </Card>
      </Section>
      <Section title="每天学了多久">
        <Card>
          <div className="bars">
            {[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 118, 112].map((v, i) => (
              <div key={i} className="bars-col">
                <span className="bars-bar" style={{ height: `${(v / 140) * 100}%` }} />
                <span className="bars-x num">{i + 7}</span>
              </div>
            ))}
            <span className="bars-goal" style={{ bottom: `${(120 / 140) * 100}%` }}>
              120
            </span>
          </div>
        </Card>
      </Section>
      <div style={{ height: 16 }} />
    </Page>
  );
}

/* ───────── AI 助教 ───────── */
export function CoachProto() {
  const [v, setV] = useState('');
  return (
    <Aside title={<span className="hstack" style={{ gap: 8 }}><Icon name="sparkle" size={18} /> 助教</span>} actions={<IconButton icon="close" label="收起" size="sm" />}>
      <div className="coach">
        <div className="coach-ctx">
          <SubjectGlyph subject="physics" size="sm" />
          <span>正在看：電磁誘導 第 3 题</span>
        </div>
        <div className="bubble is-me">为什么功率不是 vB²L²/R？</div>
        <div className="bubble">
          那个是<b>外力 F</b>。功率还要再乘一次速度：P = Fv = v²B²L²/R。也可以从电阻那边算：P = I²R，结果一样。
        </div>
        <div className="bubble is-me">给我一道类似的题</div>
        <div className="bubble is-thinking">
          <ThinkRing size={18} /> 在出题，并且另算一遍核对答案…
        </div>
        <div className="coach-suggest">
          {['这题的考点是什么', '我错在哪一步', '再来一道类似的'].map((s) => (
            <button key={s} type="button" className="chip is-button">
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="coach-input">
        <Field value={v} onChange={setV} placeholder="问点什么，回车发送" pill />
        <IconButton icon="send" label="发送" glass />
      </div>
    </Aside>
  );
}

/* ───────── 首次引导 ───────── */
export function OnboardingProto() {
  const [step, setStep] = useState(1);
  return (
    <div className="onb">
      <div className="glass-float onb-card enter">
        <div className="onb-steps">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i <= step ? 'is-on' : ''} />
          ))}
        </div>
        <div className="t-eyebrow">第 2 步 · 共 3 步</div>
        <h1 className="page-title" style={{ marginTop: 6 }}>一周挑哪 5 天学？</h1>
        <p className="page-desc">每天 2 小时。哪天有事，当天挪一下就行，计划会自己顺延。</p>
        <div className="hstack" style={{ gap: 8, marginTop: 26, justifyContent: 'center' }}>
          {['一', '二', '三', '四', '五', '六', '日'].map((d, i) => (
            <button key={d} type="button" className={`daypill is-lg${[0, 1, 3, 4, 5].includes(i) ? ' is-on' : ''}`}>
              {d}
            </button>
          ))}
        </div>
        <div className="onb-minutes">
          <span className="t-2">每天</span>
          <Segmented value="120" onChange={() => {}} options={[{ value: '90', label: '1.5 小时' }, { value: '120', label: '2 小时' }, { value: '150', label: '2.5 小时' }]} />
        </div>
        <div className="hstack" style={{ marginTop: 30 }}>
          <Button variant="ghost" icon="chev-left" onClick={() => setStep(Math.max(0, step - 1))}>
            上一步
          </Button>
          <span className="spacer" />
          <Button variant="primary" size="lg" iconRight="arrow-right" onClick={() => setStep(Math.min(2, step + 1))}>
            下一步
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───────── 设置 ───────── */
export function SettingsProto() {
  const [p, setP] = useState(true);
  const [vol, setVol] = useState(0.3);
  return (
    <Page title="设置">
      <Section title="外观">
        <Card pad={false}>
          <div className="set-row">
            <div className="set-text">
              <b>场景</b>
              <span>跟着季节和时间自动换：冬 → 春 → 初夏，白天和夜晚各一张。</span>
            </div>
            <Segmented value="auto" onChange={() => {}} options={[{ value: 'auto', label: '自动' }, { value: 'fixed', label: '固定' }]} />
          </div>
          <div className="scene-picker">
            {['winter-night', 'winter-day', 'spring-day', 'spring-night', 'summer-day', 'summer-night'].map((k, i) => (
              <button key={k} type="button" className={`scene-thumb${i === 0 ? ' is-on' : ''}`} style={{ backgroundImage: `url(/scenes/${k}.jpg)` }} aria-label={k} />
            ))}
          </div>
          <div className="set-row">
            <div className="set-text">
              <b>天气粒子</b>
              <span>雪、花瓣、萤火。做题时会自动停下。</span>
            </div>
            <Toggle on={p} onChange={setP} label="天气粒子" />
          </div>
          <div className="set-row">
            <div className="set-text">
              <b>背景音乐</b>
              <span>轻钢琴，音量</span>
            </div>
            <div style={{ width: 200 }}>
              <Slider value={vol} onChange={setVol} label="音量" />
            </div>
          </div>
        </Card>
      </Section>
      <Section title="目标">
        <Card pad={false}>
          {[
            ['数学コース2', '190', '/ 200', 'math'],
            ['物理', '90', '/ 100', 'physics'],
            ['化学', '90', '/ 100', 'chemistry'],
          ].map(([n, v, m, t]) => (
            <div key={n} className="set-row">
              <div className="set-text hstack" style={{ gap: 10, flexDirection: 'row' }}>
                <SubjectGlyph subject={t as 'math'} size="sm" />
                <b>{n}</b>
              </div>
              <span className="num" style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>
                {v}
                <span className="t-3" style={{ fontWeight: 400 }}> {m}</span>
              </span>
            </div>
          ))}
        </Card>
      </Section>
      <div style={{ height: 16 }} />
    </Page>
  );
}

export { Orb, Bar, Dot, List, Row };
