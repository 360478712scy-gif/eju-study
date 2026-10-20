// 考点笔记: every taxonomy topic with mastery and note status; a topic page with the note,
// the learner's numbers on it, its real exam items and a one-click drill.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { AppState, Item, KeyTerm, Subject, TaxonomyTopic } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { topicStats, type TopicStat } from '@shared/stats.ts';
import { shortTopic } from '@shared/planner.ts';
import { useReady, update } from '../../lib/store.ts';
import { useRoute } from '../../lib/router.ts';
import { findBlock, markBlock } from '@shared/actions.ts';
import { href, navigate } from '../../lib/router.ts';
import { cx, fmtClock, fmtDateShort, pct, SUBJECT_NAME } from '../../lib/format.ts';
import {
  Button,
  Callout,
  Empty,
  IconTile,
  isModalOpen,
  List,
  ListRow,
  Meta,
  PageHeader,
  Ring,
  SearchField,
  Segmented,
  StatTile,
  SubjectTag,
  Tooltip,
  useConfirm,
  type Tone,
} from '../../components/ui.tsx';
import { Icon, type IconName } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import { ItemPreview } from '../mistakes/ItemPreview.tsx';
import { ItemMark } from '../mistakes/bits.tsx';
import { SUBJECT_ORDER, launch, sourceLabel } from '../mistakes/helpers.ts';
import { drillTitle, pickDrill, reservedFor, reservedMap } from '../practice/practiceData.ts';
import { BAND_TEXT, BAND_TONE, masteryBand, targetRatio, type Band } from '../stats/model.ts';
import { slashFractions } from './fractions.ts';
import './notes.css';

type TopicInfo = TaxonomyTopic & { subject: Subject; unit: string; unitName: string };

export function NotesPage({ topic }: { topic?: string }) {
  return topic ? <TopicView key={topic} topic={topic} /> : <NotesIndex />;
}

/** Small mastery bar (the one mastery scale) with its percentage; "未练" when never tried. */
function MasteryMini({ stat, band }: { stat: TopicStat | undefined; band: Band }) {
  const att = stat?.attempts ?? 0;
  if (!att) return <span className="nt-mini is-none">未练</span>;
  return (
    <span className={cx('nt-mini', `tone-${BAND_TONE[band]}`)}>
      <span className="nt-mini-track">
        <i style={{ width: `${Math.max(0, Math.min(1, stat?.mastery ?? 0)) * 100}%` }} />
      </span>
      <span className="nt-mini-val num">{pct(stat?.mastery)}</span>
    </span>
  );
}

function HotDot() {
  return (
    <Tooltip label="高频考点">
      <span className="nt-hot" role="img" aria-label="高频考点" />
    </Tooltip>
  );
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
      // Measured topics below target first, then never-practised ones with items (by exam weight), then the rest.
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
  const search = useRef<HTMLInputElement>(null);

  // "/" jumps to the search field (never while typing or composing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || isModalOpen()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
  const weakCount = visible.filter((e) => e.band === 'weak').length;
  const counts = useMemo(() => {
    const c: Record<SubjectFilter, number> = { all: entries.length, math: 0, physics: 0, chemistry: 0, japanese: 0 };
    for (const e of entries) c[e.info.subject] += 1;
    return c;
  }, [entries]);

  return (
    <div className="page nt-page">
      <PageHeader
        title="考点笔记"
        desc="每个考点的公式和常考套路。先看最弱的，再练真题。"
        actions={
          <SearchField
            className="nt-search"
            value={query}
            onChange={setQuery}
            placeholder="搜考点，如 电场、数列"
            kbd="/"
            inputRef={search}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !e.nativeEvent.isComposing && query) {
                e.preventDefault();
                setQuery('');
              }
            }}
          />
        }
      />

      <div className="nt-toolbar">
        <Segmented<SubjectFilter>
          size="sm"
          value={subject}
          onChange={setSubject}
          options={(['all', ...SUBJECT_ORDER] as SubjectFilter[]).map((s) => ({ value: s, label: s === 'all' ? '全部' : SUBJECT_NAME[s], count: counts[s] }))}
        />
        <Segmented<Mode>
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'units', label: '按单元', icon: 'list' },
            { value: 'weak', label: '弱项优先', icon: 'flame', count: weakCount || undefined },
          ]}
        />
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
          <section key={s} className="nt-subject">
            <header className="nt-subject-head">
              <SubjectTag subject={s} />
              <Meta>
                <span>{list.length} 个考点</span>
                <span>练过 {practised} 个</span>
              </Meta>
            </header>
            <div className="nt-units">
              {units.map((u) => (
                <div key={u.id} className="card nt-unit">
                  <div className="t-eyebrow nt-unit-name">{u.name}</div>
                  <div className="nt-rows">
                    {u.list.map((e) => (
                      <TopicRow key={e.info.id} e={e} />
                    ))}
                  </div>
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
      <p className="nt-weak-hint">按「离目标多远 × 考频」排序；没练过但有真题的考点排在已达标的前面。</p>
      <div className="nt-grid">
        {sorted.map((e) => (
          <TopicCard key={e.info.id} e={e} />
        ))}
      </div>
    </div>
  );
}

function TopicRow({ e }: { e: Entry }) {
  return (
    <a className={cx('nt-row', !e.items && !e.hasNote && 'is-thin')} href={href('/notes/' + e.info.id)}>
      <span className="nt-row-main">
        <span className="nt-row-name">
          {e.info.weight >= 4 && <HotDot />}
          <span>{e.info.name}</span>
        </span>
        <span className="nt-row-sub">
          {e.info.ja && <span lang="ja">{e.info.ja}</span>}
          <span>{e.items ? `${e.items} 题` : '暂无真题'}</span>
          {!e.hasNote && <span>笔记待补</span>}
        </span>
      </span>
      <MasteryMini stat={e.stat} band={e.band} />
    </a>
  );
}

function TopicCard({ e }: { e: Entry }) {
  const att = e.stat?.attempts ?? 0;
  return (
    <a className={cx('card card-interactive nt-card', !e.items && !e.hasNote && 'is-thin')} href={href('/notes/' + e.info.id)}>
      <div className="nt-card-top">
        <SubjectTag subject={e.info.subject} size="sm" />
        {e.info.weight >= 4 && <HotDot />}
        {att > 0 && <span className={cx('nt-band', 'nt-card-band', `is-${e.band}`)}>{BAND_TEXT[e.band]}</span>}
      </div>
      <div className="nt-card-name">{e.info.name}</div>
      {e.info.ja && (
        <div className="nt-card-ja" lang="ja">
          {e.info.ja}
        </div>
      )}
      <div className="nt-card-bottom">
        <MasteryMini stat={e.stat} band={e.band} />
        <Meta className="nt-card-meta">
          <span>{e.items ? `${e.items} 题` : '暂无真题'}</span>
          {att > 0 && <span>做过 {att} 次</span>}
        </Meta>
      </div>
    </a>
  );
}

// ───────────────────────── Topic page ─────────────────────────

const DRILL_SIZE = 10;

function TopicView({ topic }: { topic: string }) {
  const { state, bank, today } = useReady();
  const route = useRoute();
  const top = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const confirm = useConfirm();
  const info = bank.topics.get(topic);
  const note = bank.notesByTopic.get(topic);
  const blockId = route.query.get('block');
  const block = blockId ? findBlock(state, blockId) : undefined;
  const inBlock = !!block?.noteTopics?.length;
  const items = useMemo(
    () => [...(bank.byTopic.get(topic) || [])].sort((a, b) => (b.source.session || '').localeCompare(a.source.session || '') || (a.order ?? 0) - (b.order ?? 0)),
    [bank, topic],
  );
  const stat = useMemo(() => topicStats(state, bank).get(topic), [state, bank, topic]);
  // Same pick as the practice page: papers held for a scheduled mock only when nothing else is left.
  const reserved = useMemo(() => reservedMap(state, bank), [state, bank]);
  const pick = useMemo(() => pickDrill(state, bank.byTopic.get(topic) || [], DRILL_SIZE, reserved, today + topic), [state, bank, topic, reserved, today]);

  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' });
  }, []);

  if (!info) {
    return (
      <div className="page nt-page" ref={top}>
        <PageHeader back={{ label: '考点笔记', href: href('/notes') }} title="没找到这个考点" />
        <div className="card">
          <Empty icon="search" title="这个考点可能改名或合并了" desc="回到考点列表，用搜索找找看。" action={<Button onClick={() => navigate('/notes')}>回到考点笔记</Button>} />
        </div>
      </div>
    );
  }

  const unseen = items.filter((it) => !state.progress[it.id]?.attempts).length;
  const drillCount = pick.ids.length;
  const startDrill = async () => {
    if (!drillCount) return;
    const picked = pick.ids.map((id) => bank.byId.get(id)).filter((it): it is Item => !!it);
    if (pick.usesReserved) {
      const held = picked.map((it) => reservedFor(reserved, it)).find(Boolean);
      const ok = await confirm.ask('剩下的题都在模考预留卷里', {
        body: held ? `${fmtDateShort(held.date)}「${held.title}」会用到这些题。现在练了，到时模考分数会偏高。` : '现在练了，之后的模考分数会偏高。',
        ok: '仍然练习',
      });
      if (!ok) return;
    }
    launch({ kind: 'drill', title: drillTitle(bank, topic, picked.length), items: picked });
  };
  const drillHint = pick.usesReserved ? '剩下的题都在模考预留卷里' : '没做过的优先，其次是错题';

  return (
    <div className="page nt-page nt-topic" ref={top}>
      {inBlock && block && <ReviewBlockBar topic={topic} blockId={block.id} topics={block.noteTopics!} />}
      <PageHeader
        back={{ label: '考点笔记', href: href('/notes') }}
        eyebrow={
          <span className="nt-eyebrow">
            <SubjectTag subject={info.subject} size="sm" />
            <span>{info.unitName}</span>
            <Tooltip label={`考频 ${info.weight}/5`}>
              <span className="nt-weight" aria-label={`考频 ${info.weight}/5`}>
                考频
                {[1, 2, 3, 4, 5].map((n) => (
                  <i key={n} className={cx(n <= info.weight && 'on')} />
                ))}
              </span>
            </Tooltip>
          </span>
        }
        title={info.name}
        desc={info.ja ? <span lang="ja">{info.ja}</span> : undefined}
        actions={
          drillCount > 0 ? (
            <Tooltip label={drillHint}>
              <Button variant={inBlock ? 'secondary' : 'primary'} size="lg" icon={pick.usesReserved ? 'flag' : 'play'} onClick={() => void startDrill()}>
                练这个考点 · {drillCount} 题
              </Button>
            </Tooltip>
          ) : undefined
        }
      />

      <div className="nt-layout">
        <div className="nt-main">
          {note ? (
            <article className="card nt-note">
              <NoteBody body={note.body} subject={info.subject} />
              {note.terms && note.terms.length > 0 && (
                <section className="nt-sec">
                  <Terms terms={note.terms} title="日语关键词" />
                </section>
              )}
            </article>
          ) : (
            <Fallback info={info} items={items} unseen={unseen} />
          )}
          {note && <Traps items={items} />}
        </div>

        <aside className="nt-side">
          {items.length > 0 && <TopicStats info={info} stat={stat} items={items} state={state} />}
          {items.length > 0 && (
            <section className="card card-flush nt-items">
              <header className="nt-items-head">
                <div>
                  <h3 className="card-title">真题</h3>
                  <p className="card-sub">
                    {items.length} 道 · 没做过 {unseen} 道
                  </p>
                </div>
                {drillCount > 0 && (
                  <Tooltip label={drillHint}>
                    <Button size="sm" variant="ghost" icon={pick.usesReserved ? 'flag' : 'play'} onClick={() => void startDrill()}>
                      练 {drillCount} 题
                    </Button>
                  </Tooltip>
                )}
              </header>
              <List className="nt-item-list">
                {items.map((it) => (
                  <ItemRow key={it.id} item={it} state={state} onOpen={setSelected} />
                ))}
              </List>
            </section>
          )}
          <Siblings info={info} state={state} bank={bank} />
        </aside>
      </div>
      <ItemPreview itemId={selected} ids={items.map((it) => it.id)} onSelect={setSelected} />
      {confirm.node}
    </div>
  );
}

// ── The note: sections from the "**标题**" lines, 30 秒自检 as reveal rows ──

interface NoteSection {
  title: string;
  body: string;
}

function splitSections(body: string): NoteSection[] {
  const chunks = body.replace(/\r\n?/g, '\n').trim().split(/\n[ \t]*\n/);
  const out: NoteSection[] = [];
  for (const chunk of chunks) {
    const head = /^\*\*([^*\n]+)\*\*$/.exec(chunk.trim());
    if (head) out.push({ title: head[1].trim(), body: '' });
    else if (out.length) out[out.length - 1].body += (out[out.length - 1].body ? '\n\n' : '') + chunk;
    else out.push({ title: '', body: chunk });
  }
  return out.filter((s) => s.title || s.body.trim());
}

function sectionLook(title: string, subject: Subject): { icon: IconName; tone: Tone } {
  if (/自检|自测/.test(title)) return { icon: 'checkCircle', tone: 'success' };
  if (/易错|陷阱|注意/.test(title)) return { icon: 'alert', tone: 'warning' };
  if (/怎么考|考法|题型|出题/.test(title)) return { icon: 'target', tone: subject };
  return { icon: 'bulb', tone: subject };
}

interface QA {
  q: string;
  a: string;
}

/** "- Q：… → A：…" list items. Null when any line does not follow the pattern. */
function parseQA(body: string): QA[] | null {
  const lines = body.split('\n').filter((l) => l.trim());
  if (!lines.length || !lines.every((l) => /^\s*-\s+/.test(l))) return null;
  const out: QA[] = [];
  for (const l of lines) {
    const m = /^\s*-\s+(?:Q[：:]\s*)?(.+?)\s*→\s*A[：:]\s*(.+)$/.exec(l);
    if (!m) return null;
    out.push({ q: m[1], a: m[2] });
  }
  return out;
}

function NoteBody({ body, subject }: { body: string; subject: Subject }) {
  const sections = useMemo(() => splitSections(slashFractions(body)), [body]);
  return (
    <>
      {sections.map((s, i) => {
        const look = sectionLook(s.title, subject);
        const qa = /自检|自测/.test(s.title) ? parseQA(s.body) : null;
        return (
          <section key={i} className="nt-sec">
            {s.title && !qa && (
              <h3 className="nt-sec-title">
                <Icon name={look.icon} size={17} className={`nt-sec-icon tone-${look.tone}`} />
                {s.title}
              </h3>
            )}
            {qa ? <SelfCheck title={s.title} items={qa} /> : <RichText text={s.body} lang="zh" className="nt-prose" />}
          </section>
        );
      })}
    </>
  );
}

function SelfCheck({ title, items }: { title: string; items: QA[] }) {
  const [open, setOpen] = useState<boolean[]>(() => items.map(() => false));
  const all = open.every(Boolean);
  const toggle = (i: number) => setOpen((o) => o.map((v, j) => (j === i ? !v : v)));
  return (
    <>
      <div className="nt-sec-head">
        <h3 className="nt-sec-title">
          <Icon name="checkCircle" size={17} className="nt-sec-icon tone-success" />
          {title}
        </h3>
        <Button size="sm" variant="ghost" onClick={() => setOpen(items.map(() => !all))}>
          {all ? '全部收起' : '全部显示'}
        </Button>
      </div>
      <ol className="nt-qa-list">
        {items.map((it, i) => (
          <li
            key={i}
            className={cx('nt-qa', open[i] && 'is-open')}
            tabIndex={0}
            aria-label={`第 ${i + 1} 题，按空格${open[i] ? '收起' : '显示'}答案`}
            onKeyDown={(e: ReactKeyboardEvent<HTMLLIElement>) => {
              if (e.target !== e.currentTarget || e.nativeEvent.isComposing) return;
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                toggle(i);
              }
            }}
          >
            <div className="nt-qa-row">
              <span className="nt-qa-n num">{i + 1}</span>
              <RichText text={it.q} lang="zh" inline className="nt-qa-q" />
              <Button size="sm" variant="ghost" className="nt-qa-btn" tabIndex={-1} icon={open[i] ? 'eyeOff' : 'eye'} onClick={() => toggle(i)}>
                {open[i] ? '收起' : '显示答案'}
              </Button>
            </div>
            {open[i] && (
              <div className="nt-qa-a">
                <RichText text={it.a} lang="zh" inline />
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="nt-qa-hint">先在心里答，再看答案。选中一行按空格也能翻开。</p>
    </>
  );
}

function Siblings({ info, state, bank }: { info: TopicInfo; state: AppState; bank: BankIndex }) {
  const unit = bank.bundle.taxonomy.subjects[info.subject].units.find((u) => u.id === info.unit);
  const stats = useMemo(() => topicStats(state, bank), [state, bank]);
  const list = (unit?.topics || []).filter((t) => t.id !== info.id);
  if (!list.length) return null;
  const target = targetRatio(state, info.subject);
  return (
    <section className="card card-flush nt-sibs">
      <header className="nt-items-head">
        <div>
          <h3 className="card-title">同单元</h3>
          <p className="card-sub">{info.unitName}</p>
        </div>
      </header>
      <List>
        {list.map((t) => {
          const st = stats.get(t.id);
          const band = masteryBand(st, target);
          const n = bank.byTopic.get(t.id)?.length ?? 0;
          return (
            <ListRow
              key={t.id}
              href={href('/notes/' + t.id)}
              title={shortName(t.name)}
              trail={st?.attempts ? <span className={cx('nt-band', `is-${band}`, 'num')}>{pct(st.mastery)}</span> : <span className="faint">{n ? `${n} 题` : '—'}</span>}
              chevron
            />
          );
        })}
      </List>
    </section>
  );
}

function TopicStats({ info, stat, items, state }: { info: TopicInfo; stat: TopicStat | undefined; items: Item[]; state: AppState }) {
  const target = targetRatio(state, info.subject);
  const band = masteryBand(stat, target);
  const att = stat?.attempts ?? 0;
  const done = items.filter((it) => (state.progress[it.id]?.attempts ?? 0) > 0).length;
  const avgTarget = items.length ? items.reduce((s, it) => s + it.targetSec, 0) / items.length : 0;
  const avgSec = att ? (stat?.seconds ?? 0) / att : 0;
  const slow = avgTarget > 0 && avgSec > avgTarget * 1.2;
  return (
    <section className="card nt-stats">
      <div className="nt-stats-top">
        <Ring value={att ? (stat?.mastery ?? 0) : 0} size={84} stroke={8} tone={BAND_TONE[band]}>
          <span className="nt-ring-num num">{att ? pct(stat?.mastery) : '—'}</span>
        </Ring>
        <div className="nt-stats-text">
          <span className="t-eyebrow">掌握度</span>
          <span className={cx('nt-band', `is-${band}`, 'is-lg')}>{BAND_TEXT[band]}</span>
          <span className="nt-stats-sub">
            目标 {pct(target)}
            {stat?.lastDate && ` · 上次 ${fmtDateShort(stat.lastDate)}`}
          </span>
        </div>
      </div>
      <div className="nt-facts">
        <StatTile label="做过" value={done} unit={`/ ${items.length} 题`} />
        <StatTile label="作答" value={att} unit="次" />
        <StatTile label="平均用时" value={att ? fmtClock(avgSec) : '—'} unit={avgTarget > 0 ? `/ ${fmtClock(avgTarget)}` : undefined} tone={slow ? 'warning' : undefined} />
      </div>
    </section>
  );
}

function ItemRow({ item, state, onOpen }: { item: Item; state: AppState; onOpen: (id: string) => void }) {
  const p = state.progress[item.id];
  return (
    <ListRow
      className="nt-item"
      onClick={() => onOpen(item.id)}
      lead={<ItemMark p={p} />}
      title={sourceLabel(item)}
      trail={p?.starred ? <Icon name="star" size={13} className="nt-star" /> : undefined}
    />
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
        <IconTile icon="pen" size="md" />
        <div>
          <h3 className="card-title">这篇笔记还在整理</h3>
          <p className="nt-fallback-text">
            {items.length
              ? `先用真题把「${shortName(info.name)}」过一遍：题库里有 ${items.length} 道，${unseen === items.length ? '你都还没做过' : unseen ? `其中 ${unseen} 道还没做过` : '你都做过了'}。下面是从这些题的解析里汇总的考点。`
              : `「${shortName(info.name)}」在已收录的真题里还没出现过，考前优先级可以放低。`}
          </p>
        </div>
      </section>

      {points.length > 0 && (
        <section className="card nt-points">
          <h3 className="nt-sec-title">
            <Icon name="target" size={17} className={`nt-sec-icon tone-${info.subject}`} />
            真题解析里的考点
          </h3>
          <ul className="nt-list">
            {points.map((p, i) => (
              <li key={i}>
                <RichText text={slashFractions(p)} lang="zh" inline />
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
    <Callout tone="warning" icon="alert" title="真题里的易错点" className="nt-traps">
      <ul className="nt-list">
        {traps.map((t, i) => (
          <li key={i}>
            <RichText text={slashFractions(t)} lang="zh" inline />
          </li>
        ))}
      </ul>
    </Callout>
  );
}

function Terms({ terms, title }: { terms: KeyTerm[]; title: string }) {
  return (
    <div className="nt-terms">
      <h3 className="nt-sec-title">
        <Icon name="languages" size={17} className="nt-sec-icon tone-japanese" />
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
function ReviewBlockBar({ topic, blockId, topics }: { topic: string; blockId: string; topics: string[] }) {
  const { bank } = useReady();
  const i = topics.indexOf(topic);
  const next = i >= 0 && i < topics.length - 1 ? topics[i + 1] : null;
  const go = (t: string) => navigate(`/notes/${encodeURIComponent(t)}?block=${encodeURIComponent(blockId)}`);
  const finish = () => {
    update((d) => markBlock(d, blockId, 'done'));
    navigate('/');
  };
  return (
    <div className="card nt-blockbar">
      <div className="nt-blockbar-title">
        <IconTile icon="notebook" tone="primary" />
        <span>
          考点速记 <span className="num faint">{i >= 0 ? i + 1 : 1} / {topics.length}</span>
        </span>
      </div>
      <Segmented<string> size="sm" className="nt-blockbar-chips" value={topic} onChange={go} options={topics.map((t) => ({ value: t, label: shortTopic(bank, t) }))} />
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
