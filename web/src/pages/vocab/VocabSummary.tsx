// End of a run: accuracy per skill, the words to watch, and one-tap "再来 20 个".
import { useMemo, useState } from 'react';
import type { VocabSkill } from '@shared/types.ts';
import { useApp } from '../../lib/store.ts';
import { cx, fmtDuration, pct } from '../../lib/format.ts';
import { Icon } from '../../components/Icon.tsx';
import { Badge, Button, Ring } from '../../components/ui.tsx';
import { extraQueue, MORE_COUNT, readNewWords, setRun, SKILL_LABEL, spaceCards, useRun, vocabDay } from './run.ts';
import { startRun } from './VocabSession.tsx';
const WATCH_PREVIEW = 12;

export function VocabSummary({ onOpen }: { onOpen: (id: string) => void }) {
  const run = useRun();
  const bank = useApp((s) => s.bank);
  const state = useApp((s) => s.state);
  const today = useApp((s) => s.today);
  const [showAll, setShowAll] = useState(false);

  const stats = useMemo(() => {
    const per: Record<VocabSkill, { n: number; ok: number }> = { read: { n: 0, ok: 0 }, meaning: { n: 0, ok: 0 } };
    const watch = new Map<string, Set<VocabSkill>>();
    let fixed = 0;
    for (const r of run?.results ?? []) {
      if (r.retry) {
        if (r.correct) fixed++;
        continue;
      }
      per[r.skill].n++;
      if (r.correct) per[r.skill].ok++;
      else {
        if (!watch.has(r.vocabId)) watch.set(r.vocabId, new Set());
        watch.get(r.vocabId)!.add(r.skill);
      }
    }
    const n = per.read.n + per.meaning.n;
    const ok = per.read.ok + per.meaning.ok;
    return { per, watch: [...watch.entries()], fixed, n, ok, acc: n ? ok / n : 0 };
  }, [run]);

  // What is left of today's round (reviews over one round's cap, words not finished) comes
  // first, in full; when nothing is left, 20 of the weakest learned cards.
  const left = useMemo(() => (state && bank ? vocabDay(state, bank, today, readNewWords()).queue : []), [state, bank, today]);

  if (!run || !bank || !state) return null;

  const again = () => {
    const q = left.length ? left : extraQueue(state, bank, MORE_COUNT);
    if (q.length) startRun(spaceCards(q), today, left.length ? '今日词汇' : '加练');
  };

  const headline = !run.completed ? '这一轮先到这里' : stats.acc >= 0.9 ? '漂亮，这一轮很稳' : stats.acc >= 0.7 ? '这一轮完成了' : '完成了，错的明天还会再见';
  const tone = stats.acc >= 0.85 ? 'success' : stats.acc >= 0.6 ? 'primary' : 'warning';

  return (
    <div className="vc-summary">
      <div className="vc-summary-card">
        <div className="vc-summary-hero">
          <Ring value={stats.acc} size={128} stroke={11} tone={tone}>
            <span className="vc-ring-num num">{Math.round(stats.acc * 100)}</span>
            <span className="vc-ring-unit">% 首答正确</span>
          </Ring>
          <div className="vc-summary-head">
            <h2>{headline}</h2>
            <p className="muted">
              {run.title} · {stats.n} 张卡片 · 用时 {fmtDuration(Math.max(60, run.seconds))}
              {stats.fixed > 0 && ` · 重练答对 ${stats.fixed} 个`}
            </p>
            {run.closedBlock && (
              <div className="vc-summary-done">
                <Icon name="checkCircle" size={16} />
                今日计划里的词汇已完成
              </div>
            )}
          </div>
        </div>

        <div className="vc-summary-skills">
          {(['read', 'meaning'] as VocabSkill[]).map((k) => {
            const s = stats.per[k];
            return (
              <div key={k} className={cx('vc-skill-tile', k === 'read' ? 'tone-primary' : 'tone-japanese')}>
                <div className="vc-skill-tile-label">
                  <Icon name={k === 'read' ? 'pen' : 'list'} size={14} />
                  {k === 'read' ? '看字写读音' : '看词选意思'}
                </div>
                <div className="vc-skill-tile-value num">{s.n ? pct(s.ok / s.n) : '—'}</div>
                <div className="vc-skill-tile-sub">
                  {s.n ? (
                    <>
                      {s.ok} / {s.n} 答对
                    </>
                  ) : (
                    '本轮没有'
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="vc-summary-actions">
          <Button variant="primary" size="lg" {...(left.length ? { iconRight: 'arrowRight' as const } : { icon: 'refresh' as const })} onClick={again}>
            {left.length ? `接着练 · 还有 ${left.length} 张` : `再来 ${MORE_COUNT} 张`}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setRun(null)}>
            返回词汇
          </Button>
        </div>
      </div>

      <div className="vc-watch">
        <div className="vc-watch-head">
          <h3>需要留意的词</h3>
          <span className="faint text-sm">{stats.watch.length ? `${stats.watch.length} 个 · 明天会优先复习` : ''}</span>
        </div>
        {stats.watch.length === 0 ? (
          <div className="vc-watch-empty">
            <Icon name="award" size={18} />
            本轮第一次就全答对了，没有要特别留意的词。
          </div>
        ) : (
          <div className="vc-watch-list">
            {(showAll ? stats.watch : stats.watch.slice(0, WATCH_PREVIEW)).map(([id, skills]) => {
              const v = bank.vocabById.get(id);
              if (!v) return null;
              return (
                <button key={id} type="button" className="vc-watch-item" onClick={() => onOpen(id)}>
                  <span className="vc-watch-word" lang="ja">
                    {v.word}
                  </span>
                  <span className="vc-watch-reading" lang="ja">
                    {v.reading}
                  </span>
                  <span className="vc-watch-meaning">{v.meaningZh}</span>
                  <span className="vc-watch-tags">
                    {[...skills].map((s) => (
                      <Badge key={s} tone="danger">
                        {SKILL_LABEL[s]}
                      </Badge>
                    ))}
                  </span>
                </button>
              );
            })}
            {!showAll && stats.watch.length > WATCH_PREVIEW && (
              <div className="vc-list-more">
                <Button variant="ghost" size="sm" icon="down" onClick={() => setShowAll(true)}>
                  显示全部 {stats.watch.length} 个
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
