// "问 AI": follow-up questions about one item, answered by the local coach (lib/api.ts).
// Jobs and answers are kept per item for the whole app session, so leaving and coming back keeps them.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Item, SessionAnswer } from '@shared/types.ts';
import { askCoach, cancelCoach, coachStatus, pollCoach, type CoachResult } from '../../lib/api.ts';
import { RichText } from '../../components/RichText.tsx';
import { Icon } from '../../components/Icon.tsx';
import { Button, IconButton, Spinner, Tooltip } from '../../components/ui.tsx';
import { ExNotes } from '../../components/question/Explanation.tsx';
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

type Kind = 'physics' | 'chemistry' | 'math' | 'blanks' | 'ja' | 'grammar' | 'listen';

/** Follow-ups after a wrong (or given-up) answer. The third one depends on the item. */
function quickWrong(kind: Kind, item: Item): string[] {
  switch (kind) {
    case 'blanks':
      return ['这一步是怎么想到的？', '我填错的那几格错在哪？', '有没有更快的算法？'];
    case 'ja':
      return ['正确答案在原文哪一句？', '我选的选项为什么不对？', '这段文章的结构怎么快速抓？'];
    case 'grammar':
      return ['为什么选这个文型？', '我选的为什么不行？', '这几个文型怎么区分？'];
    case 'listen':
      return ['答案依据是录音里哪一句？', '我选的选项错在哪？', '这类题听的时候该抓什么？'];
    default:
      // Only offer the vocabulary question when the stem really has Japanese words worth glossing.
      return ['我的思路哪里错了？', '有没有考场上更快的做法？', item.explanation.terms?.length ? '题干里这几个日语词是什么意思？' : '这题的关键一步是什么？'];
  }
}

/** After a right answer the questions are about going further, not about a mistake. */
function quickRight(kind: Kind): string[] {
  switch (kind) {
    case 'ja':
      return ['帮我总结这题的解题线索', '有没有更快的定位方法？', '这类题还会怎么考？'];
    case 'grammar':
      return ['这个文型还有哪些用法？', '容易和哪个文型混淆？', '帮我造两个例句'];
    case 'listen':
      return ['帮我总结这段录音的要点', '这类题听的时候该抓什么？', '这类题还会怎么考？'];
    case 'blanks':
      return ['帮我总结关键思路', '有没有更快的算法？', '这类题还会怎么考？'];
    default:
      return ['帮我总结关键思路', '有没有更快的做法？', '这类题还会怎么考？'];
  }
}

const PLACEHOLDER: Record<Kind, string> = {
  physics: '比如「为什么不能用动能守恒？」',
  chemistry: '比如「这里为什么不考虑水解？」',
  math: '比如「这个范围是怎么确定的？」',
  blanks: '比如「第二问的范围怎么确定？」',
  ja: '比如「下线部指的是哪件事？」',
  grammar: '比如「这两个文型怎么区分？」',
  listen: '比如「她最后到底同意了没有？」',
};

function kindOf(item: Item): Kind {
  if (item.subject === 'japanese') return item.audio ? 'listen' : item.topic.startsWith('ja.vocab') ? 'grammar' : 'ja';
  if (item.format === 'blanks') return 'blanks';
  return item.subject;
}

type Phase = 'idle' | 'asking' | 'done' | 'error';

/** True when this item already has a question to the coach in this app session (the panel then starts open). */
export function hasCoachEntry(itemId: string): boolean {
  return entries.has(itemId);
}

/**
 * The coach panel. `inline` sits inside the answer card (two-pane layout), `card` stands on its own
 * under the result row (single column). It opens only when asked for (问 AI), next to the answer.
 */
export function CoachCard({
  item,
  response,
  wasCorrect,
  variant = 'card',
  onClose,
  reveal,
}: {
  item: Item;
  response: SessionAnswer['response'];
  wasCorrect: boolean;
  variant?: 'card' | 'inline';
  onClose?: () => void;
  /** Just opened from 问 AI: scroll it into view once (not when coming back to an item that has one). */
  reveal?: boolean;
}) {
  const existing = entries.get(item.id);
  const [phase, setPhase] = useState<Phase>(existing?.result ? 'done' : existing?.error ? 'error' : existing?.jobId ? 'asking' : 'idle');
  const [entry, setEntry] = useState<Entry | undefined>(existing);
  const [text, setText] = useState('');
  const [available, setAvailable] = useState<boolean | null>(statusCache && Date.now() - statusCache.at < 60_000 ? statusCache.available : null);
  const [now, setNow] = useState(Date.now());
  const rootRef = useRef<HTMLElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const lastPhase = useRef(phase);

  // Opened on purpose: bring it into view (no focus, so Enter / arrows keep driving the player).
  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An answer that arrives while the learner waits is brought into view (it may land below the fold of the card).
  useEffect(() => {
    if (phase === 'done' && lastPhase.current === 'asking') answerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    lastPhase.current = phase;
  }, [phase]);

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

  const kind = kindOf(item);
  const quick = wasCorrect ? quickRight(kind) : quickWrong(kind, item);
  const waited = entry ? Math.max(0, Math.round((now - entry.startedAt) / 1000)) : 0;

  const sub = wasCorrect ? '想再深入一点？针对这道题追问' : '解析没看懂？针对这道题追问';
  return (
    <section className={cx('pl-coach', variant === 'card' ? 'card' : 'is-inline')} ref={rootRef} aria-label="问 AI 老师">
      <header className="pl-coach-head">
        <Icon name="sparkles" size={15} className="pl-coach-spark" />
        <span className="pl-coach-title">问 AI 老师</span>
        <span className="pl-coach-sub">{sub}</span>
        {onClose && <IconButton icon="x" label="收起" size="sm" className="pl-coach-close" onClick={onClose} />}
      </header>

      {available === false ? (
        <div className="pl-coach-off">
          <Icon name="info" size={15} />
          <span>AI 现在连不上（本机的 Codex 没有登录或未安装）。解析里已经有完整思路，先照着它过一遍。</span>
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
              <span className="pl-coach-wait-note">通常需要 20–60 秒，可以先做下一题</span>
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
            <div className="pl-coach-answer" ref={answerRef}>
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
              <ExNotes
                notes={[
                  ...(entry.result.keyPoint ? [{ tone: 'primary' as const, icon: 'target' as const, title: '考点', body: <RichText text={entry.result.keyPoint} lang="zh" inline /> }] : []),
                  ...(entry.result.pitfall ? [{ tone: 'warning' as const, icon: 'alert' as const, title: '易错', body: <RichText text={entry.result.pitfall} lang="zh" inline /> }] : []),
                ]}
              />
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
              <div className={cx('pl-coach-input', text.trim() && 'has-text')}>
                <textarea
                  rows={1}
                  value={text}
                  aria-label="向 AI 老师提问"
                  placeholder={phase === 'done' ? '还想追问什么？' : PLACEHOLDER[kind]}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onKey}
                />
                <Tooltip label="发送" kbd="Enter">
                  <button type="button" className="pl-coach-send" onClick={() => void ask(text)} disabled={!text.trim() || available === null} aria-label="发送">
                    <Icon name="arrowRight" size={16} />
                  </button>
                </Tooltip>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
