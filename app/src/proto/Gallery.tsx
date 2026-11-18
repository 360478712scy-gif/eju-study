// Component gallery: every primitive on glass, both tones. Reference for page work (#/proto/gallery).
import { useState } from 'react';
import { Page } from '../shell/Shell.tsx';
import {
  Badge,
  Bar,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Icon,
  IconButton,
  Kbd,
  List,
  MasteryTile,
  Modal,
  Orb,
  Ring,
  RoundPlay,
  Row,
  Section,
  Segmented,
  Skeleton,
  Slider,
  Spinner,
  Stat,
  SubjectGlyph,
  Tabs,
  ThinkRing,
  Toggle,
  toast,
} from '../ui/ui.tsx';
import { ICON_NAMES } from '../ui/icons.tsx';

export function Gallery() {
  const [seg, setSeg] = useState<'math' | 'physics' | 'chemistry'>('physics');
  const [tab, setTab] = useState<'topic' | 'paper' | 'school'>('topic');
  const [tog, setTog] = useState(true);
  const [vol, setVol] = useState(0.4);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  return (
    <Page title="组件陈列" desc="3.0 的全部基础组件。页面只组合它们，不重写样式。">
      <Section title="按钮">
        <div className="hstack" style={{ flexWrap: 'wrap', gap: 10 }}>
          <Button variant="primary" size="lg" icon="play" kbd="Space">
            开始今天的 2 小时
          </Button>
          <Button variant="primary">主要</Button>
          <Button>玻璃</Button>
          <Button variant="ghost" icon="refresh">
            幽灵
          </Button>
          <Button variant="danger" icon="trash">
            删除
          </Button>
          <Button size="sm" icon="plus">
            小号
          </Button>
          <Button loading>加载中</Button>
          <IconButton icon="coach" label="助教" glass />
          <IconButton icon="music" label="音乐" on />
          <RoundPlay label="播放" />
          <RoundPlay label="播放" primary />
          <RoundPlay label="暂停" playing size={40} />
        </div>
      </Section>

      <Section title="分段 · 标签页 · 标签">
        <div className="vstack" style={{ '--gap': '16px' } as React.CSSProperties}>
          <Segmented
            size="lg"
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'math', label: '数学', icon: 'math' },
              { value: 'physics', label: '物理', icon: 'physics' },
              { value: 'chemistry', label: '化学', icon: 'chemistry' },
            ]}
          />
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'topic', label: '按考点', count: 38 },
              { value: 'paper', label: '按真题卷', count: 14 },
              { value: 'school', label: '校内考', count: 6 },
            ]}
          />
          <div className="hstack" style={{ flexWrap: 'wrap' }}>
            <Chip>普通</Chip>
            <Chip tone="math" icon="math">
              数学
            </Chip>
            <Chip tone="physics" icon="physics">
              物理
            </Chip>
            <Chip tone="chemistry" icon="chemistry">
              化学
            </Chip>
            <Chip tone="school" icon="school">
              明治
            </Chip>
            <Chip tone="ok" icon="check">
              答对
            </Chip>
            <Chip tone="warn" icon="history">
              到期
            </Chip>
            <Chip tone="bad">答错</Chip>
            <Chip sm>小号</Chip>
            <Chip onClick={() => {}} selected>
              可选中
            </Chip>
            <Badge>12</Badge>
            <Badge tone="warn">5</Badge>
            <Kbd>⌘K</Kbd>
          </div>
        </div>
      </Section>

      <Section title="数值 · 进度">
        <div className="grid grid-4">
          <Card>
            <Stat label="预测分" value="138" unit="/ 200" sub="区间 129–147" icon="target" />
            <div style={{ marginTop: 12 }}>
              <Bar value={138} max={200} mark={190} />
            </div>
          </Card>
          <Card>
            <Stat label="正确率" value="72" unit="%" sub="近 50 题" icon="check" />
            <div style={{ marginTop: 12 }}>
              <Bar value={0.72} tone="ok" />
            </div>
          </Card>
          <Card style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Ring value={0.64} size={56} stroke={5} tone="physics">
              <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>64%</span>
            </Ring>
            <Stat label="電磁誘導" value="64" unit="%" sub="掌握度" />
          </Card>
          <Card style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ThinkRing />
            <Spinner />
            <div style={{ flex: 1 }}>
              <Skeleton h={12} />
              <div style={{ height: 8 }} />
              <Skeleton h={12} w="60%" />
            </div>
          </Card>
        </div>
      </Section>

      <Section title="光球">
        <div className="hstack" style={{ gap: 30, flexWrap: 'wrap' }}>
          <Orb size={170} ticks={120} lit={46} now={46} value="1:14" unit="还剩" />
          <Orb size={120} ticks={60} lit={60} value="✓" unit="今天完成" />
        </div>
      </Section>

      <Section title="列表">
        <Card pad={false} style={{ padding: 6 }}>
          <List>
            <Row index={1} lead={<SubjectGlyph subject="physics" />} title="電磁誘導 · 导体棒切割磁感线" meta={['新学 + 例题', '40 分钟']} current trail={<Button variant="primary" size="sm">继续</Button>} onClick={() => {}} />
            <Row index={2} lead={<SubjectGlyph subject="math" />} title="数列 · 递推与求和" meta={['交错练习 8 题', '35 分钟']} hover={<Button size="sm" variant="ghost">开始</Button>} chevron onClick={() => {}} />
            <Row index={3} lead={<SubjectGlyph subject="chemistry" />} title="無機 · 沉淀颜色" meta={['背诵卡 30 张']} done trail={<Icon name="check" size={16} />} />
          </List>
        </Card>
      </Section>

      <Section title="掌握度砖">
        <div className="grid grid-4">
          <MasteryTile name="電磁誘導" ja="電磁誘導" mastery={0.32} tone="physics" weak foot={<>12 题 · 32%</>} />
          <MasteryTile name="电容器" ja="コンデンサー" mastery={0.45} tone="physics" weak foot={<>9 题 · 45%</>} selected />
          <MasteryTile name="直流电路" ja="電流と回路" mastery={0.86} tone="physics" foot={<>24 题 · 86%</>} />
          <MasteryTile name="运动学" ja="運動の表し方" mastery={0.9} tone="physics" foot={<>18 题 · 90%</>} />
        </div>
      </Section>

      <Section title="表单">
        <div className="grid grid-3">
          <Field value={q} onChange={setQ} placeholder="搜索题目、考点、笔记" icon="search" kbd="⌘K" pill />
          <div className="hstack" style={{ gap: 12 }}>
            <Toggle on={tog} onChange={setTog} label="天气粒子" /> 天气粒子
          </div>
          <div className="hstack" style={{ gap: 12 }}>
            <Icon name="volume" /> <Slider value={vol} onChange={setVol} label="音量" />
          </div>
        </div>
      </Section>

      <Section title="浮层">
        <div className="hstack">
          <Button onClick={() => setModal(true)}>打开弹窗</Button>
          <Button onClick={() => toast('已把这题移出错题本', 'ok')}>提示</Button>
        </div>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="把今天挪到明天？"
          closeLabel="关闭"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModal(false)}>
                再想想
              </Button>
              <Button variant="primary" onClick={() => setModal(false)} data-autofocus>
                挪到明天
              </Button>
            </>
          }
        >
          今天的 5 件事会整体挪到周五，后面的安排顺延，不会丢。
        </Modal>
      </Section>

      <Section title="空状态">
        <Card>
          <Empty icon="review" title="现在没有要复习的" desc="今天的错题都清掉了。明天会有 6 题到期。" action={<Button size="sm">去练习</Button>} />
        </Card>
      </Section>

      <Section title={`图标 · ${ICON_NAMES.length}`}>
        <div className="gal-icons">
          {ICON_NAMES.map((n) => (
            <div key={n} className="gal-icon">
              <Icon name={n} size={22} />
              {n}
            </div>
          ))}
        </div>
      </Section>
      <div style={{ height: 24 }} />
    </Page>
  );
}
