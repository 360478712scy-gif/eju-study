// "问 AI": follow-up questions about one item, answered by the local coach (lib/api.ts).
// Jobs and answers are kept per item for the whole app session, so leaving and coming back keeps them.
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { Item, SessionAnswer } from '@shared/types.ts';
import { askCoach, cancelCoach, coachStatus, pollCoach, type CoachResult } from '../../lib/api.ts';
import { RichText } from '../../components/RichText.tsx';
import { Icon } from '../../components/Icon.tsx';
import { Button, Spinner } from '../../components/ui.tsx';
import { cx } from '../../lib/format.ts';

interface Entry {
  question: string;
  jobId?: string;
  startedAt: number;
  result?: CoachResult;
  error?: string;
}

const entries = new Map<string, Entry>();
let statusCache: { at: number; available: boolean } | null = null;

const QUICK: Record<'choice' | 'blanks' | 'ja', string[]> = {
  choice: ['我的思路哪里错了？', '有没有考场上更快的做法？', '题干里这几个日语词是什么意思？'],
  blanks: ['这一步是怎么想到的？', '我填错的那几格错在哪？', '有没有更快的算法？'],
  ja: ['正确答案在原文哪一句？', '我选的选项为什么不对？', '这段文章的结构怎么快速抓？'],
};

type Phase = 'idle' | 'asking' | 'done' | 'error';

export function CoachCard({ item, response, wasCorrect, focusRef }: { item: Item; response: SessionAnswer['response']; wasCorrect: boolean; focusRef?: RefObject<(() => void) | null> }) {
  const existing = entries.get(item.id);
  const [phase, setPhase] = useState<Phase>(existing?.result ? 'done' : existing?.error ? 'error' : existing?.jobId ? 'asking' : 'idle');
  const [entry, setEntry] = useState<Entry | undefined>(existing);
  const [text, setText] = useState('');
  const [available, setAvailable] = useState<boolean | null>(statusCache && Date.now() - statusCache.at < 60_000 ? statusCache.available : null);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);

  if (focusRef) {
    focusRef.current = () => {
      rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 250);
    };
  }

  useEffect(() => {
    alive.current = true;
    if (available === null) {
      coachStatus()
        .then((s) => {
          statusCache = { at: Date.now(), available: s.available };
          if (alive.current) setAvailable(s.available);
        })
        .catch(() => alive.current && setAvailable(false));
    }
    return () => {
      alive.current = false;
    };
  }, [available]);

  // Poll a running job every 2 s.
  useEffect(() => {
    if (phase !== 'asking' || !entry?.jobId) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = async () => {
      try {
        const job = await pollCoach(entry.jobId!);
        if (!alive.current) return;
        if (job.status === 'done' && job.result) {
          const next = { ...entry, result: job.result };
          entries.set(item.id, next);
          setEntry(next);
          setPhase('done');
          return;
        }
        if (job.status === 'failed' || job.status === 'cancelled') {
          const next = { ...entry, jobId: undefined, error: job.status === 'cancelled' ? undefined : job.error || 'AI 这次没有答上来，稍后再试。' };
          entries.set(item.id, next);
          setEntry(next);
          setPhase(job.status === 'cancelled' ? 'idle' : 'error');
          return;
        }
        timer = setTimeout(poll, 2000);
      } catch (e) {
        if (!alive.current) return;
        const next = { ...entry, jobId: undefined, error: e instanceof Error ? e.message : 'AI 请求失败' };
        entries.set(item.id, next);
        setEntry(next);
        setPhase('error');
      }
    };
    timer = setTimeout(poll, 1200);
    return () => {
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [phase, entry, item.id]);

  const ask = async (q: string) => {
    const question = q.trim() || (wasCorrect ? '帮我总结这题的关键思路。' : '我哪里想错了？请指出关键一步。');
    const base: Entry = { question, startedAt: Date.now() };
    setEntry(base);
    setPhase('asking');
    setNow(Date.now());
    try {
      const job = await askCoach(item.id, question, response);
      const next = { ...base, jobId: job.id, result: job.result };
      entries.set(item.id, next);
      if (!alive.current) return;
      setEntry(next);
      setText('');
      if (job.status === 'done' && job.result) setPhase('done');
    } catch (e) {
      const next = { ...base, error: e instanceof Error ? e.message : 'AI 请求失败' };
      entries.set(item.id, next);
      if (!alive.current) return;
      setEntry(next);
      setPhase('error');
    }
  };

  const cancel = async () => {
    try {
      await cancelCoach();
    } catch {
      /* ignore */
    }
    entries.delete(item.id);
    setEntry(undefined);
    setPhase('idle');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (text.trim()) void ask(text);
    }
  };

  const quick = item.subject === 'japanese' ? QUICK.ja : item.format === 'blanks' ? QUICK.blanks : QUICK.choice;
  const waited = entry ? Math.max(0, Math.round((now - entry.startedAt) / 1000)) : 0;

  return (
    <section className="pl-card pl-coach" ref={rootRef}>
      <header className="pl-card-head">
        <span className="pl-card-title">
          <span className="pl-coach-icon">
            <Icon name="sparkles" size={15} />
          </span>
          问 AI 老师
        </span>
        <span className="faint text-xs">解析没看懂？针对这道题追问</span>
      </header>

      {available === false ? (
        <div className="pl-coach-off">
          <Icon name="info" size={15} />
          <span>AI 现在连不上（本机的 Codex 没有登录或未安装）。上面的解析已经完整覆盖思路，先照着它过一遍。</span>
        </div>
      ) : (
        <>
          {entry && (phase === 'asking' || phase === 'done' || phase === 'error') && (
            <div className="pl-coach-q">
              <Icon name="message" size={14} />
              <span>{entry.question}</span>
            </div>
          )}

          {phase === 'asking' && (
            <div className="pl-coach-wait">
              <Spinner size={16} />
              <span>正在思考… {waited > 0 && <span className="num">{waited}s</span>}</span>
              <span className="faint text-xs">通常需要 20–60 秒，可以先做下一题</span>
              <Button size="sm" variant="ghost" icon="x" onClick={() => void cancel()}>
                取消
              </Button>
            </div>
          )}

          {phase === 'error' && entry?.error && (
            <div className="pl-coach-err">
              <Icon name="alert" size={15} />
              <span>{entry.error}</span>
              <Button size="sm" variant="ghost" icon="refresh" onClick={() => void ask(entry.question)}>
                重试
              </Button>
            </div>
          )}

          {phase === 'done' && entry?.result && (
            <div className="pl-coach-answer">
              <RichText text={entry.result.answer} lang="zh" className="pl-coach-text" />
              {entry.result.steps.length > 0 && (
                <ol className="pl-coach-steps">
                  {entry.result.steps.map((s, i) => (
                    <li key={i}>
                      <span className="pl-coach-step-n num">{i + 1}</span>
                      <RichText text={s} lang="zh" inline />
                    </li>
                  ))}
                </ol>
              )}
              <div className="pl-coach-tags">
                {entry.result.keyPoint && (
                  <div className="pl-coach-tag tone-primary">
                    <b>
                      <Icon name="target" size={13} /> 考点
                    </b>
                    <RichText text={entry.result.keyPoint} lang="zh" inline />
                  </div>
                )}
                {entry.result.pitfall && (
                  <div className="pl-coach-tag tone-warning">
                    <b>
                      <Icon name="alert" size={13} /> 易错
                    </b>
                    <RichText text={entry.result.pitfall} lang="zh" inline />
                  </div>
                )}
              </div>
            </div>
          )}

          {phase !== 'asking' && (
            <>
              <div className="pl-coach-quick">
                {quick.map((q) => (
                  <button key={q} type="button" className="pl-chip" onClick={() => void ask(q)} disabled={available === null}>
                    {q}
                  </button>
                ))}
              </div>
              <div className={cx('pl-coach-input', text && 'has-text')}>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={text}
                  placeholder={phase === 'done' ? '还想追问什么？' : '写下你卡住的地方，例如「为什么不能用动能守恒？」'}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onKey}
                />
                <Button size="sm" variant="primary" icon="arrowRight" onClick={() => void ask(text)} disabled={!text.trim() || available === null}>
                  发送
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
