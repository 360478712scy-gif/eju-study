// 词汇: today's spaced-repetition run (reading and meaning tracked separately) and the word list.
import { useEffect, useMemo, useState } from 'react';
import type { Phase } from '@shared/types.ts';
import { useApp } from '../../lib/store.ts';
import { navigate, useRoute } from '../../lib/router.ts';
import { cx, pct } from '../../lib/format.ts';
import { Icon } from '../../components/Icon.tsx';
import { Badge, Button, PageHeader, Ring, Segmented } from '../../components/ui.tsx';
import { buildQueue, extraQueue, getRun, isKanaOnly, orderCards, setRun, useRun } from './run.ts';
import { startRun, VocabSession } from './VocabSession.tsx';
import { MORE_COUNT, VocabSummary } from './VocabSummary.tsx';
import { WordList } from './WordList.tsx';
import { WordDetail } from './WordDetail.tsx';
import './vocab.css';

const TARGET_KEY = 'eju-vocab-new-target';
const TARGETS = [10, 20, 30, 40] as const;
const SECONDS_PER_CARD = 8;

function defaultTarget(phase: Phase | undefined): number {
  try {
    const saved = Number(localStorage.getItem(TARGET_KEY));
    if (TARGETS.some((t) => t === saved)) return saved;
  } catch {
    /* ignore */
  }
  return phase === 'final' || phase === 'exam' ? 10 : phase === 'practice' ? 20 : 30;
}

export function VocabPage() {
  const run = useRun();
  const route = useRoute();
  const state = useApp((s) => s.state);
  const bank = useApp((s) => s.bank);
  const today = useApp((s) => s.today);
  const [openId, setOpenId] = useState<string | null>(null);
  const phase = state?.plans[today]?.phase;
  const [target, setTarget] = useState(() => defaultTarget(phase));

  // Leaving the page after a finished run returns to the overview next time.
  useEffect(
    () => () => {
      if (getRun()?.finished) setRun(null);
    },
    [],
  );

  const stats = useMemo(() => {
    const s = { learned: 0, unseen: 0, solidRead: 0, solidMeaning: 0, newCardsToday: 0, todayN: 0, todayOk: 0 };
    if (!state || !bank) return s;
    for (const v of bank.bundle.vocab) {
      const p = state.vocab[v.id];
      if (!p || (!p.read && !p.meaning)) {
        s.unseen++;
        continue;
      }
      s.learned++;
      if (p.read && p.read.box >= 3) s.solidRead++;
      if (p.meaning && p.meaning.box >= 3) s.solidMeaning++;
    }
    // A "new card" is the first ever attempt at one skill of one word.
    const before = new Set<string>();
    const fresh = new Set<string>();
    for (const a of state.vocabAttempts) {
      const key = `${a.vocabId}|${a.skill}`;
      if (a.date < today) before.add(key);
      else if (a.date === today) {
        fresh.add(key);
        s.todayN++;
        if (a.correct) s.todayOk++;
      }
    }
    for (const k of fresh) if (!before.has(k)) s.newCardsToday++;
    return s;
  }, [state, bank, today]);

  const newLimit = Math.max(0, Math.ceil((target * 2 - stats.newCardsToday) / 2));
  const queue = useMemo(() => (state && bank ? buildQueue(state, bank, today, newLimit) : []), [state, bank, today, newLimit]);
  const split = useMemo(() => {
    const out = { due: 0, fresh: 0, newWords: 0 };
    const words = new Set<string>();
    for (const q of queue) {
      const p = state?.vocab[q.id];
      if (p?.[q.skill]) out.due++;
      else {
        out.fresh++;
        if (!p || (!p.read && !p.meaning)) words.add(q.id);
      }
    }
    out.newWords = words.size;
    return out;
  }, [queue, state]);
  const block = state?.plans[today]?.blocks.find((b) => b.kind === 'vocab');

  const start = () => {
    if (!queue.length) return;
    startRun(orderCards(queue), today, '今日词汇');
  };

  const extra = () => {
    if (!state || !bank) return;
    let q = buildQueue(state, bank, today, MORE_COUNT / 2, MORE_COUNT);
    if (!q.length) q = extraQueue(state, bank, MORE_COUNT);
    if (q.length) startRun(orderCards(q), today, '加练');
  };

  // #/vocab?start=1 (from Today) jumps straight into the run.
  const autoStart = route.query.get('start') === '1';
  useEffect(() => {
    if (!autoStart || !state || !bank) return;
    navigate('/vocab', { replace: true });
    if (getRun()) return;
    if (queue.length) start();
    else extra();
  }, [autoStart, !!state, !!bank]);

  if (!state || !bank) return null;

  const detail = <WordDetail vocabId={openId} onClose={() => setOpenId(null)} />;

  if (run && !run.finished) {
    return (
      <div className="page vc-page vc-page-run">
        <VocabSession />
        {detail}
      </div>
    );
  }
  if (run && run.finished) {
    return (
      <div className="page vc-page vc-page-run">
        <VocabSummary onOpen={setOpenId} />
        {detail}
      </div>
    );
  }

  const total = bank.bundle.vocab.length;
  const readTotal = bank.bundle.vocab.filter((v) => !isKanaOnly(v.word)).length;
  const minutes = Math.max(1, Math.round((queue.length * SECONDS_PER_CARD) / 60));
  const blockDone = block?.status === 'done';
  const todayAcc = stats.todayN ? stats.todayOk / stats.todayN : null;

  return (
    <div className="page vc-page">
      <PageHeader eyebrow="每日词汇" title="词汇训练" desc="先看汉字写读音（答完才放音频），再看词选中文意思。读音和词义分开记，错的本轮会再问一次。" />

      <div className="vc-hero">
        <div className="vc-hero-main">
          <div className="vc-hero-top">
            <span className="vc-hero-eyebrow">今天要练</span>
            {block && (blockDone ? <Badge tone="success" icon="check">计划已完成</Badge> : <Badge tone="primary" icon="calendar">今日计划</Badge>)}
          </div>

          {queue.length > 0 ? (
            <>
              <div className="vc-hero-figures">
                <div className="vc-fig">
                  <span className="vc-fig-num num">{split.due}</span>
                  <span className="vc-fig-label">张到期复习</span>
                </div>
                {split.fresh > 0 && (
                  <>
                    <span className="vc-fig-plus">+</span>
                    <div className="vc-fig">
                      <span className="vc-fig-num num">{split.fresh}</span>
                      <span className="vc-fig-label">张新卡</span>
                    </div>
                  </>
                )}
              </div>
              {split.fresh > 0 && (
                <p className="vc-hero-note">
                  {split.newWords > 0
                    ? `新卡里有 ${split.newWords} 个没见过的词，读音、词义各一张${split.fresh > split.newWords * 2 ? '；其余是只练过其中一项的词' : ''}。`
                    : '新卡是之前只练过读音或词义其中一项的词，补上另一项。'}
                </p>
              )}
              <div className="vc-hero-actions">
                <Button variant="primary" size="lg" iconRight="arrowRight" onClick={start}>
                  {blockDone ? '再练一轮' : '开始训练'} · {queue.length} 张
                </Button>
                <span className="vc-hero-time">
                  <Icon name="clock" size={15} />约 {minutes} 分钟
                </span>
              </div>
            </>
          ) : (
            <div className="vc-hero-clear">
              <div className="vc-hero-clear-title">
                <Icon name="checkCircle" size={22} />
                今天该练的词都练完了
              </div>
              <p className="muted">还有余力就加练一组：先补新词，没有新词时巩固最容易错的。</p>
              <div className="vc-hero-actions">
                <Button variant="primary" size="lg" icon="plus" onClick={extra}>
                  加练 {MORE_COUNT} 个
                </Button>
              </div>
            </div>
          )}

          <div className="vc-hero-target">
            <span className="vc-hero-target-label">每天新词</span>
            <Segmented<string>
              size="sm"
              value={String(target)}
              onChange={(t) => {
                const n = Number(t);
                setTarget(n);
                try {
                  localStorage.setItem(TARGET_KEY, String(n));
                } catch {
                  /* ignore */
                }
              }}
              options={TARGETS.map((t) => ({ value: String(t), label: `${t} 个` }))}
            />
            <span className="faint text-sm">
              今天已开新卡 {stats.newCardsToday} / {target * 2} 张
            </span>
          </div>
        </div>

        <div className="vc-hero-side">
          <Ring value={stats.learned / Math.max(1, total)} size={112} stroke={10} tone="japanese">
            <span className="vc-ring-num num">{stats.learned}</span>
            <span className="vc-ring-unit">/ {total} 已学</span>
          </Ring>
          <div className="vc-side-stats">
            <SideStat label="读音已稳" value={stats.solidRead} total={readTotal} tone="primary" />
            <SideStat label="词义已稳" value={stats.solidMeaning} total={total} tone="japanese" />
            <div className="vc-side-today">
              今天已练 <b className="num">{stats.todayN}</b> 次{todayAcc !== null && <> · 正确率 <b className="num">{pct(todayAcc)}</b></>}
            </div>
          </div>
        </div>
      </div>

      <div className="vc-section-head">
        <h2>单词表</h2>
        <span className="faint text-sm">点开任意一个词，听读音、看例句和掌握情况</span>
      </div>
      <WordList onOpen={setOpenId} />
      {detail}
    </div>
  );
}

function SideStat({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'primary' | 'japanese' }) {
  return (
    <div className={cx('vc-side-stat', `tone-${tone}`)}>
      <div className="row-between">
        <span>{label}</span>
        <span className="num">
          <b>{value}</b>
          <span className="faint"> / {total}</span>
        </span>
      </div>
      <div className="vc-side-bar">
        <i style={{ width: `${(value / Math.max(1, total)) * 100}%` }} />
      </div>
    </div>
  );
}
