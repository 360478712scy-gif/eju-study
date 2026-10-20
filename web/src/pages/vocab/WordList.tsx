// Searchable word list with per-skill mastery.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VocabEntry, VocabProgress } from '@shared/types.ts';
import { normalizeKana } from '@shared/grading.ts';
import { useApp } from '../../lib/store.ts';
import { Icon } from '../../components/Icon.tsx';
import { Button, Dot, Empty, isModalOpen, Legend, SearchField, Segmented, Tooltip } from '../../components/ui.tsx';
import { Meter } from './parts.tsx';
import { hasRomaji, romajiToKana } from './kana.ts';
import { vocabSkills } from '@shared/planner.ts';
import { CATEGORY_LABEL, gloss, noReadReason, SKILL_TONE, vocabGroup } from './run.ts';

type Status = 'all' | 'due' | 'weak' | 'new' | 'solid';

const PAGE = 60;

function statusOf(v: VocabEntry, p: VocabProgress | undefined, today: string): Set<Status> {
  const s = new Set<Status>(['all']);
  const skills = vocabSkills(v).map((k) => p?.[k]);
  const seen = skills.filter((x) => !!x);
  if (!seen.length) s.add('new');
  if (seen.some((x) => x!.due <= today)) s.add('due');
  if (seen.some((x) => !x!.lastCorrect)) s.add('weak');
  if (skills.every((x) => x && x.box >= 3)) s.add('solid');
  return s;
}

/** Due cards of a word (读音 and 词义 count separately), the same rule as the engine's vocabDueCount. */
function dueCardsOf(v: VocabEntry, p: VocabProgress | undefined, today: string): number {
  return vocabSkills(v).filter((k) => !!p?.[k] && p[k]!.due <= today).length;
}

export function WordList({ onOpen }: { onOpen: (id: string) => void }) {
  const bank = useApp((s) => s.bank);
  const progress = useApp((s) => s.state?.vocab);
  const today = useApp((s) => s.today);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [topic, setTopic] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" jumps to the search field (not while typing somewhere or in a modal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || isModalOpen()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  // Words per tab; 待复习 counts cards, like the hero above, Today and Stats.
  const counts = useMemo(() => {
    const c: Record<Status, number> = { all: 0, due: 0, weak: 0, new: 0, solid: 0 };
    for (const v of scoped) for (const k of statuses.get(v.id) ?? []) if (k !== 'due') c[k]++;
    for (const v of scoped) c.due += dueCardsOf(v, progress?.[v.id], today);
    return c;
  }, [scoped, statuses, progress, today]);

  const rows = useMemo(() => scoped.filter((v) => statuses.get(v.id)?.has(status)), [scoped, statuses, status]);

  return (
    <section className="card card-flush vc-list-card">
      <div className="vc-list-tools">
        <SearchField
          className="vc-search"
          value={query}
          onChange={(q) => {
            setQuery(q);
            setLimit(PAGE);
          }}
          placeholder="搜索汉字、读音、罗马字或中文意思"
          kbd="/"
          inputRef={searchRef}
        />
        {/* The shared field look, with optgroups (类别 / 主题) that <Select> does not take. */}
        <label className="field field-select vc-topic">
          <Icon name="filter" size={15} />
          <select
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
          <Icon name="down" size={14} className="field-chevron" />
        </label>
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
            { value: 'all', label: '全部', count: counts.all },
            { value: 'due', label: '待复习', count: counts.due },
            { value: 'weak', label: '上次答错', count: counts.weak },
            { value: 'new', label: '未学', count: counts.new },
            { value: 'solid', label: '已稳', count: counts.solid },
          ]}
        />
        {status === 'due' && rows.length > 0 ? (
          <span className="vc-list-unit">
            {rows.length} 个词 · 读音和词义各算一张卡
          </span>
        ) : (
          <Legend
            className="vc-list-legend"
            items={[
              { label: '已稳', tone: 'success', shape: 'bar' },
              { label: '上次答错', tone: 'warning', shape: 'bar' },
            ]}
          />
        )}
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
            <span>假名</span>
            <span className="vc-col-meaning">意思</span>
            <span className="vc-col-skill">
              <Dot tone={SKILL_TONE.read} size="sm" />
              读音
            </span>
            <span className="vc-col-skill">
              <Dot tone={SKILL_TONE.meaning} size="sm" />
              词义
            </span>
          </div>
          {rows.slice(0, limit).map((v) => {
            const p = progress?.[v.id];
            const noRead = noReadReason(v);
            return (
              <button key={v.id} type="button" role="listitem" className="vc-row" onClick={() => onOpen(v.id)}>
                <span className="vc-row-word" lang="ja">
                  {v.word}
                </span>
                <span className="vc-row-reading" lang="ja">
                  {v.reading}
                </span>
                <span className="vc-row-meaning vc-col-meaning">{gloss(v.meaningZh)}</span>
                <span className="vc-col-skill">
                  {noRead ? (
                    <Tooltip label={noRead}>
                      <span className="vc-na">只考词义</span>
                    </Tooltip>
                  ) : (
                    <Meter p={p?.read} skill="read" label="读音" />
                  )}
                </span>
                <span className="vc-col-skill">
                  <Meter p={p?.meaning} skill="meaning" label="词义" />
                </span>
              </button>
            );
          })}
          {rows.length > limit && (
            <div className="vc-list-more">
              <Button variant="ghost" size="sm" icon="down" onClick={() => setLimit(limit + PAGE * 2)}>
                再显示 {Math.min(PAGE * 2, rows.length - limit)} 个（共 {rows.length} 个词）
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
