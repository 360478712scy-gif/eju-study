// End of a run: what was practised and learned, first-try results per skill, the words to look at
// again, and the next round. One hero card (eyebrow · headline · stat row · CTAs), then the list.
// No ring: a 0% ring on an empty track is a harsh end to a hard round; counts lead instead.
import { useMemo, useState } from 'react';
import type { VocabSkill } from '@shared/types.ts';
import { useApp } from '../../lib/store.ts';
import { cx, pct as fmtPct } from '../../lib/format.ts';
import { Icon } from '../../components/Icon.tsx';
import { Badge, Button, Card, List, ListRow, StatTile } from '../../components/ui.tsx';
import { extraQueue, gloss, MORE_COUNT, readNewWords, setRun, SKILL_ICON, SKILL_LABEL, spaceCards, useRun, vocabDay } from './run.ts';
import { startRun, VocabTopBar } from './VocabSession.tsx';

const WATCH_PREVIEW = 8;
/** Below this many first tries a percentage says nothing: the summary just counts. */
const SHORT_RUN = 5;
const SKILLS: VocabSkill[] = ['read', 'meaning'];

export function VocabSummary({ onOpen }: { onOpen: (id: string) => void }) {
  const run = useRun();
  const bank = useApp((s) => s.bank);
  const state = useApp((s) => s.state);
  const today = useApp((s) => s.today);
  const [showAll, setShowAll] = useState(false);

  const stats = useMemo(() => {
    const per: Record<VocabSkill, { n: number; ok: number }> = { read: { n: 0, ok: 0 }, meaning: { n: 0, ok: 0 } };
    const watch = new Map<string, Set<VocabSkill>>();
    const words = new Set<string>();
    let fixed = 0;
    for (const r of run?.results ?? []) {
      words.add(r.vocabId);
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
    // New words: words of this run with no answer recorded before the run started.
    let fresh = 0;
    if (run && state) {
      const since = new Date(run.startedAt).toISOString();
      const before = new Set<string>();
      for (const a of state.vocabAttempts) if (a.at < since && words.has(a.vocabId)) before.add(a.vocabId);
      fresh = words.size - before.size;
    }
    const n = per.read.n + per.meaning.n;
    const ok = per.read.ok + per.meaning.ok;
    return { per, watch: [...watch.entries()], fixed, fresh, n, ok, missed: n - ok, acc: n ? ok / n : 0 };
  }, [run, state]);

  // What is left of today's round (reviews over one round's cap, words not finished) comes
  // first, in full; when nothing is left, 20 of the weakest learned cards.
  const day = useMemo(() => (state && bank ? vocabDay(state, bank, today, readNewWords()) : null), [state, bank, today]);
  const left = day?.queue ?? [];

  if (!run || !bank || !state) return null;

  const again = () => {
    const q = left.length ? left : extraQueue(state, bank, MORE_COUNT);
    if (q.length) startRun(spaceCards(q), today, left.length ? '今日词汇' : '加练');
  };
  const back = () => setRun(null);

  const short = stats.n < SHORT_RUN;
  const eyebrow = run.closedBlock ? '今日计划里的词汇已完成' : run.completed ? '本轮完成' : '先练到这里';
  // Lead with what was done and learned; the accuracy sits in the stat row, never as the verdict.
  const headline =
    stats.missed === 0 && !short
      ? '全对，这一轮很稳'
      : stats.fresh > 0
        ? `认识了 ${stats.fresh} 个新词`
        : stats.acc >= 0.85 && !short
          ? '漂亮，答得很稳'
          : `这一轮练了 ${stats.n} 张`;
  const allRight = headline.startsWith('全对');
  const sub =
    [
      stats.fresh > 0 && !headline.includes('新词') ? `认识了 ${stats.fresh} 个新词` : '',
      stats.missed > 0 ? `答错的 ${stats.missed} 张明天优先复习` : allRight ? '' : '每张第一次就答对了',
      stats.fixed > 0 ? `重练答对 ${stats.fixed} 个` : '',
    ]
      .filter(Boolean)
      .join(' · ') || `${stats.n} 张都是第一次就答对`;
  const skills = SKILLS.filter((k) => stats.per[k].n > 0);
  // The next round is one round of what is still due, not all of it: name both numbers.
  const due = day?.due ?? 0;
  const nextNote = left.length && due > left.length ? `今天还有 ${due} 张到期` : left.length ? '今天剩下的都在这一轮' : '今天到期的都练完了';
  const minutes = Math.max(1, Math.round(run.seconds / 60));
  const perCard = Math.max(1, Math.round(run.seconds / Math.max(1, run.results.length)));

  const watch = showAll ? stats.watch : stats.watch.slice(0, WATCH_PREVIEW);

  return (
    <div className="vc-focus">
      <VocabTopBar title={run.title} onBack={back} backLabel="返回词汇" />
      <div className={cx('vc-focus-body vc-summary', stats.watch.length <= 3 && 'is-compact')}>
        <section className="card card-hero vc-sum-hero">
          <div className={cx('vc-sum-eyebrow', run.closedBlock && 'is-done')}>
            <Icon name={run.completed ? 'checkCircle' : 'flag'} size={14} />
            {eyebrow}
          </div>
          <h1 className="vc-sum-title">{headline}</h1>
          <p className="vc-sum-sub">{sub}</p>
          <div className="vc-sum-stats">
            <StatTile
              boxed
              size="lg"
              label="答对"
              value={stats.ok}
              unit={`/ ${stats.n} 张`}
              tone={!short && stats.acc >= 0.85 ? 'success' : undefined}
              sub={short ? '首次作答' : `首次作答 · 正确率 ${fmtPct(stats.acc)}`}
            />
            {/* The skill split only says something when the run had both skills. */}
            {skills.length > 1 &&
              skills.map((k) => {
                const s = stats.per[k];
                return (
                  <StatTile
                    key={k}
                    boxed
                    size="lg"
                    icon={SKILL_ICON[k]}
                    label={SKILL_LABEL[k]}
                    value={s.ok}
                    unit={`/ ${s.n}`}
                    sub={s.n < SHORT_RUN ? '首次作答' : `正确率 ${fmtPct(s.ok / s.n)}`}
                  />
                );
              })}
            <StatTile boxed size="lg" icon="clock" label="用时" value={minutes} unit="分钟" sub={`平均每张 ${perCard} 秒`} />
          </div>
          <div className="vc-sum-cta">
            <Button variant="primary" size="lg" {...(left.length ? { iconRight: 'arrowRight' as const } : { icon: 'refresh' as const })} onClick={again}>
              {left.length ? `下一轮 · ${left.length} 张` : `再来 ${MORE_COUNT} 张`}
            </Button>
            <Button variant="secondary" size="lg" onClick={back}>
              返回词汇
            </Button>
            <span className="vc-sum-next">{nextNote}</span>
          </div>
        </section>

        {stats.watch.length > 0 ? (
          <Card
            padding={false}
            title={
              <>
                需要再看的词 <span className="vc-sum-count num">{stats.watch.length}</span>
              </>
            }
            subtitle="点开听读音、看例句；标签是这次答错的那一项"
            className="vc-watch"
          >
            <List>
              {watch.map(([id, missed]) => {
                const v = bank.vocabById.get(id);
                if (!v) return null;
                return (
                  <ListRow
                    key={id}
                    onClick={() => onOpen(id)}
                    lead={
                      <span className="vc-watch-word" lang="ja">
                        {v.word}
                      </span>
                    }
                    title={
                      <span className="vc-watch-title">
                        <span className="vc-watch-reading" lang="ja">
                          {v.reading}
                        </span>
                        {SKILLS.filter((k) => missed.has(k)).map((k) => (
                          <Badge key={k} size="sm" icon={SKILL_ICON[k]} className="vc-watch-skill">
                            {SKILL_LABEL[k]}
                          </Badge>
                        ))}
                      </span>
                    }
                    meta={gloss(v.meaningZh)}
                    chevron
                  />
                );
              })}
            </List>
            {!showAll && stats.watch.length > WATCH_PREVIEW && (
              <div className="vc-list-more">
                <Button variant="ghost" size="sm" icon="down" onClick={() => setShowAll(true)}>
                  显示全部 {stats.watch.length} 个
                </Button>
              </div>
            )}
          </Card>
        ) : (
          stats.n > 0 && (
            <div className="vc-watch-empty">
              <Icon name="award" size={16} />
              这一轮第一次就全答对了，没有要特别留意的词。
            </div>
          )
        )}
      </div>
    </div>
  );
}
