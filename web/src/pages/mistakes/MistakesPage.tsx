// 错题本: due re-tests first, then every mistake grouped by subject → topic, plus starred items.
import { useMemo, useState } from 'react';
import type { Attempt, Item, ItemProgress, Subject } from '@shared/types.ts';
import { isDue, MISTAKE_GRADUATE_BOX } from '@shared/srs.ts';
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

type Tab = 'mistakes' | 'starred';
type SubjectFilter = 'all' | Subject;
type DueFilter = 'all' | 'due' | 'later';
type SortKey = 'due' | 'recent' | 'often';

interface Row {
  item: Item;
  p: ItemProgress;
  last?: Attempt;
  due: boolean;
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

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'due', label: '到期优先' },
  { value: 'recent', label: '最近做过' },
  { value: 'often', label: '错得最多' },
];

function compareRows(sort: SortKey) {
  return (a: Row, b: Row) => {
    if (sort === 'due') return (a.p.due || '9999').localeCompare(b.p.due || '9999') || a.p.box - b.p.box || a.item.id.localeCompare(b.item.id);
    if (sort === 'recent') return b.p.lastAt.localeCompare(a.p.lastAt) || a.item.id.localeCompare(b.item.id);
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
    const starred: Row[] = [];
    for (const [id, p] of Object.entries(state.progress)) {
      const item = bank.byId.get(id);
      if (!item) continue;
      const row: Row = { item, p, last: lastById.get(id), due: isDue(p, today) };
      if (p.inMistakes) mistakes.push(row);
      if (p.starred) starred.push(row);
    }
    return { mistakes, starred };
  }, [state.progress, bank, lastById, today]);

  const dueRows = useMemo(() => all.mistakes.filter((r) => r.due).sort(compareRows('due')), [all.mistakes]);
  const source = tab === 'mistakes' ? all.mistakes : all.starred;

  const subjectCounts = useMemo(() => {
    const c: Record<SubjectFilter, number> = { all: source.length, math: 0, physics: 0, chemistry: 0, japanese: 0 };
    for (const r of source) c[r.item.subject] += 1;
    return c;
  }, [source]);

  const filtered = useMemo(
    () =>
      source.filter(
        (r) =>
          (subject === 'all' || r.item.subject === subject) &&
          (tab === 'starred' || dueFilter === 'all' || (dueFilter === 'due' ? r.due : !r.due)),
      ),
    [source, subject, dueFilter, tab],
  );

  const groups = useMemo<SubjectGroup[]>(() => {
    const cmp = compareRows(sort);
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
  }, [filtered, sort, bank]);

  const orderedIds = useMemo(() => groups.flatMap((g) => g.topics.flatMap((t) => t.rows.map((r) => r.item.id))), [groups]);

  return (
    <div className="page mk-page">
      <PageHeader
        title="错题本"
        desc="做错、蒙对或没把握的题会自动收进来。隔天答对才算，间隔答对 3 次自动移出。"
      />

      <DueHero dueRows={dueRows} total={all.mistakes} today={today} onTimed={() => setTimedOpen(true)} />

      <div className="mk-toolbar">
        <Segmented<Tab>
          value={tab}
          onChange={(v) => {
            setTab(v);
            setSelected(null);
          }}
          options={[
            { value: 'mistakes', label: <span className="mk-tab">错题<b className="num">{all.mistakes.length}</b></span>, icon: 'alert' },
            { value: 'starred', label: <span className="mk-tab">收藏<b className="num">{all.starred.length}</b></span>, icon: 'star' },
          ]}
        />
        <div className="mk-filters">
          <Segmented<SubjectFilter>
            size="sm"
            value={subject}
            onChange={setSubject}
            options={(['all', ...SUBJECT_ORDER] as SubjectFilter[]).map((s) => ({
              value: s,
              label: (
                <span className="mk-seg">
                  {s !== 'all' && <SubjectDot subject={s} />}
                  {s === 'all' ? '全部' : SUBJECT_NAME[s]}
                  <span className="mk-seg-n num">{subjectCounts[s]}</span>
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
          <label className="mk-sort">
            <Icon name="list" size={14} />
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="排序">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <Icon name="down" size={14} className="mk-sort-caret" />
          </label>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card mk-empty-card">
          {tab === 'starred' ? (
            all.starred.length === 0 ? (
              <Empty icon="star" title="还没有收藏的题" desc="遇到经典题、想考前再看一眼的题，在题目或解析里点「收藏」，它就会出现在这里。" />
            ) : (
              <Empty icon="search" title="这个筛选下没有收藏" action={<Button onClick={() => setSubject('all')}>看全部收藏</Button>} />
            )
          ) : all.mistakes.length === 0 ? (
            <Empty
              icon="checkCircle"
              title="错题本是空的"
              desc="去做题吧。做错、蒙对或标了「没把握」的题会自动收进来，并按 1、2、4 天的间隔安排重做。"
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
        <div className="mk-groups">
          {groups.map((g) => (
            <section key={g.subject} className={cx('mk-subject', `tone-${g.subject}`)}>
              <header className="mk-subject-head">
                <SubjectTag subject={g.subject} />
                <span className="mk-subject-count">
                  <b className="num">{g.count}</b> 题{tab === 'mistakes' && g.due > 0 && <span className="mk-subject-due"> · 今天到期 {g.due}</span>}
                </span>
              </header>
              <div className="mk-topics">
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

function DueHero({ dueRows, total, today, onTimed }: { dueRows: Row[]; total: Row[]; today: string; onTimed: () => void }) {
  const n = dueRows.length;
  const minutes = Math.round(dueRows.reduce((s, r) => s + planSeconds(r.item, 'review'), 0) / 60);
  const bySubject = SUBJECT_ORDER.map((s) => ({ s, n: dueRows.filter((r) => r.item.subject === s).length })).filter((x) => x.n > 0);
  const boxes = [0, 1, 2].map((b) => total.filter((r) => Math.min(MISTAKE_GRADUATE_BOX - 1, r.p.box) === b).length);
  const nextDue = useMemo(() => {
    const later = total.filter((r) => !r.due && r.p.due).map((r) => r.p.due!).sort();
    if (!later.length) return null;
    const d = later[0];
    return { info: dueInfo(d, today), count: later.filter((x) => x === d).length };
  }, [total, today]);

  return (
    <section className={cx('mk-hero', n === 0 && 'is-clear')}>
      <div className="mk-hero-main">
        <div className="mk-hero-num">
          <span className="num">{n}</span>
          <span className="mk-hero-unit">题</span>
        </div>
        <div className="mk-hero-text">
          <div className="mk-hero-title">{n > 0 ? '今天到期要重做' : total.length ? '今天的错题都清完了' : '还没有错题'}</div>
          <div className="mk-hero-sub">
            {n > 0 ? (
              <>
                预计 {fmtMinutes(minutes)}
                {bySubject.length > 0 && <span className="mk-hero-dot">·</span>}
                {bySubject.map((x) => (
                  <span key={x.s} className="mk-hero-subj">
                    <SubjectDot subject={x.s} />
                    {SUBJECT_NAME[x.s]} {x.n}
                  </span>
                ))}
              </>
            ) : nextDue?.info ? (
              <>下一批：{nextDue.info.text} {nextDue.count} 题。想多练可以限时重练全部错题。</>
            ) : (
              <>做错的题会在第 1、2、4 天回来找你。</>
            )}
          </div>
        </div>
      </div>

      {total.length > 0 && (
        <div className="mk-ladder" aria-label="错题进度">
          <div className="mk-ladder-head">
            <span>错题进度</span>
            <span className="faint">共 {total.length} 题</span>
          </div>
          <div className="mk-ladder-bar">
            {boxes.map((c, i) =>
              c > 0 ? <span key={i} className={`mk-ladder-seg b${i}`} style={{ flexGrow: c }} title={`${['新错题', '答对 1 次', '答对 2 次'][i]}：${c} 题`} /> : null,
            )}
          </div>
          <div className="mk-ladder-legend">
            {['新错题', '对 1 次', '对 2 次'].map((l, i) => (
              <span key={l}>
                <i className={`b${i}`} />
                {l} <b className="num">{boxes[i]}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mk-hero-actions">
        <Button
          variant="primary"
          size="lg"
          icon="refresh"
          disabled={n === 0}
          onClick={() => launch({ kind: 'review', title: '今日到期错题', items: dueRows.map((r) => r.item) })}
        >
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
    <div className="mk-topic">
      <div className="mk-topic-head">
        <div className="mk-topic-name">
          <span>{group.name}</span>
          {group.unitName && <span className="mk-topic-unit">{group.unitName}</span>}
        </div>
        <div className="mk-topic-side">
          <span className="faint text-sm num">{group.rows.length} 题</span>
          <a className="mk-topic-link" href={href('/notes/' + group.topic)}>
            <Icon name="notebook" size={14} />
            考点笔记
          </a>
        </div>
      </div>
      <ul className="mk-rows">
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
  const slow = last ? last.seconds > item.targetSec * 1.2 : false;
  return (
    <button type="button" className={cx('mk-row', row.due && 'is-due')} onClick={() => onOpen(item.id)}>
      <ResultMark kind={kind} />
      <span className="mk-row-main">
        <span className="mk-row-src">
          {sourceLabel(item)}
          {p.note && <Icon name="pen" size={13} className="mk-flag" title="有笔记" />}
          {p.starred && tab === 'mistakes' && <Icon name="star" size={13} className="mk-flag is-star" title="已收藏" />}
        </span>
        <span className="mk-row-snip">
          <RichText text={stemSnippet(item)} lang="ja" inline />
        </span>
      </span>
      <span className="mk-row-stats">
        <span className="mk-row-att" title={`做过 ${p.attempts} 次，对 ${p.correct} 次 · 上次${RESULT_TEXT[kind]}`}>
          <b className="num">{p.attempts}</b> 次 · 对 <b className="num">{p.correct}</b>
        </span>
        <span className={cx('mk-row-time num', slow && 'is-slow')} title={`上次用时 ${last ? fmtClock(last.seconds) : '—'}，考场节奏 ${fmtClock(item.targetSec)}`}>
          <Icon name="clock" size={12} />
          {last ? fmtClock(last.seconds) : '—'}
        </span>
      </span>
      <span className="mk-row-box">{p.inMistakes ? <BoxDots box={p.box} /> : <span className="faint text-xs">已移出</span>}</span>
      <span className="mk-row-due">{due ? <span className={cx('mk-due', `tone-${due.tone}`)}>{due.text}</span> : <span className="faint text-xs">—</span>}</span>
      <Icon name="right" size={16} className="mk-row-go" />
    </button>
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
  const picked = count === 'all' ? pool : pool.slice(0, Number(count));
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
      <div className="mk-timed">
        <p className="muted">按考场节奏计时，交卷后统一看对错。最薄弱的题排在前面。</p>
        <div className="mk-timed-field">
          <span className="mk-timed-label">科目</span>
          <Segmented<TimedSubject>
            size="sm"
            value={subject}
            onChange={setSubject}
            options={[
              { value: 'all', label: `全部 ${rows.length}` },
              ...SUBJECT_ORDER.map((s, i) => ({ value: s, label: `${SUBJECT_NAME[s]} ${counts[i]}` })),
            ]}
          />
        </div>
        <div className="mk-timed-field">
          <span className="mk-timed-label">题量</span>
          <Segmented<'10' | '20' | 'all'>
            size="sm"
            value={count}
            onChange={setCount}
            options={[
              { value: '10', label: '10 题' },
              { value: '20', label: '20 题' },
              { value: 'all', label: `全部 ${pool.length}` },
            ]}
          />
        </div>
        <div className="mk-timed-sum">
          <div>
            <span className="num">{picked.length}</span>
            <small>题</small>
          </div>
          <div>
            <span className="num">{Math.max(1, Math.round(limit / 60))}</span>
            <small>分钟限时</small>
          </div>
        </div>
        <p className="faint text-sm">没到期的题这次答对不推进进度，答错会重新从第 1 天开始。</p>
      </div>
    </Modal>
  );
}
