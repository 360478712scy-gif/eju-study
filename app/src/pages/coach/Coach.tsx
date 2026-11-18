import { useEffect, useRef, useState } from 'react';
import type { Item, PracticeSession } from '@shared/types.ts';
import type { CoachBlock, CoachTurn } from '@shared/coach-ui.ts';
import { CoachBlocks } from '../../ui/CoachBlocks.tsx';
import { Aside } from '../../shell/Shell.tsx';
import { Button, Chip, Field, Icon, IconButton, Sheet, SubjectGlyph, ThinkRing, toast } from '../../ui/ui.tsx';
import { RichText } from '../../ui/RichText.tsx';
import { t } from '../../copy/index.ts';
import { useCoachJob } from '../../lib/useCoach.ts';
import { type CoachContext, useStudy } from '../../lib/study.tsx';
import { topicName } from '../../lib/model.ts';
import './coach.css';

type Intent = { kind: 'ask' | 'variant' | 'weekly'; question?: string; reveal?: boolean };
type Message =
  | { text: string; from: 'user' }
  | { text: string; from: 'coach'; blocks?: CoachBlock[]; variant?: { id: string; item: Item } };

export function Coach({ open, onClose, context }: { open: boolean; onClose: () => void; context: CoachContext }) {
  const { date, bank, active, action, openSession, startItems, openQuickNote } = useStudy();
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [pinned, setPinned] = useState(false);
  const [lastIntent, setLastIntent] = useState<{ key: string; value: Intent }>();
  const coach = useCoachJob<Intent['kind']>();
  const anchor = useRef<HTMLDivElement>(null);
  const derivedItem = context.topic && bank.byTopic.get(context.topic)?.[0];
  const item = context.item ?? (derivedItem || undefined);
  const key = context.item?.id ?? context.topic ?? context.page ?? '';
  const thread = messages[key] ?? [];
  const caption = context.item ? t.coach.contextQuestion(context.item.source.label)
    : context.topic ? t.coach.contextNote(topicName(bank, context.topic))
    : context.page ? t.coach.contextPage(context.page) : t.coach.contextGlobal;

  function append(target: string, message: Message) {
    setMessages(old => ({ ...old, [target]: [...(old[target] ?? []), message] }));
  }

  const send = async (intent: Intent, repeat = false) => {
    if (coach.pending || context.locked || (intent.kind === 'variant' && !item)) return;
    setLastIntent({ key, value: intent });
    if (intent.question && !repeat) append(key, { text: intent.question, from: 'user' });
    if (intent.kind === 'ask') {
      const history: CoachTurn[] = thread.slice(-8).map(message => ({ role: message.from === 'user' ? 'student' : 'coach', text: message.text.slice(0, 600) }));
      const job = await coach.run('ask', {
        question: (intent.question ?? '').slice(0, 800), history, reveal: intent.reveal || undefined,
        itemId: context.item?.id, response: context.item ? context.response : undefined,
        topic: context.topic ?? item?.topic, page: context.page,
      });
      if (job?.result) append(key, { text: job.result.summary, from: 'coach', blocks: job.result.blocks });
    } else if (intent.kind === 'variant' && item) {
      const job = await coach.run('variant', { itemId: item.id });
      if (job?.result) append(key, { text: t.session.variantReadyTag, from: 'coach', variant: { id: job.id, item: job.result.item } });
    } else {
      const job = await coach.run('weekly', { date });
      if (job?.result) append(key, { text: job.result.summary, from: 'coach', blocks: job.result.blocks });
    }
  };

  // Auto-run explicit requests from the session or insights entry. Each opening has a stable context object.
  const requested = useRef<CoachContext | undefined>(undefined);
  useEffect(() => {
    if (!open || !context.mode || requested.current === context || coach.pending) return;
    requested.current = context;
    if (context.mode === 'weekly') void send({ kind: 'weekly', question: t.coach.suggestWeeklyPlan });
    if (context.mode === 'variant') void send({ kind: 'variant', question: t.coach.suggestAnotherOne });
  }, [open, context, coach.pending]);

  useEffect(() => { if (open) anchor.current?.scrollIntoView({ block: 'nearest' }); }, [open, thread.length, coach.pending, coach.error]);

  const ask = (question: string) => {
    const value = question.trim();
    if (!value || context.locked || coach.pending) return;
    setText('');
    void send({ kind: 'ask', question: value });
  };
  const blockActions = {
    ask,
    reveal: () => void send({ kind: 'ask', question: t.coach.revealAsk, reveal: true }),
    practice: (topic?: string) => {
      const pick = topic ? bank.byTopic.get(topic) : item ? bank.byTopic.get(item.topic) : undefined;
      if (pick?.length && !active) { onClose(); void startItems(pick.slice(0, 6).map(it => it.id), 'drill'); }
    },
    note: (topic?: string) => openQuickNote(topic ?? item?.topic),
    variant: () => void send({ kind: 'variant', question: t.coach.suggestAnotherOne }),
  };
  const blockLabels = {
    moreHint: t.coach.moreHint, hintsDone: t.coach.hintsDone, reply: t.coach.reply, replyPlaceholder: t.coach.replyPlaceholder,
    stepsShowAll: t.coach.stepsShowAll, correct: t.coach.choiceCorrect, tryAgain: t.coach.choiceTryAgain,
    key: t.coach.calloutKey, trap: t.coach.calloutTrap, tip: t.coach.calloutTip,
  };

  return <Sheet open={open} onClose={onClose} label={t.coach.title} width={380} className={pinned ? 'coach-pinned' : undefined}>
    <Aside title={<span className="hstack"><Icon name="sparkle" size={18} />{t.coach.title}</span>} actions={<>
      <IconButton icon="pin" label={pinned ? t.coach.unpinFloatBtn : t.coach.pinToRightBtn} size="sm" on={pinned} onClick={() => setPinned(v => !v)} />
      <IconButton icon="trash" label={t.coach.clearHistoryBtn} size="sm" disabled={!!coach.pending || !thread.length} onClick={() => setMessages(old => ({ ...old, [key]: [] }))} />
      <IconButton icon="close" label={t.common.closeBtn} size="sm" onClick={onClose} />
    </>}>
      <div className="coach">
        <div className="coach-ctx">{item && <SubjectGlyph subject={item.subject} size="sm" />}{caption}</div>
        {context.locked ? <div className="bubble">{t.coach.lockedDuringExam}</div> : <>
          {!thread.length && <div className="bubble">{context.item ? t.coach.welcomeWithQuestion : context.topic && item ? t.coach.welcomeWithNote : t.coach.welcomeGeneral}</div>}
          {thread.map((message, i) => <div key={i} className={`bubble${message.from === 'user' ? ' is-me' : ''}${message.from === 'coach' && message.blocks?.length ? ' is-rich' : ''}`}>
            {message.from === 'coach' && message.blocks?.length
              ? <CoachBlocks blocks={message.blocks} labels={blockLabels} on={blockActions} />
              : <RichText text={message.text} lang="zh" />}
            {message.from === 'coach' && <>
              {message.variant && <div className="coach-variant">
                <RichText text={message.variant.item.stem} lang="ja" />
                <Button size="sm" icon="practice" disabled={!!active} onClick={async () => {
                  const session = await action<PracticeSession>({ type: 'startVariant', jobId: message.variant!.id });
                  if (session) { onClose(); openSession(session); toast(t.toast.variantReady, 'ok'); }
                }}>{t.coach.startVariant}</Button>
                {active && <p>{t.coach.variantAfterSession}</p>}
              </div>}
            </>}
          </div>)}
          {coach.pending && <div className="bubble is-thinking" role="status">
            <ThinkRing size={18} />{coach.pending === 'variant' ? t.coach.thinkingVariantCheck : t.coach.thinkingGeneral}
          </div>}
          {coach.pending && <Button size="sm" variant="ghost" onClick={() => void coach.cancel()}>{t.coach.cancelJob}</Button>}
          {!coach.pending && coach.error && lastIntent?.key === key && <div className="bubble" role="status">
            {coach.error}<Button size="sm" onClick={() => void send(lastIntent.value, true)}>{t.coach.retryAskBtn}</Button>
          </div>}
          {!coach.pending && <div className="coach-suggest">
            {item && <>
              {(context.item ? [t.coach.suggestBreakthrough, t.coach.suggestWhyDistractor, t.coach.suggestExamShortcut] : [t.coach.suggestDeepIntuition, t.coach.suggestTrapCompare])
                .map(label => <Chip key={label} onClick={() => ask(label)}>{label}</Chip>)}
              <Chip onClick={() => void send({ kind: 'variant', question: t.coach.suggestAnotherOne })}>{t.coach.suggestAnotherOne}</Chip>
            </>}
            <Chip onClick={() => void send({ kind: 'weekly', question: t.coach.suggestWeeklyPlan })}>{t.coach.suggestWeeklyPlan}</Chip>
          </div>}
        </>}
        <div ref={anchor} />
      </div>
    </Aside>
    {!context.locked && <div className="coach-input">
      <Field value={text} onChange={setText} placeholder={t.coach.inputPlaceholder} pill onEnter={() => ask(text)} />
      <IconButton icon="send" label={t.coach.sendMessageBtn} onClick={() => ask(text)} disabled={!text.trim() || !!coach.pending} glass />
    </div>}
  </Sheet>;
}
