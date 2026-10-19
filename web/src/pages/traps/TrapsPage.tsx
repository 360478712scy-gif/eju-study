// 考前一页纸: traps and key points from every item the learner got wrong, grouped by subject.
import { useMemo } from 'react';
import type { Item, Subject } from '@shared/types.ts';
import { findBlock, markBlock } from '@shared/actions.ts';
import { shortTopic } from '@shared/planner.ts';
import { useReady, update } from '../../lib/store.ts';
import { navigate, useRoute } from '../../lib/router.ts';
import { SUBJECT_NAME } from '../../lib/format.ts';
import { Button, Empty, PageHeader, SubjectTag } from '../../components/ui.tsx';
import { RichText } from '../../components/RichText.tsx';
import './traps.css';

interface Entry {
  item: Item;
  misses: number;
  lines: string[];
  points: string[];
}

const ORDER: Subject[] = ['japanese', 'physics', 'chemistry', 'math'];
const LIMIT = 25;

export function TrapsPage() {
  const { state, bank } = useReady();
  const route = useRoute();
  const blockId = route.query.get('block');
  const block = blockId ? findBlock(state, blockId) : undefined;

  const groups = useMemo(() => {
    const misses = new Map<string, number>();
    for (const a of state.attempts) if (!a.correct) misses.set(a.itemId, (misses.get(a.itemId) ?? 0) + 1);
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

  const finish = () => {
    if (block) update((d) => markBlock(d, block.id, 'done'));
    navigate('/');
  };

  return (
    <div className="page tp-page">
      <PageHeader
        eyebrow="考前一页纸"
        title="我的易错点"
        desc="从你做错过的题里挑出最常错、最高频的考点，按科目排好。考前只看这一页，不做新题。"
        actions={
          block ? (
            <Button variant="success" icon="check" onClick={finish}>
              看完了
            </Button>
          ) : undefined
        }
      />
      {groups.length === 0 ? (
        <Empty icon="checkCircle" title="还没有错题" desc="做过的题都答对了。去错题本或题库多练几组，这里会自动汇总你的易错点。" action={<Button onClick={() => navigate('/practice')}>去题库</Button>} />
      ) : (
        <div className="tp-groups">
          {groups.map((g) => (
            <section key={g.subject} className="tp-group">
              <h2 className="tp-group-title">
                <SubjectTag subject={g.subject} />
                <span className="faint text-sm">{g.entries.length} 条</span>
              </h2>
              <ol className="tp-list">
                {g.entries.map((e) => (
                  <li key={e.item.id} className="tp-entry">
                    <div className="tp-entry-head">
                      <span className="tp-topic">{shortTopic(bank, e.item.topic)}</span>
                      <span className="faint text-xs">
                        {e.item.source.label} · 错 {e.misses} 次
                      </span>
                    </div>
                    {e.lines.map((t, i) => (
                      <div key={'t' + i} className="tp-line tp-trap">
                        <RichText text={t} lang="zh" inline />
                      </div>
                    ))}
                    {e.points.slice(0, 2).map((t, i) => (
                      <div key={'p' + i} className="tp-line tp-point">
                        <RichText text={t} lang="zh" inline />
                      </div>
                    ))}
                  </li>
                ))}
              </ol>
            </section>
          ))}
          <p className="faint text-sm">按做错次数和考点频率排序，最多 {LIMIT} 条。{SUBJECT_NAME.japanese}题的易错点多是读题和听力陷阱。</p>
        </div>
      )}
    </div>
  );
}
