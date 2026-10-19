// 考点笔记: every taxonomy topic with mastery and note status; a topic page with the note,
// the learner's numbers on it, its real exam items and a one-click drill.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Item, KeyTerm, Subject, TaxonomyTopic } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { topicStats, type TopicStat } from '@shared/stats.ts';
import { shortTopic } from '@shared/planner.ts';
import { useReady, update } from '../../lib/store.ts';
import { useRoute } from '../../lib/router.ts';
import { findBlock, markBlock } from '@shared/actions.ts';
import { href, navigate } from '../../lib/router.ts';
import { cx, fmtClock, fmtDateShort, pct, SUBJECT_NAME } from '../../lib/format.ts';
import { Badge, Button, Empty, PageHeader, Progress, Ring, Segmented, SubjectTag, type Tone } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import { ItemPreview } from '../mistakes/ItemPreview.tsx';
import { ResultMark } from '../mistakes/bits.tsx';
import { SUBJECT_ORDER, drillOrder, launch, resultOf, sourceLabel } from '../mistakes/helpers.ts';
import { BAND_TEXT, masteryBand, targetRatio, type Band } from '../stats/model.ts';
import './notes.css';

const BAND_TONE: Record<Band, Tone> = { weak: 'danger', near: 'warning', good: 'success', none: 'neutral' };

type TopicInfo = TaxonomyTopic & { subject: Subject; unit: string; unitName: string };

export function NotesPage({ topic }: { topic?: string }) {
  return topic ? <TopicView key={topic} topic={topic} /> : <NotesIndex />;
}

// ───────────────────────── Index ─────────────────────────

type SubjectFilter = 'all' | Subject;
type Mode = 'units' | 'weak';

interface Entry {
  info: TopicInfo;
  stat: TopicStat | undefined;
  band: Band;
  items: number;
  hasNote: boolean;
  /** Lower = needs attention first. */
  priority: number;
}

function useEntries(state: AppState, bank: BankIndex): Entry[] {
  return useMemo(() => {
    const stats = topicStats(state, bank);
    return [...bank.topics.values()].map((info) => {
      const stat = stats.get(info.id);
      const target = targetRatio(state, info.subject);
      const band = masteryBand(stat, target);
      const items = bank.byTopic.get(info.id)?.length ?? 0;
      const gap = stat && stat.attempts ? stat.mastery - target : 0;
      const weight = 1 + info.weight / 5;
      // Weak measured topics first, then never-practised ones with items (by exam weight), then the rest.
      const priority = band === 'weak' || band === 'near' ? gap * weight - 1 : band === 'none' ? (items ? -0.2 - info.weight / 50 : 1) : gap;
      return { info, stat, band, items, hasNote: bank.notesByTopic.has(info.id), priority };
    });
  }, [state, bank]);
}

function NotesIndex() {
  const { state, bank } = useReady();
  const entries = useEntries(state, bank);
  const [subject, setSubject] = useState<SubjectFilter>('all');
  const [mode, setMode] = useState<Mode>('units');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      entries.filter(
        (e) =>
          (subject === 'all' || e.info.subject === subject) &&
          (!q || e.info.name.toLowerCase().includes(q) || (e.info.ja || '').toLowerCase().includes(q) || e.info.unitName.includes(q) || e.info.id.includes(q)),
      ),
    [entries, subject, q],
  );
  const noteCount = entries.filter((e) => e.hasNote).length;
  const weakCount = entries.filter((e) => e.band === 'weak').length;

  return (
    <div className="page nt-page">
      <PageHeader
        title="考点笔记"
        desc="每个考点的公式、概念和 EJU 常考套路。先看最弱的，再去练对应真题。"
        actions={
          <div className="nt-summary">
            <span>
              <b className="num">{noteCount}</b>/{entries.length} 个考点有笔记
            </span>
            {weakCount > 0 && (
              <span className="nt-summary-weak">
                <b className="num">{weakCount}</b> 个薄弱
              </span>
            )}
          </div>
        }
      />

      <div className="nt-toolbar">
        <Segmented<SubjectFilter>
          size="sm"
          value={subject}
          onChange={setSubject}
          options={(['all', ...SUBJECT_ORDER] as SubjectFilter[]).map((s) => ({ value: s, label: s === 'all' ? '全部' : SUBJECT_NAME[s] }))}
        />
        <Segmented<Mode>
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'units', label: '按单元', icon: 'list' },
            { value: 'weak', label: '弱项优先', icon: 'flame' },
          ]}
        />
        <label className="nt-search">
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜考点，如 电场、数列、溶解度" aria-label="搜索考点" />
          {query && (
            <button type="button" className="nt-search-clear" onClick={() => setQuery('')} aria-label="清除">
              <Icon name="x" size={14} />
            </button>
          )}
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <Empty icon="search" title="没有找到这个考点" desc="换个关键词试试，比如中文名或日文名。" action={<Button onClick={() => setQuery('')}>清除搜索</Button>} />
        </div>
      ) : mode === 'weak' ? (
        <WeakList entries={visible} />
      ) : (
        <UnitList entries={visible} bank={bank} />
      )}
    </div>
  );
}

function UnitList({ entries, bank }: { entries: Entry[]; bank: BankIndex }) {
  const bySubject = SUBJECT_ORDER.map((s) => {
    const list = entries.filter((e) => e.info.subject === s);
    const units = bank.bundle.taxonomy.subjects[s].units.map((u) => ({ id: u.id, name: u.name, list: list.filter((e) => e.info.unit === u.id) })).filter((u) => u.list.length > 0);
    return { s, list, units };
  }).filter((x) => x.list.length > 0);

  return (
    <div className="nt-subjects">
      {bySubject.map(({ s, list, units }) => {
        const practised = list.filter((e) => e.stat && e.stat.attempts > 0).length;
        return (
          <section key={s} className={cx('nt-subject', `tone-${s}`)}>
            <header className="nt-subject-head">
              <SubjectTag subject={s} />
              <span className="faint text-sm">
                {list.length} 个考点 · 练过 {practised} 个 · {list.filter((e) => e.hasNote).length} 篇笔记
              </span>
            </header>
            <div className="nt-units">
              {units.map((u) => (
                <div key={u.id} className="nt-unit">
                  <div className="nt-unit-name">{u.name}</div>
                  <ul className="nt-rows">
                    {u.list.map((e) => (
                      <li key={e.info.id}>
                        <TopicRow e={e} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function WeakList({ entries }: { entries: Entry[] }) {
  const sorted = [...entries].sort((a, b) => a.priority - b.priority || b.info.weight - a.info.weight || b.items - a.items);
  return (
    <div className="nt-weak">
      <p className="nt-weak-hint">
        <Icon name="info" size={14} />
        按「离目标多远 × 考频」排序；没练过但题库有真题的考点排在已达标的前面。
      </p>
      <div className="nt-grid">
        {sorted.map((e) => (
          <TopicCard key={e.info.id} e={e} showSubject />
        ))}
      </div>
    </div>
  );
}

function TopicRow({ e }: { e: Entry }) {
  const att = e.stat?.attempts ?? 0;
  return (
    <a className={cx('nt-row', `band-${e.band}`, !e.items && !e.hasNote && 'is-thin')} href={href('/notes/' + e.info.id)}>
      <span className="nt-row-main">
        <span className="nt-row-name">
          {e.info.name}
          {e.info.weight >= 4 && <span className="nt-hot">高频</span>}
        </span>
        <span className="nt-row-sub">
          {e.info.ja && <span lang="ja">{e.info.ja}</span>}
          <span>{e.items ? `${e.items} 题` : '暂无真题'}</span>
        </span>
      </span>
      <span className="nt-row-side">
        <span className={cx('nt-note-flag', e.hasNote && 'is-on')} title={e.hasNote ? '有笔记' : '笔记整理中'}>
          <Icon name="notebook" size={13} />
          {e.hasNote ? '笔记' : '待补'}
        </span>
        <span className="nt-row-mastery">
          <Progress value={att ? (e.stat?.mastery ?? 0) : 0} tone={BAND_TONE[e.band]} size="sm" />
          <span className={cx('nt-band', `is-${e.band}`)}>{att ? pct(e.stat?.mastery) : '未练'}</span>
        </span>
      </span>
    </a>
  );
}

function TopicCard({ e, showSubject }: { e: Entry; showSubject?: boolean }) {
  const att = e.stat?.attempts ?? 0;
  return (
    <a className={cx('nt-card', `band-${e.band}`, !e.items && !e.hasNote && 'is-thin')} href={href('/notes/' + e.info.id)}>
      <div className="nt-card-top">
        {showSubject && <SubjectTag subject={e.info.subject} size="sm" />}
        {e.info.weight >= 4 && <Badge tone="primary">高频</Badge>}
        <span className={cx('nt-note-flag', e.hasNote && 'is-on')} title={e.hasNote ? '有笔记' : '笔记整理中'}>
          <Icon name="notebook" size={13} />
          {e.hasNote ? '笔记' : '待补'}
        </span>
      </div>
      <div className="nt-card-name">{e.info.name}</div>
      {e.info.ja && (
        <div className="nt-card-ja" lang="ja">
          {e.info.ja}
        </div>
      )}
      <div className="nt-card-bottom">
        <Progress value={att ? (e.stat?.mastery ?? 0) : 0} tone={BAND_TONE[e.band]} size="sm" />
        <div className="nt-card-meta">
          <span className={cx('nt-band', `is-${e.band}`)}>{att ? `${BAND_TEXT[e.band]} ${pct(e.stat?.mastery)}` : BAND_TEXT.none}</span>
          <span className="faint">{e.items ? `${e.items} 题${att ? ` · 做过 ${att} 次` : ''}` : '暂无真题'}</span>
        </div>
      </div>
    </a>
  );
}

// ───────────────────────── Topic page ─────────────────────────

function TopicView({ topic }: { topic: string }) {
  const { state, bank } = useReady();
  const top = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const info = bank.topics.get(topic);
  const note = bank.notesByTopic.get(topic);
  const items = useMemo(
    () => [...(bank.byTopic.get(topic) || [])].sort((a, b) => (b.source.session || '').localeCompare(a.source.session || '') || (a.order ?? 0) - (b.order ?? 0)),
    [bank, topic],
  );
  const stat = useMemo(() => topicStats(state, bank).get(topic), [state, bank, topic]);

  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' });
  }, []);

  if (!info) {
    return (
      <div className="page nt-page" ref={top}>
        <BackLink />
        <div className="card">
          <Empty icon="search" title="没找到这个考点" desc="它可能已经改名或合并了。回到考点列表看看。" action={<Button onClick={() => navigate('/notes')}>回到考点笔记</Button>} />
        </div>
      </div>
    );
  }

  const drill = drillOrder(state, bank, topic, 10);
  const unseen = items.filter((it) => !state.progress[it.id]?.attempts).length;
  const startDrill = () => launch({ kind: 'drill', title: `考点 · ${shortTopic(bank, topic)}`, items: drill });

  return (
    <div className="page nt-page nt-topic" ref={top}>
      <ReviewBlockBar topic={topic} />
      <BackLink />
      <PageHeader
        eyebrow={
          <span className="nt-eyebrow">
            <SubjectTag subject={info.subject} size="sm" />
            <span>{info.unitName}</span>
            <span className="nt-weight" title={`考频 ${info.weight}/5`}>
              考频
              {[1, 2, 3, 4, 5].map((n) => (
                <i key={n} className={cx(n <= info.weight && 'on')} />
              ))}
            </span>
          </span>
        }
        title={info.name}
        desc={info.ja ? <span lang="ja">{info.ja}</span> : undefined}
        actions={
          drill.length > 0 ? (
            <Button variant="primary" size="lg" icon="play" onClick={startDrill}>
              练这个考点 · {drill.length} 题
            </Button>
          ) : undefined
        }
      />

      <div className="nt-layout">
        <div className="nt-main">
          {note ? (
            <article className="card nt-note">
              <RichText text={note.body} lang="zh" className="nt-note-body" />
              {note.terms && note.terms.length > 0 && <Terms terms={note.terms} title="日语关键词" />}
            </article>
          ) : (
            <Fallback info={info} items={items} unseen={unseen} />
          )}
          {note && <Traps items={items} />}
        </div>

        <aside className="nt-side">
          {items.length > 0 && <TopicStats info={info} stat={stat} items={items} state={state} />}
          {items.length > 0 && (
            <section className="card nt-items">
              <header className="nt-items-head">
                <div>
                  <h3>真题</h3>
                  <p className="faint text-xs">{items.length ? `${items.length} 道 · 没做过 ${unseen} 道` : '题库里暂时没有'}</p>
                </div>
                {drill.length > 0 && (
                  <Button size="sm" variant="soft" icon="play" onClick={startDrill}>
                    练
                  </Button>
                )}
              </header>
              {items.length > 0 && (
                <ul className="nt-item-list">
                  {items.map((it) => (
                    <ItemRow key={it.id} item={it} state={state} onOpen={setSelected} />
                  ))}
                </ul>
              )}
            </section>
          )}
          <Siblings info={info} state={state} bank={bank} />
        </aside>
      </div>
      <ItemPreview itemId={selected} ids={items.map((it) => it.id)} onSelect={setSelected} />
    </div>
  );
}

function Siblings({ info, state, bank }: { info: TopicInfo; state: AppState; bank: BankIndex }) {
  const unit = bank.bundle.taxonomy.subjects[info.subject].units.find((u) => u.id === info.unit);
  const stats = useMemo(() => topicStats(state, bank), [state, bank]);
  const list = (unit?.topics || []).filter((t) => t.id !== info.id);
  if (!list.length) return null;
  const target = targetRatio(state, info.subject);
  return (
    <section className="card nt-sibs">
      <h3 className="nt-sibs-title">同单元 · {info.unitName}</h3>
      <ul>
        {list.map((t) => {
          const st = stats.get(t.id);
          const band = masteryBand(st, target);
          const n = bank.byTopic.get(t.id)?.length ?? 0;
          return (
            <li key={t.id}>
              <a className="nt-sib" href={href('/notes/' + t.id)}>
                <span className="nt-sib-name">{shortName(t.name)}</span>
                <span className={cx('nt-band', `is-${band}`)}>{st?.attempts ? pct(st.mastery) : n ? `${n} 题` : '—'}</span>
                <Icon name="right" size={14} className="nt-sib-go" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BackLink() {
  return (
    <a className="nt-back" href={href('/notes')}>
      <Icon name="arrowLeft" size={15} />
      考点笔记
    </a>
  );
}

function TopicStats({ info, stat, items, state }: { info: TopicInfo; stat: TopicStat | undefined; items: Item[]; state: AppState }) {
  const target = targetRatio(state, info.subject);
  const band = masteryBand(stat, target);
  const att = stat?.attempts ?? 0;
  const done = items.filter((it) => (state.progress[it.id]?.attempts ?? 0) > 0).length;
  const avgTarget = items.length ? items.reduce((s, it) => s + it.targetSec, 0) / items.length : 0;
  const avgSec = att ? (stat?.seconds ?? 0) / att : 0;
  return (
    <section className="card nt-stats">
      <div className="nt-stats-top">
        <Ring value={att ? (stat?.mastery ?? 0) : 0} size={92} stroke={9} tone={BAND_TONE[band]}>
          <span className="nt-ring-num num">{att ? pct(stat?.mastery) : '—'}</span>
          <span className="nt-ring-sub">掌握</span>
        </Ring>
        <div className="nt-stats-text">
          <span className={cx('nt-band', `is-${band}`, 'is-lg')}>{BAND_TEXT[band]}</span>
          <p className="faint text-xs">目标正确率 {pct(target)}</p>
          {stat?.lastDate && <p className="faint text-xs">上次练习 {fmtDateShort(stat.lastDate)}</p>}
        </div>
      </div>
      <dl className="nt-facts">
        <div>
          <dt>做过</dt>
          <dd className="num">
            {done}
            <small>/{items.length} 题</small>
          </dd>
        </div>
        <div>
          <dt>作答</dt>
          <dd className="num">
            {att}
            <small> 次</small>
          </dd>
        </div>
        <div>
          <dt>平均用时</dt>
          <dd className={cx('num', avgTarget > 0 && avgSec > avgTarget * 1.2 && 'is-slow')}>
            {att ? fmtClock(avgSec) : '—'}
            {avgTarget > 0 && <small> / {fmtClock(avgTarget)}</small>}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function ItemRow({ item, state, onOpen }: { item: Item; state: AppState; onOpen: (id: string) => void }) {
  const p = state.progress[item.id];
  const last = useMemo(() => {
    for (let i = state.attempts.length - 1; i >= 0; i--) if (state.attempts[i].itemId === item.id) return state.attempts[i];
    return undefined;
  }, [state.attempts, item.id]);
  const kind = resultOf(last);
  return (
    <li>
      <button type="button" className="nt-item" onClick={() => onOpen(item.id)}>
        <ResultMark kind={kind} size="xs" />
        <span className="nt-item-src">{sourceLabel(item)}</span>
        <span className="nt-item-flags">
          {p?.inMistakes && <Badge tone="danger">错题本</Badge>}
          {p?.starred && <Icon name="star" size={13} className="nt-star" />}
        </span>
      </button>
    </li>
  );
}

function uniq(xs: string[]): string[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.replace(/\s+/g, '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function Fallback({ info, items, unseen }: { info: TopicInfo; items: Item[]; unseen: number }) {
  const points = uniq(items.flatMap((it) => it.explanation.keyPoints || [])).slice(0, 10);
  const terms = useMemo(() => {
    const m = new Map<string, KeyTerm>();
    for (const it of items) for (const t of it.explanation.terms || []) if (!m.has(t.ja)) m.set(t.ja, t);
    return [...m.values()].slice(0, 12);
  }, [items]);
  return (
    <>
      <section className="card nt-fallback">
        <div className="nt-fallback-head">
          <div className="nt-fallback-icon">
            <Icon name="pen" size={20} />
          </div>
          <div>
            <h3>这篇笔记还在整理</h3>
            <p className="muted text-sm">
              {items.length
                ? `先用真题把「${shortName(info.name)}」过一遍：题库里有 ${items.length} 道，${unseen === items.length ? '你都还没做过' : unseen ? `其中 ${unseen} 道还没做过` : '你都做过了'}。下面是从这些题的解析里汇总的考点。`
                : `「${shortName(info.name)}」在已收录的真题里还没出现过，考前优先级可以放低。`}
            </p>
          </div>
        </div>
      </section>

      {points.length > 0 && (
        <section className="card nt-points">
          <h3 className="nt-sec-title">
            <Icon name="target" size={16} />
            真题解析里的考点
          </h3>
          <ul>
            {points.map((p, i) => (
              <li key={i}>
                <RichText text={p} lang="zh" inline />
              </li>
            ))}
          </ul>
        </section>
      )}
      <Traps items={items} />
      {terms.length > 0 && (
        <section className="card">
          <Terms terms={terms} title="题目里的日语关键词" />
        </section>
      )}
    </>
  );
}

function Traps({ items }: { items: Item[] }) {
  const traps = uniq(items.flatMap((it) => it.explanation.traps || [])).slice(0, 8);
  if (!traps.length) return null;
  return (
    <section className="card nt-traps">
      <h3 className="nt-sec-title">
        <Icon name="alert" size={16} />
        真题里的易错点
      </h3>
      <ul>
        {traps.map((t, i) => (
          <li key={i}>
            <RichText text={t} lang="zh" inline />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Terms({ terms, title }: { terms: KeyTerm[]; title: string }) {
  return (
    <div className="nt-terms">
      <h3 className="nt-sec-title">
        <Icon name="languages" size={16} />
        {title}
      </h3>
      <div className="nt-term-grid">
        {terms.map((t) => (
          <div key={t.ja} className="nt-term">
            <span className="nt-term-ja" lang="ja">
              {t.ja}
            </span>
            {t.kana && t.kana !== t.ja && (
              <span className="nt-term-kana" lang="ja">
                {t.kana}
              </span>
            )}
            <RichText text={t.zh} lang="zh" inline className="nt-term-zh" />
          </div>
        ))}
      </div>
    </div>
  );
}

function shortName(name: string): string {
  return name.replace(/（[^）]*）/g, '');
}

// ───────────────────────── 考点速记 block from Today ─────────────────────────
// Today opens #/notes/<topic>?block=<blockId>; this bar walks through the block's topics.
function ReviewBlockBar({ topic }: { topic: string }) {
  const { state, bank } = useReady();
  const route = useRoute();
  const blockId = route.query.get('block');
  const block = blockId ? findBlock(state, blockId) : undefined;
  if (!block || !block.noteTopics?.length) return null;
  const topics = block.noteTopics;
  const i = topics.indexOf(topic);
  const next = i >= 0 && i < topics.length - 1 ? topics[i + 1] : null;
  const go = (t: string) => navigate(`/notes/${encodeURIComponent(t)}?block=${encodeURIComponent(block.id)}`);
  const finish = () => {
    update((d) => markBlock(d, block.id, 'done'));
    navigate('/');
  };
  return (
    <div className="nt-blockbar">
      <div className="nt-blockbar-title">
        <Icon name="notebook" size={16} />
        考点速记 · {i >= 0 ? i + 1 : 1} / {topics.length}
      </div>
      <div className="nt-blockbar-chips">
        {topics.map((t) => (
          <button key={t} type="button" className={cx('nt-blockbar-chip', t === topic && 'is-on')} onClick={() => go(t)}>
            {shortTopic(bank, t)}
          </button>
        ))}
      </div>
      {next ? (
        <Button size="sm" variant="primary" iconRight="arrowRight" onClick={() => go(next)}>
          下一个考点
        </Button>
      ) : (
        <Button size="sm" variant="success" icon="check" onClick={finish}>
          看完了
        </Button>
      )}
    </div>
  );
}
