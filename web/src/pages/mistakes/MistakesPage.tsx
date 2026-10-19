// 错题本: due re-tests first, then every mistake grouped by subject → topic, plus slow-but-correct and starred items.
import { useMemo, useState } from 'react';
import type { Attempt, Item, ItemProgress, Subject } from '@shared/types.ts';
import { isDue, MISTAKE_GRADUATE_BOX, SLOW_FACTOR } from '@shared/srs.ts';
import { planSeconds } from '@shared/planner.ts';
import { useReady } from '../../lib/store.ts';
import { href, navigate } from '../../lib/router.ts';
import { cx, fmtClock, fmtMinutes, SUBJECT_NAME } from '../../lib/format.ts';
import { Button, Empty, Modal, PageHeader, Segmented, SubjectDot, SubjectTag } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import { ItemPreview } from './ItemPreview.tsx';
import { BoxDots, ResultMark } from './bits.tsx';
import { SUBJECT_ORDER, dueInfo, launch, resultOf, sourceLabel, stemSnippet, RESULT_TEXT } from './helpers.ts';
import './mistakes.css';

type Tab = 'mistakes' | 'slow' | 'starred';
type SubjectFilter = 'all' | Subject;
type DueFilter = 'all' | 'due' | 'later';
type SortKey = 'due' | 'recent' | 'often' | 'slowest';

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
  name: string;
  unitName: string;
  rows: Row[];
  due: number;
}

interface SubjectGroup {
  subject: Subject;
  topics: TopicGroup[];
  count: number;
  due: number;
}

const SORTS: { value: SortKey; label: string; tabs: Tab[] }[] = [
  { value: 'slowest', label: '最慢优先', tabs: ['slow'] },
  { value: 'due', label: '到期优先', tabs: ['mistakes', 'starred'] },
  { value: 'recent', label: '最近做过', tabs: ['mistakes', 'slow', 'starred'] },
  { value: 'often', label: '错得最多', tabs: ['mistakes', 'starred'] },
];

function compareRows(sort: SortKey) {
  return (a: Row, b: Row) => {
    if (sort === 'due') return (a.p.due || '9999').localeCompare(b.p.due || '9999') || a.p.box - b.p.box || a.item.id.localeCompare(b.item.id);
    if (sort === 'recent') return b.p.lastAt.localeCompare(a.p.lastAt) || a.item.id.localeCompare(b.item.id);
    if (sort === 'slowest') return b.ratio - a.ratio || a.item.id.localeCompare(b.item.id);
    return b.p.attempts - b.p.correct - (a.p.attempts - a.p.correct) || a.p.box - b.p.box || a.item.id.localeCompare(b.item.id);
  };
}

export function MistakesPage() {
  const { state, bank, today } = useReady();
  const [tab, setTab] = useState<Tab>('mistakes');
  const [subject, setSubject] = useState<SubjectFilter>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [sort, setSort] = useState<SortKey>('due');
  const [selected, setSelected] = useState<string | null>(null);
  const [timedOpen, setTimedOpen] = useState(false);

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

  const filtered = useMemo(
    () => source.filter((r) => (subject === 'all' || r.item.subject === subject) && (tab !== 'mistakes' || dueFilter === 'all' || (dueFilter === 'due' ? r.due : !r.due))),
    [source, subject, dueFilter, tab],
  );

  const groups = useMemo<SubjectGroup[]>(() => {
    const cmp = compareRows(sortKey);
    const bySubject = new Map<Subject, Map<string, Row[]>>();
    for (const r of filtered) {
      const s = bySubject.get(r.item.subject) || new Map<string, Row[]>();
      bySubject.set(r.item.subject, s);
      const list = s.get(r.item.topic) || [];
      list.push(r);
      s.set(r.item.topic, list);
    }
    return SUBJECT_ORDER.filter((s) => bySubject.has(s)).map((s) => {
      const topics: TopicGroup[] = [...bySubject.get(s)!.entries()].map(([topic, rows]) => {
        rows.sort(cmp);
        const info = bank.topics.get(topic);
        return { topic, name: info?.name || topic, unitName: info?.unitName || '', rows, due: rows.filter((r) => r.due).length };
      });
      topics.sort((a, b) => cmp(a.rows[0], b.rows[0]) || b.rows.length - a.rows.length);
      return { subject: s, topics, count: topics.reduce((n, t) => n + t.rows.length, 0), due: topics.reduce((n, t) => n + t.due, 0) };
    });
  }, [filtered, sortKey, bank]);

  const orderedIds = useMemo(() => groups.flatMap((g) => g.topics.flatMap((t) => t.rows.map((r) => r.item.id))), [groups]);

  return (
    <div className="page mb-page">
      <PageHeader title="错题本" desc="做错或猜的题 2 天后再练，再隔 4 天；间隔答对 2 次（选“确定”）就移出错题本。" />

      <DueHero dueRows={dueRows} total={all.mistakes} graduated={all.graduated} today={today} onTimed={() => setTimedOpen(true)} />

      <div className="mb-toolbar">
        <Segmented<Tab>
          value={tab}
          onChange={(v) => {
            setTab(v);
            setSelected(null);
          }}
          options={[
            {
              value: 'mistakes',
              label: (
                <span className="mb-tab">
                  错题<b className="num">{all.mistakes.length}</b>
                </span>
              ),
              icon: 'alert',
            },
            {
              value: 'slow',
              label: (
                <span className="mb-tab">
                  做对但太慢<b className="num">{all.slow.length}</b>
                </span>
              ),
              icon: 'clock',
            },
            {
              value: 'starred',
              label: (
                <span className="mb-tab">
                  收藏<b className="num">{all.starred.length}</b>
                </span>
              ),
              icon: 'star',
            },
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
                  label: (
                    <span className="mb-seg">
                      {s !== 'all' && <SubjectDot subject={s} />}
                      {s === 'all' ? '全部' : SUBJECT_NAME[s]}
                      <span className="mb-seg-n num">{subjectCounts[s]}</span>
                    </span>
                  ),
                }))}
            />
            {tab === 'mistakes' && (
              <Segmented<DueFilter>
                size="sm"
                value={dueFilter}
                onChange={setDueFilter}
                options={[
                  { value: 'all', label: '全部' },
                  { value: 'due', label: '已到期' },
                  { value: 'later', label: '未到期' },
                ]}
              />
            )}
            <label className="mb-sort">
              <Icon name="list" size={14} />
              <select value={sortKey} onChange={(e) => setSort(SORTS.find((x) => x.value === e.target.value)?.value ?? 'due')} aria-label="排序">
                {SORTS.filter((s) => s.tabs.includes(tab)).map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Icon name="down" size={14} className="mb-sort-caret" />
            </label>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="card mb-empty-card">
          {tab === 'slow' ? (
            all.slow.length === 0 ? (
              <Empty
                icon="clock"
                title="没有做对但太慢的题"
                desc={`做对了、但用时超过考场节奏 ${SLOW_FACTOR} 倍的题会出现在这里。冲刺计划会隔两天再把它们排进练习，帮你把速度提上来。`}
              />
            ) : (
              <Empty icon="search" title="这个科目没有太慢的题" action={<Button onClick={() => setSubject('all')}>看全部科目</Button>} />
            )
          ) : tab === 'starred' ? (
            all.starred.length === 0 ? (
              <Empty icon="star" title="还没有收藏的题" desc="遇到经典题、想考前再看一眼的题，在题目或解析里点「收藏」，它就会出现在这里。" />
            ) : (
              <Empty icon="search" title="这个筛选下没有收藏" action={<Button onClick={() => setSubject('all')}>看全部收藏</Button>} />
            )
          ) : all.mistakes.length === 0 ? (
            <Empty
              icon="checkCircle"
              title="错题本是空的"
              desc="去做题吧。做错或标了「猜的」的题会自动收进来，2 天后再练，再隔 4 天；标了「没把握」的题 4 天后再练一次。"
              action={
                <Button variant="primary" icon="arrowRight" onClick={() => navigate('/practice')}>
                  去题库练习
                </Button>
              }
            />
          ) : (
            <Empty
              icon="search"
              title={dueFilter === 'due' ? '这个科目今天没有到期的错题' : '没有符合筛选的错题'}
              action={
                <Button
                  onClick={() => {
                    setSubject('all');
                    setDueFilter('all');
                  }}
                >
                  清除筛选
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <div className="mb-groups">
          {tab === 'slow' && <SlowNote rows={filtered} />}
          {groups.map((g) => (
            <section key={g.subject} className={cx('mb-subject', `tone-${g.subject}`)}>
              <header className="mb-subject-head">
                <SubjectTag subject={g.subject} />
                <span className="mb-subject-count">
                  <b className="num">{g.count}</b> 题{tab === 'mistakes' && g.due > 0 && <span className="mb-subject-due"> · 今天到期 {g.due}</span>}
                </span>
              </header>
              <div className="mb-topics">
                {g.topics.map((t) => (
                  <TopicCard key={t.topic} group={t} today={today} tab={tab} onOpen={setSelected} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ItemPreview itemId={selected} ids={orderedIds} onSelect={setSelected} />
      <TimedModal open={timedOpen} onClose={() => setTimedOpen(false)} rows={all.mistakes} />
    </div>
  );
}

function DueHero({ dueRows, total, graduated, today, onTimed }: { dueRows: Row[]; total: Row[]; graduated: number; today: string; onTimed: () => void }) {
  const n = dueRows.length;
  const minutes = Math.round(dueRows.reduce((s, r) => s + planSeconds(r.item, 'review'), 0) / 60);
  const bySubject = SUBJECT_ORDER.map((s) => ({ s, n: dueRows.filter((r) => r.item.subject === s).length })).filter((x) => x.n > 0);
  // In the book: new (box 0) and correct once (box 1); out: cleared by two spaced confident answers.
  const boxes = [0, 1].map((b) => total.filter((r) => Math.min(MISTAKE_GRADUATE_BOX - 1, r.p.box) === b).length).concat(graduated);
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
    <section className={cx('mb-hero', n === 0 && 'is-clear')}>
      <div className="mb-hero-main">
        <div className="mb-hero-num">
          <span className="num">{n}</span>
          <span className="mb-hero-unit">题</span>
        </div>
        <div className="mb-hero-text">
          <div className="mb-hero-title">{n > 0 ? '今天到期要重做' : total.length ? '今天的错题都清完了' : '还没有错题'}</div>
          <div className="mb-hero-sub">
            {n > 0 ? (
              <>
                预计 {fmtMinutes(minutes)}
                {bySubject.length > 0 && <span className="mb-hero-dot">·</span>}
                {bySubject.map((x) => (
                  <span key={x.s} className="mb-hero-subj">
                    <SubjectDot subject={x.s} />
                    {SUBJECT_NAME[x.s]} {x.n}
                  </span>
                ))}
              </>
            ) : nextDue?.info ? (
              <>
                下一批：{nextDue.info.text} {nextDue.count} 题。想多练可以限时重练全部错题。
              </>
            ) : (
              <>做错的题 2 天后回来找你，答对后再隔 4 天来一次。</>
            )}
          </div>
        </div>
      </div>

      {total.length + graduated > 0 && (
        <div className="mb-ladder" aria-label="错题进度">
          <div className="mb-ladder-head">
            <span>错题进度</span>
            <span className="faint">还剩 {total.length} 题</span>
          </div>
          <div className="mb-ladder-bar">
            {boxes.map((c, i) =>
              c > 0 ? <span key={i} className={`mb-ladder-seg b${i}`} style={{ flexGrow: c }} title={`${['新错题', '间隔答对 1 次', '已移出（间隔答对 2 次）'][i]}：${c} 题`} /> : null,
            )}
          </div>
          <div className="mb-ladder-legend">
            {['新错题', '对 1 次', '已移出'].map((l, i) => (
              <span key={l}>
                <i className={`b${i}`} />
                {l} <b className="num">{boxes[i]}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mb-hero-actions">
        <Button variant="primary" size="lg" icon="refresh" disabled={n === 0} onClick={() => launch({ kind: 'review', title: '今日到期错题', items: dueRows.map((r) => r.item) })}>
          {n > 0 ? `重做今天到期的 ${n} 题` : '今天没有到期的题'}
        </Button>
        <Button variant="ghost" icon="clock" disabled={total.length === 0} onClick={onTimed}>
          全部错题限时重练
        </Button>
      </div>
    </section>
  );
}

function TopicCard({ group, today, tab, onOpen }: { group: TopicGroup; today: string; tab: Tab; onOpen: (id: string) => void }) {
  return (
    <div className="mb-topic">
      <div className="mb-topic-head">
        <div className="mb-topic-name">
          <span>{group.name}</span>
          {group.unitName && <span className="mb-topic-unit">{group.unitName}</span>}
        </div>
        <div className="mb-topic-side">
          <span className="faint text-sm num">{group.rows.length} 题</span>
          <a className="mb-topic-link" href={href('/notes/' + group.topic)}>
            <Icon name="notebook" size={14} />
            考点笔记
          </a>
        </div>
      </div>
      <ul className="mb-rows">
        {group.rows.map((r) => (
          <li key={r.item.id}>
            <MistakeRow row={r} today={today} tab={tab} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MistakeRow({ row, today, tab, onOpen }: { row: Row; today: string; tab: Tab; onOpen: (id: string) => void }) {
  const { item, p, last } = row;
  const kind = resultOf(last);
  const due = p.inMistakes ? dueInfo(p.due, today) : null;
  const slow = row.ratio > 1.2;
  return (
    <button type="button" className={cx('mb-row', row.due && 'is-due')} onClick={() => onOpen(item.id)}>
      <ResultMark kind={kind} />
      <span className="mb-row-main">
        <span className="mb-row-src">
          {sourceLabel(item)}
          {p.note && <Icon name="pen" size={13} className="mb-flag" title="有笔记" />}
          {p.starred && tab === 'mistakes' && <Icon name="star" size={13} className="mb-flag is-star" title="已收藏" />}
        </span>
        <span className="mb-row-snip">
          <RichText text={stemSnippet(item)} lang="ja" inline />
        </span>
      </span>
      <span className="mb-row-stats">
        <span className="mb-row-att" title={`做过 ${p.attempts} 次，对 ${p.correct} 次 · 上次${RESULT_TEXT[kind]}`}>
          <b className="num">{p.attempts}</b> 次 · 对 <b className="num">{p.correct}</b>
        </span>
        <span className={cx('mb-row-time num', slow && 'is-slow')} title={`上次用时 ${last ? fmtClock(last.seconds) : '—'}，考场节奏 ${fmtClock(item.targetSec)}`}>
          <Icon name="clock" size={12} />
          {last ? fmtClock(last.seconds) : '—'}
        </span>
      </span>
      <span className="mb-row-box">
        {tab === 'slow' ? (
          <span className="mb-ratio num" title={`上次用时是考场节奏的 ${row.ratio.toFixed(1)} 倍`}>
            {row.ratio.toFixed(1)}×
          </span>
        ) : p.inMistakes ? (
          <BoxDots box={p.box} />
        ) : (
          <span className="faint text-xs">已移出</span>
        )}
      </span>
      <span className="mb-row-due">{due ? <span className={cx('mb-due', `tone-${due.tone}`)}>{due.text}</span> : <span className="faint text-xs">—</span>}</span>
      <Icon name="right" size={16} className="mb-row-go" />
    </button>
  );
}

/** Slow-but-correct items: why they are here and a timed redo of the slowest ones. */
function SlowNote({ rows }: { rows: Row[] }) {
  const picked = useMemo(() => [...rows].sort((a, b) => b.ratio - a.ratio).slice(0, 20), [rows]);
  const minutes = Math.max(1, Math.round(picked.reduce((s, r) => s + r.item.targetSec, 0) / 60));
  return (
    <div className="mb-slow-note">
      <span className="mb-slow-icon">
        <Icon name="clock" size={18} />
      </span>
      <p>
        这些题做对了，但用时超过考场节奏的 <b>{SLOW_FACTOR}</b> 倍，考场上会拖时间。冲刺计划会隔两天再排它们；想现在练，就按考场节奏限时重做。
      </p>
      <Button variant="soft" icon="play" onClick={() => launch({ kind: 'review', title: '慢题限时重做', items: picked.map((r) => r.item), exam: true })}>
        限时重做 {picked.length} 题 · {minutes} 分钟
      </Button>
    </div>
  );
}

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
          <span className="mb-timed-label">科目</span>
          <Segmented<TimedSubject>
            size="sm"
            value={subject}
            onChange={setSubject}
            options={[
              { value: 'all', label: `全部 ${rows.length}` },
              ...SUBJECT_ORDER.filter((_, i) => counts[i] > 0).map((s) => ({ value: s, label: `${SUBJECT_NAME[s]} ${counts[SUBJECT_ORDER.indexOf(s)]}` })),
            ]}
          />
        </div>
        <div className="mb-timed-field">
          <span className="mb-timed-label">题量</span>
          <Segmented<'10' | '20' | 'all'>
            size="sm"
            value={effective}
            onChange={setCount}
            options={[...sizes.map((n) => ({ value: n, label: `${n} 题` })), { value: 'all' as const, label: `全部 ${pool.length}` }]}
          />
        </div>
        <div className="mb-timed-sum">
          <div>
            <span className="num">{picked.length}</span>
            <small>题</small>
          </div>
          <div>
            <span className="num">{Math.max(1, Math.round(limit / 60))}</span>
            <small>分钟限时</small>
          </div>
        </div>
        <p className="faint text-sm">没到期的题这次答对不算进度；答错会重新等 2 天再练。</p>
      </div>
    </Modal>
  );
}
