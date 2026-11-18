// Hi-fi reference for 今天 (mock data, mock words). The real page follows this composition;
// its words come from copy/zh.ts.
import { useState } from 'react';
import { Aside, Page } from '../shell/Shell.tsx';
import { Bar, Button, Card, Chip, Icon, List, Orb, RoundPlay, Row, Stat, SubjectGlyph, type Subject } from '../ui/ui.tsx';
import './proto.css';

export const MOCK_TASKS: { id: string; subject: Subject; title: string; kind: string; min: number; why: string; status: 'done' | 'now' | 'todo' }[] = [
  { id: 't1', subject: 'physics', title: '電磁誘導 · 导体棒切割磁感线', kind: '新学 + 例题', min: 40, why: '弱项 · 考频高', status: 'now' },
  { id: 't2', subject: 'math', title: '数列 · 递推与求和', kind: '交错练习 8 题', min: 35, why: '弱项', status: 'todo' },
  { id: 't3', subject: 'chemistry', title: '無機 · 沉淀颜色与离子分离', kind: '背诵卡 30 张', min: 15, why: '记忆曲线到期', status: 'todo' },
  { id: 't4', subject: 'math', title: '三角函数 · 合成与最值', kind: '保温 4 题', min: 15, why: '擅长项防遗忘', status: 'todo' },
  { id: 't5', subject: 'physics', title: '错题回炉', kind: '到期 5 题', min: 15, why: '间隔复习', status: 'todo' },
];

export function TodayProto() {
  const total = MOCK_TASKS.reduce((s, t) => s + t.min, 0);
  return (
    <Page
      eyebrow={
        <>
          <Icon name="today" size={14} /> 11 月 19 日 周四 · 第 1 周 · 基础补弱
        </>
      }
      title="今天从电磁感应开始"
      desc="2 小时，五件事。先啃最难的，最后用错题收尾。"
      actions={
        <>
          <Chip icon="flame">连续 3 天</Chip>
          <Chip icon="calendar">本周 2 / 5 天</Chip>
        </>
      }
    >
      <section className="today-hero enter">
        <div className="today-orb">
          <Orb size={196} ticks={120} lit={0} now={0} value="213" unit="天后 EJU" />
        </div>
        <div className="today-script">
          <div className="t-caps" style={{ marginBottom: 14 }}>今天的安排 · {total} 分钟</div>
          <ol className="script">
            {MOCK_TASKS.slice(0, 4).map((t, i) => (
              <li key={t.id} className={`script-line${i === 0 ? ' is-now' : ''}`} style={{ '--i': i } as React.CSSProperties}>
                <span className="script-time num">{['0:00', '0:40', '1:15', '1:30'][i]}</span>
                <span className="script-text">
                  {t.title}
                  <span className="script-kind">{t.kind}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="hstack" style={{ marginTop: 22, gap: 10 }}>
            <Button variant="primary" size="lg" icon="play" kbd="Space">
              开始今天的 2 小时
            </Button>
            <Button variant="ghost" icon="refresh">
              换个顺序
            </Button>
          </div>
        </div>
      </section>

      <Card className="coach-line enter-2" pad={false}>
        <span className="coach-line-icon">
          <Icon name="sparkle" size={18} />
        </span>
        <p className="coach-line-text">
          昨天的 <b>コンデンサー</b> 你 6 题错了 3 题，都是“断开电源后 Q 不变”这一步。今天的电磁感应例题第 2 题会再碰到它。
        </p>
        <Button variant="ghost" size="sm" iconRight="arrow-right">
          问助教
        </Button>
      </Card>

      <div className="grid grid-3 enter-3" style={{ marginTop: 14 }}>
        <Card>
          <Stat label="预测分 · 数学" value="138" unit="/ 200" sub="区间 129–147 · 目标 190" icon="math" />
          <div style={{ marginTop: 12 }}>
            <Bar value={138} max={200} mark={190} tone="math" />
          </div>
        </Card>
        <Card>
          <Stat label="预测分 · 理科" value="124" unit="/ 200" sub="物理 58 · 化学 66 · 目标 180" icon="layers" />
          <div style={{ marginTop: 12 }}>
            <Bar value={124} max={200} mark={180} tone="physics" />
          </div>
        </Card>
        <Card>
          <Stat label="本周" value="2" unit="/ 5 天" sub="已学 3 小时 52 分" icon="calendar" />
          <WeekDots />
        </Card>
      </div>
    </Page>
  );
}

function WeekDots() {
  const days = ['一', '二', '三', '四', '五', '六', '日'];
  const state = ['done', 'done', 'rest', 'today', 'plan', 'plan', 'rest'];
  return (
    <div className="week-dots">
      {days.map((d, i) => (
        <span key={d} className={`week-dot is-${state[i]}`}>
          <span className="week-dot-pip" />
          {d}
        </span>
      ))}
    </div>
  );
}

export function TodayAsideProto() {
  const [playing, setPlaying] = useState(false);
  return (
    <Aside
      title="今日队列"
      actions={<RoundPlay label="开始" primary playing={playing} onClick={() => setPlaying(!playing)} size={40} />}
    >
      <div className="queue-hero">
        <div className="queue-hero-art">
          <SubjectGlyph subject="physics" size="lg" />
        </div>
        <div className="queue-hero-title">電磁誘導</div>
        <div className="queue-hero-sub">导体棒切割磁感线 · 40 分钟</div>
      </div>
      <List>
        {MOCK_TASKS.map((t, i) => (
          <Row
            key={t.id}
            index={i + 1}
            title={t.title}
            meta={[t.kind, `${t.min} 分钟`]}
            current={t.status === 'now'}
            trail={t.status === 'now' ? <Icon name="bolt" size={15} /> : <span className="num">{t.min}′</span>}
            onClick={() => {}}
          />
        ))}
      </List>
    </Aside>
  );
}
