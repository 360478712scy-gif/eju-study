// 题目: filterable, searchable list of one subject's items; click opens the preview.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SUBJECTS, type Item, type Subject } from '@shared/types.ts';
import { sessionLabel } from '@shared/bank.ts';
import { useReady } from '../../lib/store.ts';
import { cx, SUBJECT_NAME } from '../../lib/format.ts';
import { Badge, Button, Empty, modalDepth, Segmented } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import {
  buildSearchIndex,
  excerpt,
  isWrong,
  itemStatus,
  matches,
  queryTerms,
  reservedFor,
  SECTIONS,
  sectionOf,
  sessionRank,
  shortLabel,
  snippet,
  type ReservedMap,
} from './practiceData.ts';
import type { BankIndex } from '@shared/bank.ts';

type Filter = 'all' | 'new' | 'wrong' | 'starred';
const PAGE = 30;

const indexCache = new WeakMap<BankIndex, Map<string, string>>();
function searchIndex(bank: BankIndex) {
  let idx = indexCache.get(bank);
  if (!idx) {
    idx = buildSearchIndex(bank);
    indexCache.set(bank, idx);
  }
  return idx;
}

/** Newest papers first; papers held for a scheduled mock go last so they are not spoiled. */
function sortItems(items: Item[], reserved: ReservedMap): Item[] {
  const secRank = (it: Item) => SECTIONS.findIndex((s) => s.key === sectionOf(it));
  const held = (it: Item) => (reservedFor(reserved, it) ? 1 : 0);
  return [...items].sort(
    (a, b) => held(a) - held(b) || sessionRank(b.source.session) - sessionRank(a.source.session) || secRank(a) - secRank(b) || (a.order ?? 0) - (b.order ?? 0),
  );
}

export function ItemsView({
  subject,
  topic,
  reserved,
  onTopic,
  onSubject,
  onPreview,
}: {
  subject: Subject;
  topic: string | null;
  reserved: ReservedMap;
  onTopic: (t: string | null) => void;
  onSubject: (s: Subject) => void;
  onPreview: (id: string) => void;
}) {
  const { state, bank } = useReady();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const terms = useMemo(() => queryTerms(query), [query]);
  const index = searchIndex(bank);

  const units = bank.bundle.taxonomy.subjects[subject].units;
  const validTopic = topic && bank.topics.get(topic)?.subject === subject ? topic : null;

  const base = useMemo(() => {
    const list = validTopic ? bank.byTopic.get(validTopic) || [] : bank.bySubject[subject];
    return sortItems(
      list.filter((it) => matches(index, it.id, terms)),
      reserved,
    );
  }, [bank, subject, validTopic, index, terms, reserved]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: base.length, new: 0, wrong: 0, starred: 0 };
    for (const it of base) {
      const p = state.progress[it.id];
      if (itemStatus(p) === 'new') c.new++;
      if (isWrong(p)) c.wrong++;
      if (p?.starred) c.starred++;
    }
    return c;
  }, [base, state.progress]);

  const results = useMemo(
    () =>
      base.filter((it) => {
        const p = state.progress[it.id];
        if (filter === 'new') return itemStatus(p) === 'new';
        if (filter === 'wrong') return isWrong(p);
        if (filter === 'starred') return !!p?.starred;
        return true;
      }),
    [base, filter, state.progress],
  );

  const elsewhere = useMemo(() => {
    if (!terms.length || base.length) return [];
    return SUBJECTS.filter((s) => s !== subject)
      .map((s) => ({ s, n: bank.bySubject[s].filter((it) => matches(index, it.id, terms)).length }))
      .filter((x) => x.n > 0);
  }, [terms, base.length, subject, bank, index]);

  useEffect(() => setLimit(PAGE), [subject, validTopic, filter, query]);

  const shown = results.slice(0, limit);

  return (
    <div className="pr-items">
      <div className="pr-filters">
        <Segmented<Filter>
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: <FilterLabel text="全部" n={counts.all} /> },
            { value: 'new', label: <FilterLabel text="未做" n={counts.new} /> },
            { value: 'wrong', label: <FilterLabel text="做错" n={counts.wrong} /> },
            { value: 'starred', label: <FilterLabel text="收藏" n={counts.starred} /> },
          ]}
        />
        <label className="pr-select">
          <Icon name="layers" size={14} />
          <select value={validTopic || ''} onChange={(e) => onTopic(e.target.value || null)} aria-label="考点">
            <option value="">全部考点</option>
            {units.map((u) => (
              <optgroup key={u.id} label={u.name}>
                {u.topics
                  .filter((t) => (bank.byTopic.get(t.id) || []).length > 0)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <Icon name="down" size={14} className="pr-select-caret" />
        </label>
        <SearchBox onSearch={setQuery} />
      </div>

      {shown.length > 0 ? (
        <div className="pr-list">
          {shown.map((it) => (
            <ItemRow key={it.id} item={it} terms={terms} reserved={!!reservedFor(reserved, it)} onOpen={() => onPreview(it.id)} />
          ))}
          {results.length > limit && (
            <div className="pr-more">
              <Button variant="secondary" size="sm" icon="down" onClick={() => setLimit((l) => l + PAGE)}>
                再显示 {Math.min(PAGE, results.length - limit)} 题
              </Button>
              <span className="faint text-sm num">
                {limit} / {results.length}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="pr-list pr-list-empty">
          <EmptyState
            filter={filter}
            query={query}
            subject={subject}
            topicName={validTopic ? bank.topics.get(validTopic)?.name : undefined}
            elsewhere={elsewhere}
            onSubject={onSubject}
            onClearTopic={() => onTopic(null)}
            onAll={() => setFilter('all')}
          />
        </div>
      )}
    </div>
  );
}

function FilterLabel({ text, n }: { text: string; n: number }) {
  return (
    <span className="pr-filter-label">
      {text}
      <span className="num pr-filter-n">{n}</span>
    </span>
  );
}

function SearchBox({ onSearch }: { onSearch: (q: string) => void }) {
  const [text, setText] = useState('');
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const schedule = (v: string, delay = 200) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(v.trim()), delay);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (modalDepth() > 0) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className="pr-search">
      <Icon name="search" size={15} />
      <input
        ref={input}
        type="search"
        value={text}
        placeholder="搜题干、解析、考点…"
        aria-label="搜索题目"
        onChange={(e) => {
          setText(e.target.value);
          const native = e.nativeEvent as InputEvent;
          if (!composing.current && !native.isComposing) schedule(e.target.value);
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          schedule(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !e.nativeEvent.isComposing && text) {
            e.stopPropagation();
            setText('');
            schedule('', 0);
          }
        }}
      />
      {text ? (
        <button
          type="button"
          className="pr-search-clear"
          aria-label="清空搜索"
          onClick={() => {
            setText('');
            schedule('', 0);
            input.current?.focus();
          }}
        >
          <Icon name="x" size={13} />
        </button>
      ) : (
        <kbd className="pr-search-kbd">/</kbd>
      )}
    </div>
  );
}

function ItemRow({ item: it, terms, reserved, onOpen }: { item: Item; terms: string[]; reserved: boolean; onOpen: () => void }) {
  const { state, bank } = useReady();
  const p = state.progress[it.id];
  const st = itemStatus(p);
  const ex = useMemo(() => excerpt(bank, it, terms), [bank, it, terms]);
  const text = useMemo(() => snippet(it), [it]);
  const topic = bank.topics.get(it.topic);
  return (
    <button type="button" className="pr-item" onClick={onOpen}>
      <span className={cx('pr-status', `is-${st}`)} aria-label={st === 'new' ? '没做过' : st === 'right' ? '上次答对' : '上次答错'}>
        {st === 'right' ? <Icon name="check" size={13} /> : st === 'wrong' ? <Icon name="x" size={13} /> : null}
      </span>
      <span className="pr-item-main">
        <span className="pr-item-head">
          <span className="pr-item-src">
            {it.source.session ? sessionLabel(it.source.session) + ' · ' : ''}
            {shortLabel(it)}
          </span>
          {topic && <span className="pr-item-topic">{topic.name}</span>}
        </span>
        <span className="pr-item-snippet">
          <RichText text={text} lang="ja" inline />
        </span>
        {ex && (
          <span className="pr-item-ex">
            <span className="pr-item-ex-label">{ex.label}</span>
            {ex.before}
            <mark>{ex.hit}</mark>
            {ex.after}
          </span>
        )}
      </span>
      <span className="pr-item-side">
        {p?.starred && <Icon name="star" size={14} className="pr-star-on" title="已收藏" />}
        {it.audio && <Icon name="headphones" size={14} title="听力" />}
        {it.figures && it.figures.length > 0 && <Icon name="image" size={14} title="有图" />}
        {reserved && (
          <Badge tone="warning" icon="flag">
            模考预留
          </Badge>
        )}
        {p?.inMistakes && <Badge tone="danger">错题本</Badge>}
        <Icon name="right" size={16} className="pr-item-go" />
      </span>
    </button>
  );
}

function EmptyState({
  filter,
  query,
  subject,
  topicName,
  elsewhere,
  onSubject,
  onClearTopic,
  onAll,
}: {
  filter: Filter;
  query: string;
  subject: Subject;
  topicName?: string;
  elsewhere: { s: Subject; n: number }[];
  onSubject: (s: Subject) => void;
  onClearTopic: () => void;
  onAll: () => void;
}) {
  if (query) {
    return (
      <Empty
        icon="search"
        title={`${SUBJECT_NAME[subject]}${topicName ? `「${topicName}」` : ''}里没有找到「${query}」`}
        desc={elsewhere.length ? '其他科目里有：' : '换个关键词试试，日文、中文、考点名都能搜。'}
        action={
          elsewhere.length ? (
            <div className="row">
              {elsewhere.map((x) => (
                <Button key={x.s} variant="secondary" size="sm" onClick={() => onSubject(x.s)}>
                  {SUBJECT_NAME[x.s]} · {x.n} 题
                </Button>
              ))}
            </div>
          ) : topicName ? (
            <Button variant="secondary" size="sm" onClick={onClearTopic}>
              在全部考点里搜
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (filter === 'starred') {
    return <Empty icon="star" title="还没有收藏的题" desc="打开任意一道题，点左下角的「收藏」，之后在这里集中复习。" action={<Button size="sm" onClick={onAll}>看全部题目</Button>} />;
  }
  if (filter === 'wrong') {
    return <Empty icon="checkCircle" title={topicName ? `「${topicName}」没有错题` : '这一科目前没有错题'} desc="保持住。做错的题会自动出现在这里和错题本里。" action={<Button size="sm" onClick={onAll}>看全部题目</Button>} />;
  }
  if (filter === 'new') {
    return <Empty icon="award" title="这里的题都做过了" desc="可以切到「做错」重做错题，或者换个考点。" action={<Button size="sm" onClick={onAll}>看全部题目</Button>} />;
  }
  return <Empty title="这个考点暂时没有题目" action={topicName ? <Button size="sm" onClick={onClearTopic}>看全部考点</Button> : undefined} />;
}
