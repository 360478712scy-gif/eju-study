// Hi-fi reference for 练习 (mastery map + topic detail aside) and 复习 (flash card + queue).
import { useEffect, useState } from 'react';
import { Aside, Page } from '../shell/Shell.tsx';
import { Button, Card, Chip, Field, Icon, List, MasteryTile, Ring, Row, Section, Segmented, Stat, SubjectGlyph, Tabs, Bar } from '../ui/ui.tsx';

const UNITS = [
  {
    name: '力学',
    topics: [
      ['运动学·抛体', '運動の表し方', 0.9, false],
      ['受力·运动方程', '力と運動', 0.78, false],
      ['刚体·力矩', '剛体のつり合い', 0.62, false],
      ['功与能量', '仕事とエネルギー', 0.7, false],
      ['动量·碰撞', '運動量', 0.66, false],
      ['弹簧·简谐运动', 'ばね・単振動', 0.34, true],
      ['单摆', '単振り子', 0.3, true],
      ['万有引力', '万有引力', 0.58, false],
    ],
  },
  {
    name: '电磁学',
    topics: [
      ['电场·电势', '電場と電位', 0.55, false],
      ['电容器', 'コンデンサー', 0.38, true],
      ['直流电路', '電流と回路', 0.88, false],
      ['电流与磁场', '電流と磁場', 0.52, false],
      ['电磁感应', '電磁誘導', 0.32, true],
      ['交流', '交流', 0.4, false],
    ],
  },
] as const;

export function PracticeProto() {
  const [subj, setSubj] = useState<'math' | 'physics' | 'chemistry'>('physics');
  const [tab, setTab] = useState<'topic' | 'paper' | 'school'>('topic');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState('电磁感应');
  return (
    <Page
      title="练习"
      desc="想自己挑题时来这里。亮的是掌握了的，带小点的是弱项。"
      actions={<Field value={q} onChange={setQ} placeholder="搜索题目、考点" icon="search" kbd="⌘K" pill style={{ width: 260 }} />}
    >
      <div className="hstack" style={{ gap: 16, marginBottom: 6, flexWrap: 'wrap' }}>
        <Segmented
          size="lg"
          value={subj}
          onChange={setSubj}
          options={[
            { value: 'math', label: '数学', icon: 'math' },
            { value: 'physics', label: '物理', icon: 'physics' },
            { value: 'chemistry', label: '化学', icon: 'chemistry' },
          ]}
        />
        <span className="spacer" />
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'topic', label: '按考点' },
            { value: 'paper', label: '按真题卷', count: 14 },
            { value: 'school', label: '校内考', count: 6 },
          ]}
        />
      </div>
      {UNITS.map((u) => (
        <Section key={u.name} title={u.name} desc={`${u.topics.length} 个考点`}>
          <div className="grid grid-4">
            {u.topics.map(([n, ja, m, weak]) => (
              <MasteryTile
                key={n}
                name={n}
                ja={ja}
                mastery={m}
                tone="physics"
                weak={weak}
                selected={sel === n}
                onClick={() => setSel(n)}
                foot={
                  <>
                    <span className="num">{Math.round(m * 100)}%</span>
                    <span>·</span>
                    <span className="num">{Math.round(m * 30)} 题</span>
                  </>
                }
              />
            ))}
          </div>
        </Section>
      ))}
      <div style={{ height: 16 }} />
    </Page>
  );
}

export function PracticeAsideProto() {
  return (
    <Aside title="考点" actions={<Chip tone="warn" sm>弱项</Chip>}>
      <div style={{ padding: '4px 10px 0' }}>
        <div className="hstack" style={{ gap: 14 }}>
          <Ring value={0.32} size={64} stroke={5} tone="physics">
            <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>32%</span>
          </Ring>
          <div>
            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>电磁感应</div>
            <div className="t-3 ja" style={{ fontSize: 'var(--fs-sm)' }}>電磁誘導</div>
          </div>
        </div>
        <div className="grid grid-2" style={{ marginTop: 18, gap: 10 }}>
          <Card pad={false} style={{ padding: 12 }}>
            <Stat label="做过" value="9" unit="/ 41 题" />
          </Card>
          <Card pad={false} style={{ padding: 12 }}>
            <Stat label="平均用时" value="3:40" sub="目标 2:30" />
          </Card>
        </div>
        <div className="t-eyebrow" style={{ margin: '18px 0 8px' }}>最近 10 次</div>
        <div className="hstack" style={{ gap: 5 }}>
          {[1, 0, 1, 0, 0, 1, 1, 0, 1, 1].map((r, i) => (
            <span key={i} className="pip" data-tone={r ? 'ok' : 'bad'} />
          ))}
        </div>
        <div className="t-eyebrow" style={{ margin: '18px 0 8px' }}>难度梯度</div>
        {[
          ['入门', 1, 6],
          ['EJU 标准', 0.4, 8],
          ['拔高 · 校内考', 0, 6],
        ].map(([l, v, n]) => (
          <div key={l as string} style={{ marginBottom: 10 }}>
            <div className="hstack" style={{ fontSize: 'var(--fs-xs)', marginBottom: 5 }}>
              <span className="t-2">{l}</span>
              <span className="spacer" />
              <span className="t-3 num">{n} 题</span>
            </div>
            <Bar value={v as number} tone="physics" thin />
          </div>
        ))}
        <div className="vstack" style={{ marginTop: 20, '--gap': '8px' } as React.CSSProperties}>
          <Button variant="primary" block icon="play">
            练 10 题 · 约 25 分钟
          </Button>
          <Button block icon="notes">
            先看笔记
          </Button>
        </div>
      </div>
    </Aside>
  );
}

const CARD = {
  q: 'Fe³⁺ 溶液中加入 KSCN，颜色变成？',
  a: '血红色',
  more: 'Fe³⁺ + SCN⁻ → [Fe(SCN)]²⁺。用来检验 Fe³⁺；Fe²⁺ 不变色。',
};

export function ReviewProto() {
  const [flip, setFlip] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setFlip((f) => !f);
      }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  return (
    <Page title="复习" desc="到期的都在这一个队列里。做完就清空，明天的会自己来。">
      <div className="grid grid-3 enter">
        <Card>
          <Stat label="到期错题" value="12" icon="history" sub="最早的已过 2 天" />
        </Card>
        <Card>
          <Stat label="易错点" value="5" icon="alert" sub="来自最近的错题" />
        </Card>
        <Card>
          <Stat label="背诵卡" value="30" icon="cards" sub="無機 22 · 有機 8" />
        </Card>
      </div>

      <Section title="背诵卡" desc="空格翻面，1 / 2 / 3 自评">
        <div className={`flash${flip ? ' is-flipped' : ''}`} onClick={() => setFlip(!flip)}>
          <div className="flash-inner">
            <div className="flash-face glass-read">
              <Chip tone="chemistry" icon="chemistry" sm>
                無機 · 离子检验
              </Chip>
              <div className="flash-q">{CARD.q}</div>
              <div className="flash-hint t-3">
                <Icon name="eye" size={14} /> 想好了再翻
              </div>
            </div>
            <div className="flash-face flash-back glass-read">
              <Chip tone="chemistry" icon="chemistry" sm>
                無機 · 离子检验
              </Chip>
              <div className="flash-a">{CARD.a}</div>
              <div className="flash-more">{CARD.more}</div>
            </div>
          </div>
        </div>
        <div className="hstack" style={{ justifyContent: 'center', gap: 10, marginTop: 16, opacity: flip ? 1 : 0.35, transition: 'opacity 200ms' }}>
          <Button kbd="1">忘了</Button>
          <Button kbd="2">有点模糊</Button>
          <Button variant="primary" kbd="3">记得</Button>
        </div>
      </Section>

      <Section title="接下来" actions={<Button variant="primary" icon="play">开始复习 · 约 25 分钟</Button>}>
        <Card pad={false} style={{ padding: 6 }}>
          <List>
            <Row lead={<SubjectGlyph subject="physics" />} title="2018 第 1 回 物理 問 14 · コンデンサー" meta={['错过 2 次', '到期 2 天']} trail={<Chip tone="warn" sm>到期</Chip>} onClick={() => {}} />
            <Row lead={<SubjectGlyph subject="math" />} title="原创 · 数列 · 递推 a(n+1) = 2a(n) + 3" meta={['没把握', '今天到期']} trail={<Chip tone="warn" sm>到期</Chip>} onClick={() => {}} />
            <Row lead={<SubjectGlyph subject="chemistry" />} title="易错点 · 熱化学：ΔH 的符号" meta={['来自 3 道错题']} chevron onClick={() => {}} />
          </List>
        </Card>
      </Section>
      <div style={{ height: 16 }} />
    </Page>
  );
}
