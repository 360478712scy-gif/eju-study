// 词汇: today's spaced-repetition run (reading and meaning tracked separately) and the word list.
import { useEffect, useMemo, useState } from 'react';
import { vocabSkills } from '@shared/planner.ts';
import { useApp } from '../../lib/store.ts';
import { navigate, useRoute } from '../../lib/router.ts';
import { cx, pct } from '../../lib/format.ts';
import { Icon } from '../../components/Icon.tsx';
import { Badge, Button, PageHeader, Ring, Segmented } from '../../components/ui.tsx';
import { cardMinutes, extraQueue, getRun, MORE_COUNT, NEW_WORD_CHOICES, newWordsNote, readNewWords, setRun, spaceCards, useRun, vocabDay, writeNewWords } from './run.ts';
import { startRun, VocabSession } from './VocabSession.tsx';
import { VocabSummary } from './VocabSummary.tsx';
import { WordList } from './WordList.tsx';
import { WordDetail } from './WordDetail.tsx';
import './vocab.css';

const NO_SPLIT = { review: 0, fill: 0, fresh: 0, newWords: 0 };

export function VocabPage() {
  const run = useRun();
  const route = useRoute();
  const state = useApp((s) => s.state);
  const bank = useApp((s) => s.bank);
  const today = useApp((s) => s.today);
  const [openId, setOpenId] = useState<string | null>(null);
  // Only a number the learner picked on this device overrides the engine.
  const [override, setOverride] = useState<number | null>(readNewWords);

  // Leaving the page after a finished run returns to the overview next time.
  useEffect(
    () => () => {
      if (getRun()?.finished) setRun(null);
    },
    [],
  );

  const stats = useMemo(() => {
    const s = { learned: 0, readTotal: 0, solidRead: 0, solidMeaning: 0, todayN: 0, todayOk: 0 };
    if (!state || !bank) return s;
    for (const v of bank.bundle.vocab) {
      const skills = vocabSkills(v);
      const p = state.vocab[v.id];
      if (skills.includes('read')) {
        s.readTotal++;
        if (p?.read && p.read.box >= 3) s.solidRead++;
      }
      if (p && skills.some((k) => p[k])) s.learned++;
      if (p?.meaning && p.meaning.box >= 3) s.solidMeaning++;
    }
    for (const a of state.vocabAttempts) {
      if (a.date !== today) continue;
      s.todayN++;
      if (a.correct) s.todayOk++;
    }
    return s;
  }, [state, bank, today]);

  // Today's round from the shared engine (skipped while a run is on screen). Before any practice
  // today it is exactly vocabToday's queue, i.e. the card count of Today's vocab block.
  const day = useMemo(() => (state && bank && !run ? vocabDay(state, bank, today, override) : null), [state, bank, today, override, run]);
  const queue = useMemo(() => day?.queue ?? [], [day]);
  const split = day?.split ?? NO_SPLIT;
  const block = state?.plans[today]?.blocks.find((b) => b.kind === 'vocab');

  const start = () => {
    if (queue.length) startRun(spaceCards(queue), today, '今日词汇');
  };

  // Once today's queue is done: the weakest learned cards.
  const extra = () => {
    if (!state || !bank) return;
    const q = extraQueue(state, bank, MORE_COUNT);
    if (q.length) startRun(spaceCards(q), today, '加练');
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
  const minutes = cardMinutes(queue.length);
  const blockDone = block?.status === 'done';
  const todayAcc = stats.todayN ? stats.todayOk / stats.todayN : null;
  const due = day?.due ?? 0;
  const notes = [
    due > split.review ? `一轮最多复习 ${split.review} 张，先练最该复习的；剩下 ${due - split.review} 张这轮练完接着来。` : '',
    split.fill > 0 ? `另有 ${split.fill} 张补另一项：这些词只练过读音或词义中的一项，这次补上没练过的那一项。` : '',
  ].filter(Boolean);
  const choose = (value: string) => {
    const n = value === 'auto' ? null : Number(value);
    setOverride(n);
    writeNewWords(n);
  };

  return (
    <div className="page vc-page">
      <PageHeader eyebrow="每日词汇" title="词汇训练" desc="读音（看字写假名）和词义（看词选中文）分开记，理科术语和纯假名词只考词义；新词按待复习量自动定。" />

      <div className="vc-hero">
        <div className="vc-hero-main">
          <div className="vc-hero-top">
            <span className="vc-hero-eyebrow">今天要练</span>
            {block && (blockDone ? <Badge tone="success" icon="check">计划已完成</Badge> : <Badge tone="primary" icon="calendar">今日计划</Badge>)}
          </div>

          {queue.length > 0 ? (
            <>
              <div className="vc-hero-figures">
                {(due > 0 || split.newWords === 0) && (
                  <div className="vc-fig">
                    <span className="vc-fig-num num">{due}</span>
                    <span className="vc-fig-label">张卡待复习</span>
                  </div>
                )}
                {split.newWords > 0 && (
                  <>
                    {due > 0 && <span className="vc-fig-plus">+</span>}
                    <div className="vc-fig">
                      <span className="vc-fig-num num">{split.newWords}</span>
                      <span className="vc-fig-label">个新词</span>
                    </div>
                  </>
                )}
              </div>
              {notes.length > 0 && (
                <div className="vc-hero-notes">
                  {notes.map((n) => (
                    <p key={n}>{n}</p>
                  ))}
                </div>
              )}
              <div className="vc-hero-actions">
                <Button variant="primary" size="lg" iconRight="arrowRight" onClick={start}>
                  {blockDone ? '再练一轮' : '开始训练'} · {queue.length} 张卡
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
              {stats.learned > 0 ? (
                <>
                  <p className="muted">还有余力就加练一组，巩固最容易错的词。</p>
                  <div className="vc-hero-actions">
                    <Button variant="primary" size="lg" icon="plus" onClick={extra}>
                      加练 {MORE_COUNT} 张卡
                    </Button>
                  </div>
                </>
              ) : (
                <p className="muted">想先学一些新词，可以在下面选每天的新词数。</p>
              )}
            </div>
          )}

          <div className="vc-hero-target">
            <span className="vc-hero-target-label">每天新词</span>
            <Segmented<string>
              size="sm"
              value={override === null ? 'auto' : String(override)}
              onChange={choose}
              options={[{ value: 'auto', label: '自动' }, ...NEW_WORD_CHOICES.map((t) => ({ value: String(t), label: `${t} 个` }))]}
            />
            {day && <span className="faint text-sm">{newWordsNote(day)}</span>}
          </div>
        </div>

        <div className="vc-hero-side">
          <Ring value={stats.learned / Math.max(1, total)} size={112} stroke={10} tone="japanese">
            <span className="vc-ring-num num">{stats.learned}</span>
            <span className="vc-ring-unit">/ {total} 已学</span>
          </Ring>
          <div className="vc-side-stats">
            <SideStat label="读音已稳" value={stats.solidRead} total={stats.readTotal} tone="primary" />
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
