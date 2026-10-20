// 考前一页纸: traps and key points from every item the learner got wrong, grouped by subject.
import { useMemo, useState } from 'react';
import type { Item, Subject } from '@shared/types.ts';
import { findBlock, markBlock } from '@shared/actions.ts';
import { shortTopic } from '@shared/planner.ts';
import { useReady, update } from '../../lib/store.ts';
import { navigate, useRoute } from '../../lib/router.ts';
import { cx, SUBJECT_NAME } from '../../lib/format.ts';
import { Button, Empty, Meta, PageHeader, Segmented, SubjectTag, Tooltip } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import { slashFractions } from '../notes/fractions.ts';
import './traps.css';

interface Entry {
  item: Item;
  misses: number;
  lines: string[];
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

  const groups = useMemo(() => {
    const misses = new Map<string, number>();
    // Questions left blank when a mock ran out of time were never attempted: they are not traps.
    for (const a of state.attempts) if (!a.correct && !(a.mode === 'mock' && a.response === null)) misses.set(a.itemId, (misses.get(a.itemId) ?? 0) + 1);
    const entries: Entry[] = [];
    for (const [id, n] of misses) {
      const item = bank.byId.get(id);
      if (!item) continue;
      const lines = item.explanation.traps ?? [];
      const points = item.explanation.keyPoints ?? [];
      if (!lines.length && !points.length) continue;
      entries.push({ item, misses: n, lines, points });
    }
    const weight = (e: Entry) => e.misses * 2 + (bank.topics.get(e.item.topic)?.weight ?? 3) + (state.progress[e.item.id]?.inMistakes ? 2 : 0);
    entries.sort((a, b) => weight(b) - weight(a));
    const top = entries.slice(0, LIMIT);
    return ORDER.map((s) => ({ subject: s, entries: top.filter((e) => e.item.subject === s) })).filter((g) => g.entries.length);
  }, [state.attempts, state.progress, bank]);

  const shown = groups.filter((g) => filter === 'all' || g.subject === filter);
  const total = shown.reduce((n, g) => n + g.entries.length, 0);
  const left = shown.reduce((n, g) => n + g.entries.filter((e) => !remembered.has(e.item.id)).length, 0);

  const toggle = (id: string) =>
    setRemembered((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveRemembered(next);
      return next;
    });

  const finish = () => {
    if (block) update((d) => markBlock(d, block.id, 'done'));
    navigate('/');
  };

  return (
    <div className="page tp-page">
      <PageHeader
        eyebrow="考前一页纸"
        title="我的易错点"
        desc="从做错过的题里挑出最常错、最高频的点。考前只看这一页。"
        info={`按没答对的次数和考点频率排序，最多 ${LIMIT} 条。${SUBJECT_NAME.japanese}的易错点多是读题和听力陷阱。看熟一条就勾上「记住了」，它会变淡。`}
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
            <span className="tp-legend">
              <span>
                <Icon name="alert" size={14} className="tp-ico is-trap" />
                易错陷阱
              </span>
              <span>
                <Icon name="arrowRight" size={14} className="tp-ico is-point" />
                该抓的要点
              </span>
            </span>
            <span className="tp-left">
              {left > 0 ? (
                <>
                  还剩 <b className="num">{left}</b> 条
                </>
              ) : (
                <span className="tp-done">
                  <Icon name="checkCircle" size={15} />
                  {total} 条都记住了
                </span>
              )}
            </span>
          </div>

          <div className="tp-groups">
            {shown.map((g) => (
              <section key={g.subject} className="tp-group">
                {filter === 'all' && groups.length > 1 && (
                  <h2 className="tp-group-title">
                    <SubjectTag subject={g.subject} />
                    <span className="num">{g.entries.length}</span>
                  </h2>
                )}
                <ol className="tp-list">
                  {g.entries.map((e) => (
                    <TrapCard key={e.item.id} e={e} topic={shortTopic(bank, e.item.topic)} done={remembered.has(e.item.id)} onToggle={() => toggle(e.item.id)} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TrapCard({ e, topic, done, onToggle }: { e: Entry; topic: string; done: boolean; onToggle: () => void }) {
  return (
    <li className={cx('card tp-card', done && 'is-done')}>
      <header className="tp-head">
        <div className="tp-head-text">
          <h3 className="tp-topic">{topic}</h3>
          <Meta className="tp-meta">
            <span>{e.item.source.label.replace(/（解答番号\d+）/, '')}</span>
            <span>没答对 {e.misses} 次</span>
          </Meta>
        </div>
        <Tooltip label={done ? '标成还没记住' : '记住了'}>
          <button type="button" className={cx('tp-check', done && 'is-on')} aria-pressed={done} aria-label="记住了" onClick={onToggle}>
            <Icon name="check" size={13} style={{ strokeWidth: 3 }} />
          </button>
        </Tooltip>
      </header>
      <ul className="tp-lines">
        {e.lines.map((t, i) => (
          <li key={'t' + i} className="tp-line">
            <Icon name="alert" size={14} className="tp-ico is-trap" />
            <RichText text={slashFractions(t)} lang="zh" inline />
          </li>
        ))}
        {e.points.slice(0, 2).map((t, i) => (
          <li key={'p' + i} className="tp-line is-point">
            <Icon name="arrowRight" size={14} className="tp-ico is-point" />
            <RichText text={slashFractions(t)} lang="zh" inline />
          </li>
        ))}
      </ul>
    </li>
  );
}
