// End of a run: first-try accuracy per skill, the words to look at again, and the next round.
// Same pattern as the question player's finish view: top bar, ring + eyebrow + headline + stat row +
// CTAs in one hero card, then the list to look at again. Short runs (under 5 cards) just count.
import { useMemo, useState } from 'react';
import type { VocabSkill } from '@shared/types.ts';
import { useApp } from '../../lib/store.ts';
import { cx } from '../../lib/format.ts';
import { Icon } from '../../components/Icon.tsx';
import { Button, Card, Dot, List, ListRow, Ring, StatTile } from '../../components/ui.tsx';
import { extraQueue, gloss, MORE_COUNT, readNewWords, setRun, SKILL_LABEL, SKILL_NAME, SKILL_TONE, spaceCards, useRun, vocabDay } from './run.ts';
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
    return { per, watch: [...watch.entries()], fixed, n, ok, missed: n - ok, acc: n ? ok / n : 0 };
  }, [run]);

  // What is left of today's round (reviews over one round's cap, words not finished) comes
  // first, in full; when nothing is left, 20 of the weakest learned cards.
  const left = useMemo(() => (state && bank ? vocabDay(state, bank, today, readNewWords()).queue : []), [state, bank, today]);

  if (!run || !bank || !state) return null;

  const again = () => {
    const q = left.length ? left : extraQueue(state, bank, MORE_COUNT);
    if (q.length) startRun(spaceCards(q), today, left.length ? '今日词汇' : '加练');
  };
  const back = () => setRun(null);

  const short = stats.n < SHORT_RUN;
  const pct = Math.round(stats.acc * 100);
  const eyebrow = run.closedBlock ? '今日计划里的词汇已完成' : run.completed ? '本轮完成' : '先练到这里';
  const headline = short
    ? `练了 ${stats.n} 张`
    : stats.missed === 0
      ? '全对，这一轮很稳'
      : stats.acc >= 0.85
        ? '漂亮，答得很稳'
        : stats.acc >= 0.65
          ? run.completed
            ? '这一轮完成了'
            : '答得不错'
          : '难度不小，先把错的看一遍';
  // Same rule as the player's finish view: green when (nearly) all right, otherwise the accent.
  const tone = stats.missed === 0 || stats.acc >= 0.85 ? 'success' : 'primary';
  const sub = short
    ? stats.missed
      ? `${stats.missed} 张明天优先复习`
      : '都答对了'
    : [`首次作答 ${stats.n} 张`, stats.fixed > 0 ? `重练答对 ${stats.fixed} 个` : '', stats.missed > 0 ? `错的 ${stats.missed} 张明天优先复习` : ''].filter(Boolean).join(' · ');
  const skills = SKILLS.filter((k) => stats.per[k].n > 0);

  const watch = showAll ? stats.watch : stats.watch.slice(0, WATCH_PREVIEW);

  return (
    <div className="vc-focus">
      <VocabTopBar title={run.title} onBack={back} backLabel="返回词汇" />
      <div className="vc-focus-body vc-summary">
        <section className={cx('card card-hero vc-sum-hero', short && 'is-short')}>
          {!short && (
            <Ring value={stats.acc} size={140} stroke={10} tone={tone}>
              <span className="vc-sum-pct num num-xl">
                {pct}
                <span className="vc-sum-pct-unit">%</span>
              </span>
              <span className="vc-sum-pct-label">首答正确</span>
            </Ring>
          )}
          <div className="vc-sum-main">
            <div className={cx('vc-sum-eyebrow', run.closedBlock && 'is-done')}>
              <Icon name={run.completed ? 'checkCircle' : 'flag'} size={14} />
              {eyebrow}
            </div>
            <h1 className="vc-sum-title">{headline}</h1>
            <p className="vc-sum-sub">{sub}</p>
            {!short && (
              <div className="vc-sum-stats">
                {skills.map((k) => {
                  const s = stats.per[k];
                  return (
                    <StatTile
                      key={k}
                      size="lg"
                      label={
                        <>
                          <Dot tone={SKILL_TONE[k]} size="sm" />
                          {SKILL_NAME[k]}
                        </>
                      }
                      // A percentage of one or two cards says nothing: count them instead.
                      {...(s.n < SHORT_RUN
                        ? { value: s.ok, unit: `/ ${s.n} 张答对` }
                        : { value: Math.round((s.ok / s.n) * 100), unit: '%', sub: `${s.ok} / ${s.n} 张答对` })}
                    />
                  );
                })}
                <StatTile size="lg" label="用时" value={Math.max(1, Math.round(run.seconds / 60))} unit="分钟" sub={`平均每张 ${Math.round(run.seconds / Math.max(1, run.results.length))} 秒`} />
              </div>
            )}
            <div className="vc-sum-cta">
              <Button variant="primary" size="lg" {...(left.length ? { iconRight: 'arrowRight' as const } : { icon: 'refresh' as const })} onClick={again}>
                {left.length ? `接着练 · 还有 ${left.length} 张` : `再来 ${MORE_COUNT} 张`}
              </Button>
              <Button variant="secondary" size="lg" onClick={back}>
                返回词汇
              </Button>
            </div>
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
            subtitle="点开听读音、看例句"
            className="vc-watch"
          >
            <List>
              {watch.map(([id, skills]) => {
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
                      <span className="vc-watch-reading" lang="ja">
                        {v.reading}
                      </span>
                    }
                    meta={gloss(v.meaningZh)}
                    trail={<span className="vc-watch-skills">{[...skills].map((s) => SKILL_LABEL[s]).join(' · ')}</span>}
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
