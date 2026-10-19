// Searchable word list with per-skill mastery.
import { useMemo, useState } from 'react';
import type { VocabEntry, VocabProgress } from '@shared/types.ts';
import { normalizeKana } from '@shared/grading.ts';
import { useApp } from '../../lib/store.ts';
import { Icon } from '../../components/Icon.tsx';
import { Button, Empty, Segmented } from '../../components/ui.tsx';
import { Meter } from './parts.tsx';
import { hasRomaji, romajiToKana } from './kana.ts';
import { CATEGORY_LABEL, isKanaOnly, vocabGroup } from './run.ts';

type Status = 'all' | 'due' | 'weak' | 'new' | 'solid';

const PAGE = 60;

function statusOf(v: VocabEntry, p: VocabProgress | undefined, today: string): Set<Status> {
  const s = new Set<Status>(['all']);
  const kana = isKanaOnly(v.word);
  const skills = [kana ? undefined : p?.read, p?.meaning].filter((x) => !!x);
  if (!skills.length) s.add('new');
  if (skills.some((x) => x!.due <= today)) s.add('due');
  if (skills.some((x) => !x!.lastCorrect)) s.add('weak');
  if (p?.meaning && p.meaning.box >= 3 && (kana || (p.read && p.read.box >= 3))) s.add('solid');
  return s;
}

export function WordList({ onOpen }: { onOpen: (id: string) => void }) {
  const bank = useApp((s) => s.bank);
  const progress = useApp((s) => s.state?.vocab);
  const today = useApp((s) => s.today);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [topic, setTopic] = useState('all');
  const [limit, setLimit] = useState(PAGE);

  const words = bank?.bundle.vocab ?? [];

  // Filter values: "all", "c:<category>" or "g:<theme group>".
  const filters = useMemo(() => {
    const cats = new Map<VocabEntry['category'], number>();
    const groups = new Map<string, number>();
    for (const v of words) {
      cats.set(v.category, (cats.get(v.category) || 0) + 1);
      const g = vocabGroup(v);
      if (g) groups.set(g, (groups.get(g) || 0) + 1);
    }
    return { cats: [...cats.entries()], groups: [...groups.entries()] };
  }, [words]);

  const statuses = useMemo(() => {
    const m = new Map<string, Set<Status>>();
    for (const v of words) m.set(v.id, statusOf(v, progress?.[v.id], today));
    return m;
  }, [words, progress, today]);

  // Words matching the search and category/theme; the status tabs count within these.
  const scoped = useMemo(() => {
    const q = query.trim();
    const qKana = q ? normalizeKana(hasRomaji(q) ? romajiToKana(q) : q) : '';
    const kanaHit = (r: string) => !!qKana && normalizeKana(r).includes(qKana);
    const matches = (v: VocabEntry) => !q || v.word.includes(q) || v.meaningZh.includes(q) || kanaHit(v.reading) || (v.altReadings ?? []).some(kanaHit);
    return words.filter((v) => (topic === 'all' || topic === `c:${v.category}` || topic === `g:${vocabGroup(v)}`) && matches(v));
  }, [words, topic, query]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { all: 0, due: 0, weak: 0, new: 0, solid: 0 };
    for (const v of scoped) for (const k of statuses.get(v.id) ?? []) c[k]++;
    return c;
  }, [scoped, statuses]);

  const rows = useMemo(() => scoped.filter((v) => statuses.get(v.id)?.has(status)), [scoped, statuses, status]);

  return (
    <section className="vc-list-card">
      <div className="vc-list-tools">
        <label className="vc-search">
          <Icon name="search" size={16} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="搜索汉字、读音、罗马字或中文意思"
            aria-label="搜索单词"
            spellCheck={false}
          />
          {query && (
            <button type="button" className="vc-search-clear" onClick={() => setQuery('')} aria-label="清空">
              <Icon name="x" size={14} />
            </button>
          )}
        </label>
        <span className="vc-select-wrap">
        <select
          className="vc-select"
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            setLimit(PAGE);
          }}
          aria-label="类别和主题"
        >
          <option value="all">全部单词</option>
          <optgroup label="类别">
            {filters.cats.map(([c, n]) => (
              <option key={c} value={`c:${c}`}>
                {CATEGORY_LABEL[c]} · {n}
              </option>
            ))}
          </optgroup>
          {filters.groups.length > 0 && (
            <optgroup label="主题">
              {filters.groups.map(([g, n]) => (
                <option key={g} value={`g:${g}`}>
                  {g} · {n}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <Icon name="down" size={15} className="vc-select-icon" />
        </span>
      </div>
      <div className="vc-list-filters">
        <Segmented<Status>
          size="sm"
          value={status}
          onChange={(s) => {
            setStatus(s);
            setLimit(PAGE);
          }}
          options={[
            { value: 'all', label: `全部 ${counts.all}` },
            { value: 'due', label: `待复习 ${counts.due}` },
            { value: 'weak', label: `易错 ${counts.weak}` },
            { value: 'new', label: `未学 ${counts.new}` },
            { value: 'solid', label: `已稳 ${counts.solid}` },
          ]}
        />
        <span className="vc-list-legend faint">
          <span className="vc-legend-dot is-grow" />
          在学
          <span className="vc-legend-dot is-solid" />
          已稳
          <span className="vc-legend-dot is-weak" />
          上次错
        </span>
      </div>

      {rows.length === 0 ? (
        <Empty
          icon="search"
          title={query ? '没找到这个词' : '这里暂时没有词'}
          desc={query ? '换个写法试试：汉字、假名、罗马字或中文都能搜。' : '换个筛选看看，或者先开始今天的训练。'}
        />
      ) : (
        <div className="vc-list" role="list">
          <div className="vc-row vc-row-head" aria-hidden>
            <span>单词</span>
            <span>读音</span>
            <span className="vc-col-meaning">意思</span>
            <span className="vc-col-skill">读音</span>
            <span className="vc-col-skill">词义</span>
          </div>
          {rows.slice(0, limit).map((v) => {
            const p = progress?.[v.id];
            return (
              <button key={v.id} type="button" role="listitem" className="vc-row" onClick={() => onOpen(v.id)}>
                <span className="vc-row-word" lang="ja">
                  {v.word}
                </span>
                <span className="vc-row-reading" lang="ja">
                  {v.reading}
                </span>
                <span className="vc-row-meaning vc-col-meaning">{v.meaningZh}</span>
                <span className="vc-col-skill">
                  {isKanaOnly(v.word) ? (
                    <span className="vc-na" title="只用假名书写，不用练读音">
                      不用练
                    </span>
                  ) : (
                    <Meter p={p?.read} label="读音" />
                  )}
                </span>
                <span className="vc-col-skill">
                  <Meter p={p?.meaning} label="词义" />
                </span>
              </button>
            );
          })}
          {rows.length > limit && (
            <div className="vc-list-more">
              <Button variant="ghost" size="sm" icon="down" onClick={() => setLimit(limit + PAGE * 2)}>
                再显示 {Math.min(PAGE * 2, rows.length - limit)} 个（共 {rows.length}）
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
