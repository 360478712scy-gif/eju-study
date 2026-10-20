// 错题本: today's due re-tests first, the rest collapsed by due date; plus slow-but-correct and starred items.
import { useMemo, useState } from 'react';
import type { Attempt, Item, ItemProgress, Subject } from '@shared/types.ts';
import { isDue, MISTAKE_GRADUATE_BOX, SLOW_FACTOR } from '@shared/srs.ts';
import { planSeconds } from '@shared/planner.ts';
import { useReady } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { cx, fmtClock, fmtMinutes, SUBJECT_NAME } from '../../lib/format.ts';
import { Button, Dot, Empty, IconButton, IconTile, Legend, List, ListRow, Meta, Modal, PageHeader, Segmented, StatTile, SubjectDot, Tabs, Tooltip } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import { ItemPreview } from './ItemPreview.tsx';
import { ItemMark } from './bits.tsx';
import { SUBJECT_ORDER, dueInfo, launch, sourceLabel, stemSnippet } from './helpers.ts';
import './mistakes.css';

type Tab = 'mistakes' | 'slow' | 'starred';
type SubjectFilter = 'all' | Subject;
type SortKey = 'due' | 'recent' | 'often' | 'slowest';
/** Which list a group sits in: today's due re-tests, the collapsed rest, or a whole tab. */
type Part = 'due' | 'rest' | 'all';

interface Row {
  item: Item;
  p: ItemProgress;
  last?: Attempt;
  due: boolean;
  /** Last time ÷ exam pace. */
  ratio: number;
}

interface TopicGroup {
  topic: string;
  subject: Subject;
  name: string;
  unitName: string;
  rows: Row[];
}

const SORTS: { value: SortKey; label: string; tabs: Tab[] }[] = [
  { value: 'slowest', label: '最慢优先', tabs: ['slow'] },
  { value: 'due', label: '到期优先', tabs: ['mistakes', 'starred'] },
  { value: 'recent', label: '最近做过', tabs: ['mistakes', 'slow', 'starred'] },
  { value: 'often', label: '错得最多', tabs: ['mistakes', 'starred'] },
];

const RULES = '做错或标了“猜的”的题会自动收进来：2 天后再练一次，答对再隔 4 天；间隔答对 2 次（选“确定”）就移出错题本。';

function compareRows(sort: SortKey) {
  return (a: Row, b: Row) => {
    if (sort === 'due') return (a.p.due || '9999').localeCompare(b.p.due || '9999') || a.p.box - b.p.box || a.item.id.localeCompare(b.item.id);
    if (sort === 'recent') return b.p.lastAt.localeCompare(a.p.lastAt) || a.item.id.localeCompare(b.item.id);
    if (sort === 'slowest') return b.ratio - a.ratio || a.item.id.localeCompare(b.item.id);
    return b.p.attempts - b.p.correct - (a.p.attempts - a.p.correct) || a.p.box - b.p.box || a.item.id.localeCompare(b.item.id);
  };
}

/** Subject order first, then topics by the chosen sort (their first row), rows sorted inside. */
function groupRows(rows: Row[], sort: SortKey, topicInfo: (id: string) => { name: string; unitName: string }): TopicGroup[] {
  const cmp = compareRows(sort);
  const byTopic = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byTopic.get(r.item.topic);
    if (list) list.push(r);
    else byTopic.set(r.item.topic, [r]);
  }
  const groups: TopicGroup[] = [...byTopic.entries()].map(([topic, list]) => {
    list.sort(cmp);
    return { topic, subject: list[0].item.subject, ...topicInfo(topic), rows: list };
  });
  return groups.sort((a, b) => SUBJECT_ORDER.indexOf(a.subject) - SUBJECT_ORDER.indexOf(b.subject) || cmp(a.rows[0], b.rows[0]) || b.rows.length - a.rows.length);
}

export function MistakesPage() {
  const { state, bank, today } = useReady();
  const [tab, setTab] = useState<Tab>('mistakes');
  const [subject, setSubject] = useState<SubjectFilter>('all');
  const [sort, setSort] = useState<SortKey>('due');
  const [selected, setSelected] = useState<string | null>(null);
  const [timedOpen, setTimedOpen] = useState(false);
  // null = default (the rest opens by itself only when nothing is due today).
  const [restOpen, setRestOpen] = useState<boolean | null>(null);
  // Topic groups whose open/closed state differs from their default.
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());

  const lastById = useMemo(() => {
    const m = new Map<string, Attempt>();
    for (const a of state.attempts) m.set(a.itemId, a);
    return m;
  }, [state.attempts]);

  const all = useMemo(() => {
    const mistakes: Row[] = [];
    const slow: Row[] = [];
    const starred: Row[] = [];
    let graduated = 0;
    for (const [id, p] of Object.entries(state.progress)) {
      const item = bank.byId.get(id);
      if (!item) continue;
      const last = lastById.get(id);
      const row: Row = { item, p, last, due: isDue(p, today), ratio: last && item.targetSec ? last.seconds / item.targetSec : 0 };
      if (p.inMistakes) mistakes.push(row);
      else if (p.box >= MISTAKE_GRADUATE_BOX) graduated += 1;
      if (p.slow && p.lastCorrect) slow.push(row);
      if (p.starred) starred.push(row);
    }
    return { mistakes, slow, starred, graduated };
  }, [state.progress, bank, lastById, today]);

  const dueRows = useMemo(() => all.mistakes.filter((r) => r.due).sort(compareRows('due')), [all.mistakes]);
  const source = tab === 'mistakes' ? all.mistakes : tab === 'slow' ? all.slow : all.starred;
  const sortKey: SortKey = SORTS.find((x) => x.value === sort)?.tabs.includes(tab) ? sort : tab === 'slow' ? 'slowest' : 'due';

  const subjectCounts = useMemo(() => {
    const c: Record<SubjectFilter, number> = { all: source.length, math: 0, physics: 0, chemistry: 0, japanese: 0 };
    for (const r of source) c[r.item.subject] += 1;
    return c;
  }, [source]);

  const filtered = useMemo(() => source.filter((r) => subject === 'all' || r.item.subject === subject), [source, subject]);

  const topicInfo = useMemo(() => {
    return (id: string) => {
      const info = bank.topics.get(id);
      return { name: info?.name || id, unitName: info?.unitName || '' };
    };
  }, [bank]);

  // The mistakes tab splits into today's due re-tests and the rest; the other tabs are one list.
  const parts = useMemo(() => {
    if (tab !== 'mistakes') return { due: [] as TopicGroup[], rest: [] as TopicGroup[], all: groupRows(filtered, sortKey, topicInfo), dueCount: 0, restCount: 0 };
    const dueList = filtered.filter((r) => r.due);
    const restList = filtered.filter((r) => !r.due);
    return {
      due: groupRows(dueList, sortKey, topicInfo),
      rest: groupRows(restList, sortKey, topicInfo),
      all: [] as TopicGroup[],
      dueCount: dueList.length,
      restCount: restList.length,
    };
  }, [tab, filtered, sortKey, topicInfo]);

  const restIsOpen = restOpen ?? parts.dueCount === 0;
  const orderedIds = useMemo(
    () => [...parts.due, ...parts.rest, ...parts.all].flatMap((g) => g.rows.map((r) => r.item.id)),
    [parts],
  );

  const isOpen = (part: Part, topic: string) => {
    const key = `${part}:${topic}`;
    const byDefault = part !== 'rest';
    return flipped.has(key) ? !byDefault : byDefault;
  };
  const toggle = (part: Part, topic: string) =>
    setFlipped((s) => {
      const key = `${part}:${topic}`;
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Nothing in any tab yet: one card that explains the book and points to today's tasks.
  if (!all.mistakes.length && !all.slow.length && !all.starred.length) {
    return (
      <div className="page mb-page">
        <PageHeader title="错题本" desc="不用自己抄错题，做错的题会自动回来找你。" info={RULES} />
        <FirstRun graduated={all.graduated} />
      </div>
    );
  }

  const sorts = SORTS.filter((s) => s.tabs.includes(tab));
  const empty = filtered.length === 0;
  const groupProps = { today, onOpen: setSelected, isOpen, toggle };

  return (
    <div className="page mb-page">
      <PageHeader title="错题本" desc="到期的错题先做，间隔答对 2 次就移出。" info={RULES} />

      {all.mistakes.length > 0 && <DueHero dueRows={dueRows} total={all.mistakes} graduated={all.graduated} today={today} onTimed={() => setTimedOpen(true)} />}

      <Tabs<Tab>
        className="mb-tabs"
        value={tab}
        onChange={(v) => {
          setTab(v);
          setSelected(null);
          setRestOpen(null);
        }}
        options={[
          { value: 'mistakes', label: '错题', count: all.mistakes.length },
          { value: 'slow', label: '做对但太慢', count: all.slow.length },
          { value: 'starred', label: '收藏', count: all.starred.length },
        ]}
      />

      {source.length > 0 && (
        <div className="mb-filters">
          <Segmented<SubjectFilter>
            size="sm"
            value={subject}
            onChange={setSubject}
            options={(['all', ...SUBJECT_ORDER] as SubjectFilter[])
              .filter((s) => s === 'all' || s === subject || subjectCounts[s] > 0)
              .map((s) => ({
                value: s,
                label:
                  s === 'all' ? (
                    '全部'
                  ) : (
                    <span className="mb-seg">
                      <SubjectDot subject={s} />
                      {SUBJECT_NAME[s]}
                    </span>
                  ),
                count: subjectCounts[s],
              }))}
          />
          {sorts.length > 1 && (
            <label className="btn btn-ghost btn-sm mb-sort">
              <Icon name="sort" size={15} />
              <span>{sorts.find((s) => s.value === sortKey)?.label}</span>
              <Icon name="down" size={14} />
              <select value={sortKey} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="排序">
                {sorts.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {empty ? (
        <div className="card mb-empty-card">
          <EmptyState tab={tab} all={all} onClear={() => setSubject('all')} />
        </div>
      ) : tab === 'mistakes' ? (
        <div className="mb-parts">
          {parts.dueCount > 0 && (
            <section className="mb-part">
              <h2 className="mb-part-title">
                今天到期
                <span className="num">{parts.dueCount}</span>
              </h2>
              <GroupCard part="due" groups={parts.due} {...groupProps} />
            </section>
          )}
          {parts.restCount > 0 && (
            <section className="mb-part">
              <button type="button" className={cx('mb-rest-toggle', restIsOpen && 'is-open')} aria-expanded={restIsOpen} onClick={() => setRestOpen(!restIsOpen)}>
                <span className="mb-part-title">
                  {parts.dueCount > 0 ? '其余' : '还没到期'}
                  <span className="num">{parts.restCount}</span>
                </span>
                <span className="mb-rest-hint">{sortKey === 'due' ? '按到期日' : sorts.find((s) => s.value === sortKey)?.label}</span>
                <Icon name="down" size={16} className="mb-chev" />
              </button>
              {restIsOpen && <GroupCard part="rest" groups={parts.rest} {...groupProps} />}
            </section>
          )}
        </div>
      ) : (
        <div className="mb-parts">
          {tab === 'slow' && <SlowNote rows={filtered} />}
          <GroupCard part="all" groups={parts.all} slow={tab === 'slow'} {...groupProps} />
        </div>
      )}

      <ItemPreview itemId={selected} ids={orderedIds} onSelect={setSelected} />
      <TimedModal open={timedOpen} onClose={() => setTimedOpen(false)} rows={all.mistakes} />
    </div>
  );
}

function EmptyState({ tab, all, onClear }: { tab: Tab; all: { mistakes: Row[]; slow: Row[]; starred: Row[]; graduated: number }; onClear: () => void }) {
  if (tab === 'slow') {
    return all.slow.length === 0 ? (
      <Empty icon="clock" title="没有做对但太慢的题" desc={`做对了、但用时超过考场节奏 ${SLOW_FACTOR} 倍的题会出现在这里，冲刺计划会隔两天再排它们。`} />
    ) : (
      <Empty icon="search" title="这个科目没有太慢的题" action={<Button onClick={onClear}>看全部科目</Button>} />
    );
  }
  if (tab === 'starred') {
    return all.starred.length === 0 ? (
      <Empty icon="star" title="还没有收藏的题" desc="遇到经典题、想考前再看一眼的题，在题目或解析里点「收藏」，它就会出现在这里。" />
    ) : (
      <Empty icon="search" title="这个科目没有收藏" action={<Button onClick={onClear}>看全部收藏</Button>} />
    );
  }
  if (all.mistakes.length === 0) {
    return (
      <Empty
        icon="checkCircle"
        title={all.graduated ? '错题都清完了' : '错题本是空的'}
        desc={all.graduated ? `已经有 ${all.graduated} 道题间隔答对 2 次，移出了错题本。新做错的题会自动收进来。` : '做错或猜的题会自动收进来，2 天后回来找你。'}
        action={<TodayButton />}
      />
    );
  }
  return <Empty icon="search" title="这个科目没有错题" action={<Button onClick={onClear}>看全部科目</Button>} />;
}

// ───────────────────────── Hero ─────────────────────────

function DueHero({ dueRows, total, graduated, today, onTimed }: { dueRows: Row[]; total: Row[]; graduated: number; today: string; onTimed: () => void }) {
  const n = dueRows.length;
  const minutes = Math.round(dueRows.reduce((s, r) => s + planSeconds(r.item, 'review'), 0) / 60);
  const bySubject = SUBJECT_ORDER.map((s) => ({ s, n: dueRows.filter((r) => r.item.subject === s).length })).filter((x) => x.n > 0);
  // Out of the book (two spaced confident answers), correct once, new mistakes.
  const once = total.filter((r) => r.p.box >= 1).length;
  const fresh = total.length - once;
  const nextDue = useMemo(() => {
    const later = total
      .filter((r) => !r.due && r.p.due)
      .map((r) => r.p.due!)
      .sort();
    if (!later.length) return null;
    const d = later[0];
    return { info: dueInfo(d, today), count: later.filter((x) => x === d).length };
  }, [total, today]);

  return (
    <section className={cx('card card-hero mb-hero', n === 0 && 'is-clear')}>
      <div className="mb-hero-main">
        <div className="mb-hero-count">
          <span className="num num-2xl">{n}</span>
          <span className="num-unit">题</span>
        </div>
        <div className="mb-hero-text">
          <h2 className="mb-hero-title">{n > 0 ? '今天到期要重做' : '今天的错题都清完了'}</h2>
          {n > 0 ? (
            <Meta className="mb-hero-sub">
              <span>预计 {fmtMinutes(minutes)}</span>
              {bySubject.map((x) => (
                <span key={x.s} className="mb-hero-subj">
                  <SubjectDot subject={x.s} />
                  {SUBJECT_NAME[x.s]} <span className="num">{x.n}</span>
                </span>
              ))}
            </Meta>
          ) : (
            <p className="mb-hero-sub">{nextDue?.info ? `下一批在${nextDue.info.text === '明天' ? '明天' : ` ${nextDue.info.text}`}，共 ${nextDue.count} 题。` : '新做错的题 2 天后会回来找你。'}</p>
          )}
        </div>
      </div>

      <div className="mb-hero-actions">
        {n > 0 ? (
          <Button variant="primary" size="lg" icon="refresh" onClick={() => launch({ kind: 'review', title: '今日到期错题', items: dueRows.map((r) => r.item) })}>
            重做今天到期的 {n} 题
          </Button>
        ) : (
          <TodayButton size="lg" />
        )}
        <Button variant="ghost" icon="timer" onClick={onTimed}>
          全部错题限时重练
        </Button>
      </div>

      <div className="mb-ladder" aria-label="攻克进度">
        <div className="mb-ladder-head">
          <span className="t-eyebrow">攻克进度</span>
          <span className="mb-ladder-left">
            还剩 <b className="num">{total.length}</b> 题
          </span>
        </div>
        <div className="mb-ladder-bar">
          {[
            { c: graduated, cls: 'is-out', label: '已移出' },
            { c: once, cls: 'is-once', label: '间隔答对 1 次' },
            { c: fresh, cls: 'is-new', label: '新错题' },
          ].map((seg) =>
            seg.c > 0 ? (
              <Tooltip key={seg.cls} label={`${seg.label} ${seg.c} 题`}>
                <span className={cx('mb-ladder-seg', seg.cls)} style={{ flexGrow: seg.c }} />
              </Tooltip>
            ) : null,
          )}
        </div>
        <Legend
          className="mb-ladder-legend"
          items={[
            { label: '已移出', tone: 'success', value: graduated },
            { label: '对 1 次', tone: 'warning', value: once },
            { label: '新错题', color: 'var(--border-strong)', value: fresh },
          ]}
        />
      </div>
    </section>
  );
}

function TodayButton({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <Button variant="primary" size={size} iconRight="arrowRight" onClick={() => navigate('/')}>
      去做今天的任务
    </Button>
  );
}

const FIRST_STEPS: { when: string; what: string }[] = [
  { when: '做错或猜的', what: '自动收进来' },
  { when: '2 天后', what: '再练一次' },
  { when: '再隔 4 天', what: '再练一次' },
  { when: '间隔答对 2 次', what: '选“确定”就移出' },
];

/** First visit: what the book does, in four steps, and the one thing to do now. */
function FirstRun({ graduated }: { graduated: number }) {
  return (
    <section className="card card-hero mb-first">
      <IconTile icon={graduated ? 'checkCircle' : 'notebook'} tone={graduated ? 'success' : 'neutral'} size="lg" />
      <h2 className="mb-first-title">{graduated ? '错题都清完了' : '错题本还是空的'}</h2>
      <p className="mb-first-desc">
        {graduated ? `已经有 ${graduated} 道题间隔答对 2 次，移出了错题本。` : '不用自己抄错题。'}答错或标了“猜的”的题，会按这个节奏自动回来找你。
      </p>
      <ol className="mb-first-steps">
        {FIRST_STEPS.map((st, i) => (
          <li key={st.when} className={cx('mb-first-step', i === FIRST_STEPS.length - 1 && 'is-last')}>
            <span className="mb-first-when">{st.when}</span>
            <span className="mb-first-what">{st.what}</span>
          </li>
        ))}
      </ol>
      <TodayButton size="lg" />
      <p className="mb-first-foot">在题目里点「收藏」的题，也会收在这里。</p>
    </section>
  );
}

// ───────────────────────── Lists ─────────────────────────

function GroupCard({
  part,
  groups,
  today,
  slow,
  onOpen,
  isOpen,
  toggle,
}: {
  part: Part;
  groups: TopicGroup[];
  today: string;
  slow?: boolean;
  onOpen: (id: string) => void;
  isOpen: (part: Part, topic: string) => boolean;
  toggle: (part: Part, topic: string) => void;
}) {
  return (
    <div className="card mb-card">
      {groups.map((g) => (
        <TopicBlock key={g.topic} part={part} group={g} today={today} slow={slow} open={isOpen(part, g.topic)} onToggle={() => toggle(part, g.topic)} onOpen={onOpen} />
      ))}
    </div>
  );
}

function TopicBlock({
  part,
  group,
  today,
  slow,
  open,
  onToggle,
  onOpen,
}: {
  part: Part;
  group: TopicGroup;
  today: string;
  slow?: boolean;
  open: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
}) {
  const first = group.rows.find((r) => r.p.inMistakes && r.p.due);
  const next = part === 'rest' && first ? dueInfo(first.p.due, today) : null;
  return (
    <div className={cx('mb-group', open && 'is-open')}>
      <div
        className="mb-ghead"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.mb-gnote')) return;
          onToggle();
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || e.nativeEvent.isComposing) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="mb-lead">
          <Dot tone={group.subject} />
        </span>
        <span className="mb-gname">{group.name}</span>
        {group.unitName && <span className="mb-gunit">{group.unitName}</span>}
        <IconButton icon="notebook" label="考点笔记" size="sm" className="mb-gnote" onClick={() => navigate('/notes/' + group.topic)} />
        <Meta className="mb-gmeta">
          <span>
            <span className="num">{group.rows.length}</span> 题
          </span>
          {next && <span className={cx('mb-due', `is-${next.tone}`)}>{next.text}</span>}
        </Meta>
        <Icon name="down" size={16} className="mb-chev" />
      </div>
      {open && (
        <List className="mb-rows">
          {group.rows.map((r) => (
            <MistakeRow key={r.item.id} row={r} today={today} part={part} slow={slow} onOpen={onOpen} />
          ))}
        </List>
      )}
    </div>
  );
}

function MistakeRow({ row, today, part, slow, onOpen }: { row: Row; today: string; part: Part; slow?: boolean; onOpen: (id: string) => void }) {
  const { item, p, last } = row;
  // Today's list needs no "今天" on every row; the rest shows when each comes back.
  const due = p.inMistakes && part !== 'due' ? dueInfo(p.due, today) : null;
  const over = row.ratio > 1.2;
  return (
    <ListRow
      onClick={() => onOpen(item.id)}
      lead={<ItemMark p={p} />}
      title={
        <span className="mb-row-title">
          {sourceLabel(item)}
          {p.note && <Icon name="pen" size={13} className="mb-flag" />}
          {p.starred && !slow && <Icon name="star" size={13} className="mb-flag is-star" />}
        </span>
      }
      meta={<RichText text={stemSnippet(item)} lang="ja" inline className="mb-snip" />}
      trail={
        <span className="mb-trail">
          {slow ? (
            <Tooltip label={`上次用时是考场节奏的 ${row.ratio.toFixed(1)} 倍`}>
              <span className="mb-ratio num">{row.ratio.toFixed(1)}×</span>
            </Tooltip>
          ) : (
            <Tooltip label={`上次用时 · 考场节奏 ${fmtClock(item.targetSec)}`}>
              <span className={cx('mb-time', over && 'is-slow')}>
                上次 <span className="num">{last ? fmtClock(last.seconds) : '—'}</span>
              </span>
            </Tooltip>
          )}
          {part !== 'due' && <span className={cx('mb-due', due && `is-${due.tone}`)}>{due ? due.text : p.inMistakes ? '' : '已移出'}</span>}
        </span>
      }
    />
  );
}

/** Slow-but-correct items: why they are here and a timed redo of the slowest ones. */
function SlowNote({ rows }: { rows: Row[] }) {
  const picked = useMemo(() => [...rows].sort((a, b) => b.ratio - a.ratio).slice(0, 20), [rows]);
  const minutes = Math.max(1, Math.round(picked.reduce((s, r) => s + r.item.targetSec, 0) / 60));
  return (
    <div className="card mb-slow-note">
      <IconTile icon="timer" tone="warning" size="md" />
      <p>
        做对了，但用时超过考场节奏 <span className="num">{SLOW_FACTOR}</span> 倍，考场上会拖时间。冲刺计划会隔两天再排它们；想现在练，就按考场节奏限时重做。
      </p>
      <Button variant="secondary" icon="play" onClick={() => launch({ kind: 'review', title: '慢题限时重做', items: picked.map((r) => r.item), exam: true })}>
        限时重做 {picked.length} 题 · {minutes} 分钟
      </Button>
    </div>
  );
}

// ───────────────────────── Timed redo ─────────────────────────

type TimedSubject = 'all' | Subject;

function TimedModal({ open, onClose, rows }: { open: boolean; onClose: () => void; rows: Row[] }) {
  const [subject, setSubject] = useState<TimedSubject>('all');
  const [count, setCount] = useState<'10' | '20' | 'all'>('20');
  const pool = useMemo(
    () =>
      rows
        .filter((r) => subject === 'all' || r.item.subject === subject)
        .sort((a, b) => a.p.box - b.p.box || (a.p.due || '9999').localeCompare(b.p.due || '9999') || a.item.id.localeCompare(b.item.id)),
    [rows, subject],
  );
  const sizes = (['10', '20'] as const).filter((n) => pool.length > Number(n));
  const effective = count !== 'all' && !sizes.includes(count) ? 'all' : count;
  const picked = effective === 'all' ? pool : pool.slice(0, Number(effective));
  const limit = picked.reduce((s, r) => s + r.item.targetSec, 0);
  const counts = SUBJECT_ORDER.map((s) => rows.filter((r) => r.item.subject === s).length);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="错题限时重练"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            icon="play"
            disabled={!picked.length}
            onClick={() => launch({ kind: 'review', title: '错题限时重练', items: picked.map((r) => r.item), exam: true })}
          >
            开始 · {picked.length} 题
          </Button>
        </>
      }
    >
      <div className="mb-timed">
        <p className="muted">按考场节奏计时，交卷后统一看对错。最薄弱的题排在前面。</p>
        <div className="mb-timed-field">
          <span className="t-eyebrow">科目</span>
          <Segmented<TimedSubject>
            size="sm"
            value={subject}
            onChange={setSubject}
            options={[
              { value: 'all', label: '全部', count: rows.length },
              ...SUBJECT_ORDER.filter((_, i) => counts[i] > 0).map((s) => ({ value: s, label: SUBJECT_NAME[s], count: counts[SUBJECT_ORDER.indexOf(s)] })),
            ]}
          />
        </div>
        <div className="mb-timed-field">
          <span className="t-eyebrow">题量</span>
          <Segmented<'10' | '20' | 'all'>
            size="sm"
            value={effective}
            onChange={setCount}
            options={[...sizes.map((n) => ({ value: n, label: `${n} 题` })), { value: 'all' as const, label: '全部', count: pool.length }]}
          />
        </div>
        <div className="mb-timed-sum">
          <StatTile boxed label="题数" value={picked.length} unit="题" />
          <StatTile boxed label="限时" value={Math.max(1, Math.round(limit / 60))} unit="分钟" />
        </div>
        <p className="faint text-sm">没到期的题这次答对不算进度；答错会重新等 2 天再练。</p>
      </div>
    </Modal>
  );
}
