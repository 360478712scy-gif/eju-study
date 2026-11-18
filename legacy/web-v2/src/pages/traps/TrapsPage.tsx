// 考前一页纸: one line per trap from every item the learner got wrong, grouped by subject;
// the other traps, key points and the original question open under a line.
import { useMemo, useState } from 'react';
import type { Item, Subject } from '@shared/types.ts';
import { findBlock, markBlock } from '@shared/actions.ts';
import { shortTopic } from '@shared/planner.ts';
import { useReady, update } from '../../lib/store.ts';
import { href, navigate, useRoute } from '../../lib/router.ts';
import { cx, SUBJECT_NAME } from '../../lib/format.ts';
import { Button, Dot, Empty, PageHeader, Segmented, Tooltip } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import { slashFractions } from '../notes/fractions.ts';
import { ItemPreview } from '../mistakes/ItemPreview.tsx';
import { sourceLabel } from '../mistakes/helpers.ts';
import './traps.css';

interface Entry {
  item: Item;
  misses: number;
  /** The line shown in the list: the first trap, or the first key point when there is no trap. */
  head: string;
  headIsTrap: boolean;
  traps: string[];
  points: string[];
}

type Filter = 'all' | Subject;

const ORDER: Subject[] = ['japanese', 'physics', 'chemistry', 'math'];
const LIMIT = 25;
// "记住了" is a per-device reading mark (like a ticked line on a printed sheet), kept in this browser only.
const KEY = 'eju.traps.remembered.v1';

function loadRemembered(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveRemembered(s: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* private mode or blocked storage: the mark just lasts for this visit */
  }
}

export function TrapsPage() {
  const { state, bank } = useReady();
  const route = useRoute();
  const blockId = route.query.get('block');
  const block = blockId ? findBlock(state, blockId) : undefined;
  const [filter, setFilter] = useState<Filter>('all');
  const [remembered, setRemembered] = useState<Set<string>>(loadRemembered);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<string | null>(null);

  const groups = useMemo(() => {
    const misses = new Map<string, number>();
    // Questions left blank when a mock ran out of time were never attempted: they are not traps.
    for (const a of state.attempts) if (!a.correct && !(a.mode === 'mock' && a.response === null)) misses.set(a.itemId, (misses.get(a.itemId) ?? 0) + 1);
    const entries: Entry[] = [];
    for (const [id, n] of misses) {
      const item = bank.byId.get(id);
      if (!item) continue;
      const traps = item.explanation.traps ?? [];
      const points = item.explanation.keyPoints ?? [];
      if (!traps.length && !points.length) continue;
      const headIsTrap = traps.length > 0;
      entries.push({
        item,
        misses: n,
        head: headIsTrap ? traps[0] : points[0],
        headIsTrap,
        traps: headIsTrap ? traps.slice(1) : [],
        points: (headIsTrap ? points : points.slice(1)).slice(0, 3),
      });
    }
    const weight = (e: Entry) => e.misses * 2 + (bank.topics.get(e.item.topic)?.weight ?? 3) + (state.progress[e.item.id]?.inMistakes ? 2 : 0);
    entries.sort((a, b) => weight(b) - weight(a));
    const top = entries.slice(0, LIMIT);
    return ORDER.map((s) => ({ subject: s, entries: top.filter((e) => e.item.subject === s) })).filter((g) => g.entries.length);
  }, [state.attempts, state.progress, bank]);

  const shown = groups.filter((g) => filter === 'all' || g.subject === filter);
  const shownEntries = shown.flatMap((g) => g.entries);
  const total = shownEntries.length;
  const left = shownEntries.filter((e) => !remembered.has(e.item.id)).length;
  const allOpen = total > 0 && shownEntries.every((e) => open.has(e.item.id));

  const toggleRemembered = (id: string) =>
    setRemembered((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveRemembered(next);
      return next;
    });
  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const finish = () => {
    if (block) update((d) => markBlock(d, block.id, 'done'));
    navigate('/');
  };

  return (
    <div className="page tp-page">
      <PageHeader
        back={block ? { label: '今日', href: href('/') } : { label: '错题本', href: href('/mistakes') }}
        title="考前一页纸"
        desc="做错过的题里最常踩的坑，考前只看这一页。"
        info={`按没答对的次数和考点频率排序，最多 ${LIMIT} 条。点一行看同一道题的其他易错点和要点；看熟了就点「记住了」，它会变淡。`}
        actions={
          block ? (
            <Button variant="success" icon="check" onClick={finish}>
              看完了
            </Button>
          ) : undefined
        }
      />
      {groups.length === 0 ? (
        <div className="card">
          <Empty icon="checkCircle" title="还没有易错点" desc="做错过的题会把它们的陷阱和要点汇总到这里。先去做几组题吧。" action={<Button onClick={() => navigate('/practice')}>去题库</Button>} />
        </div>
      ) : (
        <>
          <div className="tp-bar">
            {groups.length > 1 && (
              <Segmented<Filter>
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: '全部', count: groups.reduce((n, g) => n + g.entries.length, 0) },
                  ...groups.map((g) => ({ value: g.subject as Filter, label: SUBJECT_NAME[g.subject], count: g.entries.length })),
                ]}
              />
            )}
            <span className="tp-left">
              {left > 0 ? (
                <>
                  还剩 <b className="num">{left}</b> 条没记住
                </>
              ) : (
                <span className="tp-done">
                  <Icon name="checkCircle" size={15} />
                  {total} 条都记住了
                </span>
              )}
            </span>
            <Button variant="ghost" size="sm" icon={allOpen ? 'up' : 'down'} onClick={() => setOpen(allOpen ? new Set() : new Set(shownEntries.map((e) => e.item.id)))}>
              {allOpen ? '全部收起' : '全部展开'}
            </Button>
          </div>

          <div className="tp-groups">
            {shown.map((g) => (
              <section key={g.subject} className="tp-group">
                {filter === 'all' && groups.length > 1 && (
                  <h2 className="tp-group-title">
                    <Dot tone={g.subject} />
                    {SUBJECT_NAME[g.subject]}
                    <span className="num">{g.entries.length}</span>
                  </h2>
                )}
                <ol className="card card-flush tp-list">
                  {g.entries.map((e) => (
                    <TrapRow
                      key={e.item.id}
                      e={e}
                      topic={shortTopic(bank, e.item.topic)}
                      done={remembered.has(e.item.id)}
                      open={open.has(e.item.id)}
                      onToggle={() => toggleOpen(e.item.id)}
                      onRemember={() => toggleRemembered(e.item.id)}
                      onPreview={() => setPreview(e.item.id)}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
      <ItemPreview itemId={preview} ids={shownEntries.map((e) => e.item.id)} onSelect={setPreview} />
    </div>
  );
}

function TrapRow({
  e,
  topic,
  done,
  open,
  onToggle,
  onRemember,
  onPreview,
}: {
  e: Entry;
  topic: string;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  onRemember: () => void;
  onPreview: () => void;
}) {
  return (
    <li className={cx('tp-card', done && 'is-done', open && 'is-open')}>
      {/* The whole line opens the details; the keyboard reaches the same toggle through its button. */}
      <div
        className="tp-row"
        onClick={(ev) => {
          if ((ev.target as HTMLElement).closest('button')) return;
          onToggle();
        }}
      >
        <button type="button" className="tp-toggle" aria-expanded={open} onClick={onToggle}>
          <span className={cx('tp-lead', e.headIsTrap ? 'is-trap' : 'is-point')} aria-label={e.headIsTrap ? '易错' : '要点'} role="img">
            <Icon name={e.headIsTrap ? 'alert' : 'target'} size={15} />
          </span>
          <span className="tp-head">
            <RichText text={slashFractions(e.head)} lang="zh" inline />
          </span>
        </button>
        <span className="tp-trail">
          {/* The source line and the 记住了 toggle share one slot: hovering a line swaps them. */}
          <span className="tp-slot">
            <span className="tp-src">
              {topic}
              <span className="tp-sep">·</span>错 <span className="num">{e.misses}</span> 次
            </span>
            <Tooltip label={done ? '标成还没记住' : '看熟了就点，这一行会变淡'}>
              <button type="button" className={cx('tp-mark', done && 'is-on')} aria-pressed={done} onClick={onRemember}>
                <Icon name="check" size={14} />
                {done ? '已记住' : '记住了'}
              </button>
            </Tooltip>
          </span>
          <Icon name="down" size={16} className="tp-chev" />
        </span>
      </div>
      {open && (
        <div className="tp-detail">
          {e.traps.length > 0 && (
            <div className="tp-dgroup">
              <span className="tp-dlabel is-trap">还要当心</span>
              <ul className="tp-lines">
                {e.traps.map((t, i) => (
                  <li key={i}>
                    <RichText text={slashFractions(t)} lang="zh" inline />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {e.points.length > 0 && (
            <div className="tp-dgroup">
              <span className="tp-dlabel">该抓的要点</span>
              <ul className="tp-lines">
                {e.points.map((t, i) => (
                  <li key={i}>
                    <RichText text={slashFractions(t)} lang="zh" inline />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="tp-dfoot">
            <span className="tp-dsrc">{sourceLabel(e.item)}</span>
            <Button variant="ghost" size="sm" icon="eye" onClick={onPreview}>
              看原题
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
