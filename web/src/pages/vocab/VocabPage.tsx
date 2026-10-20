// 词汇: today's spaced-repetition run (reading and meaning tracked separately) and the word list.
import { useEffect, useMemo, useState } from 'react';
import { vocabSkills } from '@shared/planner.ts';
import { useApp } from '../../lib/store.ts';
import { navigate, useRoute } from '../../lib/router.ts';
import { fmtMinutes, pct } from '../../lib/format.ts';
import { Badge, Button, InfoTip, Legend, PageHeader, Ring, Section, Segmented } from '../../components/ui.tsx';
import { cardMinutes, extraQueue, getRun, MORE_COUNT, NEW_WORD_CHOICES, newWordsNote, readNewWords, setRun, spaceCards, useRun, vocabDay, writeNewWords } from './run.ts';
import { startRun, VocabSession } from './VocabSession.tsx';
import { VocabSummary } from './VocabSummary.tsx';
import { WordList } from './WordList.tsx';
import { WordDetail } from './WordDetail.tsx';
import './vocab.css';

const NO_SPLIT = { review: 0, fill: 0, fresh: 0, newWords: 0 };
/** A skill counts as 已稳 from level 3 (three right answers in a row, spaced over days). */
const SOLID_BOX = 3;

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
    const s = { learned: 0, solid: 0, readTotal: 0, solidRead: 0, solidMeaning: 0, todayN: 0, todayOk: 0 };
    if (!state || !bank) return s;
    for (const v of bank.bundle.vocab) {
      const skills = vocabSkills(v);
      const p = state.vocab[v.id];
      if (skills.includes('read')) {
        s.readTotal++;
        if (p?.read && p.read.box >= SOLID_BOX) s.solidRead++;
      }
      if (p && skills.some((k) => p[k])) s.learned++;
      if (p?.meaning && p.meaning.box >= SOLID_BOX) s.solidMeaning++;
      // 已稳 is the word list's rule: every skill of the word at level 3 or above.
      if (p && skills.every((k) => (p[k]?.box ?? 0) >= SOLID_BOX)) s.solid++;
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

  // The run and its summary take the whole window (.vc-focus hides the sidebar, like the player).
  if (run) {
    return (
      <>
        {run.finished ? <VocabSummary onOpen={setOpenId} /> : <VocabSession />}
        {detail}
      </>
    );
  }

  const total = bank.bundle.vocab.length;
  const minutes = cardMinutes(queue.length);
  const blockDone = block?.status === 'done';
  const todayAcc = stats.todayN ? stats.todayOk / stats.todayN : null;
  const due = day?.due ?? 0;
  const rounds = split.review > 0 ? Math.ceil(due / split.review) : 1;
  // One line under the headline: how this round relates to the whole pile.
  const mixed = split.fill > 0 || split.newWords > 0;
  const lead = [
    due > split.review ? `共 ${due} 张到期，分 ${rounds} 轮练` : '',
    mixed && split.review > 0 ? `复习 ${split.review} 张` : '',
    split.fill > 0 ? `补另一项 ${split.fill} 张` : '',
    split.newWords > 0 ? `新词 ${split.newWords} 个` : '',
  ].filter(Boolean);
  const learning = stats.learned - stats.solid;
  const fresh = total - stats.learned;
  const choose = (value: string) => {
    const n = value === 'auto' ? null : Number(value);
    setOverride(n);
    writeNewWords(n);
  };

  return (
    <div className="page vc-page">
      <PageHeader
        title="词汇"
        desc="读音和词义分开记，答错的会更快再出现。"
        info="读音（看字写假名）和词义（看词选中文）分开记录；理科术语和纯假名词只考词义。每天的新词按待复习量自动定，也可以自己选。"
      />

      <section className="card card-hero vc-hero">
        <div className="vc-hero-main">
          {queue.length > 0 ? (
            <>
              <div className="vc-hero-head">
                <span className="t-eyebrow">{blockDone ? '今天的计划已完成 · 还可以再练' : '这一轮'}</span>
                {block && !blockDone && <Badge tone="primary" icon="calendar">今日计划</Badge>}
              </div>
              <h2 className="vc-hero-title">
                <span className="num">{queue.length}</span> 张<span className="vc-hero-dot">·</span>约 {fmtMinutes(minutes)}
              </h2>
              {lead.length > 0 && (
                <p className="vc-hero-lead">
                  {lead.join(' · ')}
                  {split.fill > 0 && <InfoTip side="top">补另一项：这些词只练过读音或词义中的一项，这次补上没练过的那一项。</InfoTip>}
                </p>
              )}
              <div className="vc-hero-actions">
                <Button variant="primary" size="lg" iconRight="arrowRight" onClick={start}>
                  {blockDone ? '再练一轮' : '开始训练'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="vc-hero-head">
                <Badge tone="success" icon="checkCircle">
                  {block ? '今日计划已完成' : '今天的都练完了'}
                </Badge>
              </div>
              <h2 className="vc-hero-title vc-hero-title-sm">今天该练的词都练完了</h2>
              <p className="vc-hero-lead">{stats.learned > 0 ? '还有余力就加练一组，巩固最容易错的词。' : '想先学一些新词，可以在下面选每天的新词数。'}</p>
              {stats.learned > 0 && (
                <div className="vc-hero-actions">
                  <Button variant="primary" size="lg" iconRight="arrowRight" onClick={extra}>
                    加练 {MORE_COUNT} 张
                  </Button>
                </div>
              )}
            </>
          )}

          <div className="vc-hero-target">
            <span className="vc-hero-target-label">每天新词</span>
            <Segmented<string>
              size="sm"
              value={override === null ? 'auto' : String(override)}
              onChange={choose}
              options={[{ value: 'auto', label: '自动' }, ...NEW_WORD_CHOICES.map((t) => ({ value: String(t), label: `${t} 个` }))]}
            />
            {day && <span className="vc-hero-note">{newWordsNote(day)}</span>}
          </div>
        </div>

        <div className="vc-hero-side">
          <div className="vc-side-top">
            <Ring value={stats.learned / Math.max(1, total)} size={88} stroke={8} tone="japanese">
              <span className="vc-ring-num num">
                {Math.round((stats.learned / Math.max(1, total)) * 100)}
                <span className="num-unit">%</span>
              </span>
            </Ring>
            <div className="vc-side-head">
              <span className="t-eyebrow">已学的词</span>
              <span className="vc-side-big">
                <span className="num">{stats.learned}</span>
                <span className="vc-side-of num">/ {total}</span>
              </span>
            </div>
          </div>
          <div className="vc-stack" role="img" aria-label={`未学 ${fresh} 个，在学 ${learning} 个，已稳 ${stats.solid} 个`}>
            {stats.solid > 0 && <i className="is-solid" style={{ flexGrow: stats.solid }} />}
            {learning > 0 && <i className="is-learning" style={{ flexGrow: learning }} />}
            {fresh > 0 && <i className="is-new" style={{ flexGrow: fresh }} />}
          </div>
          <Legend
            className="vc-side-legend"
            items={[
              { label: '已稳', tone: 'success' as const, value: stats.solid },
              { label: '在学', tone: 'japanese' as const, value: learning },
              { label: '未学', tone: 'neutral' as const, value: fresh },
            ].filter((x) => x.value > 0)}
          />
          <p className="vc-side-note">
            {stats.solid > 0 ? (
              <>
                读音已稳 <span className="num">{stats.solidRead}</span> · 词义已稳 <span className="num">{stats.solidMeaning}</span>
              </>
            ) : (
              '每项连续答对 3 次就算「已稳」'
            )}
          </p>
          {stats.todayN > 0 && (
            <p className="vc-side-today">
              今天练了 <span className="num">{stats.todayN}</span> 次{todayAcc !== null && <> · 正确率 <span className="num">{pct(todayAcc)}</span></>}
            </p>
          )}
        </div>
      </section>

      <Section title="单词表" desc="点开任意一个词，听读音、看例句和掌握情况。">
        <WordList onOpen={setOpenId} />
      </Section>
      {detail}
    </div>
  );
}
