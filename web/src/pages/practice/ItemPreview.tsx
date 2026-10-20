// Read-only preview of one bank item: stem, options, answer + explanation, and "练这题".
// Shared by the practice browser and the mock result page. Layout (also the target for the
// mistake book's preview): header = SubjectTag + source · one Meta line = topic link · difficulty ·
// 目标 m:ss · last status · body on the modal surface · footer = context slot on the left,
// ghost actions then exactly one primary on the right.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Item, ItemProgress } from '@shared/types.ts';
import { startSession, toggleStar } from '@shared/actions.ts';
import { useApp, update } from '../../lib/store.ts';
import { href, navigate } from '../../lib/router.ts';
import { playSpeech, stopSpeech, onSpeechChange, speechElement } from '../../lib/audio.ts';
import { cx, fmtClock, fmtDateShort } from '../../lib/format.ts';
import { Badge, Button, Callout, Meta, Modal, StatusIcon, SubjectTag, toast, useConfirm, type ItemStatus } from '../../components/ui.tsx';
import type { IconName } from '../../components/Icon.tsx';
import { Icon } from '../../components/Icon.tsx';
import { QuestionStem } from '../../components/question/QuestionStem.tsx';
import { OptionList, BlanksAnswer } from '../../components/question/OptionList.tsx';
import { Explanation } from '../../components/question/Explanation.tsx';
import { DifficultyMeter } from '../../components/question/DifficultyMeter.tsx';
import { isPadding, lastAttemptOf, mockTitle, reservedFor, reservedMap, shortLabel } from './practiceData.ts';
import './preview.css';

type Response = number | Record<string, string> | null;

export interface PreviewContext {
  /** Response to show instead of the learner's last one (e.g. this mock's answer). */
  response?: Response;
  /** One line shown above the stem, e.g. "本次模考：答错 · 用时 2:10". */
  note?: ReactNode;
  noteTone?: 'success' | 'danger' | 'neutral' | 'warning';
  noteIcon?: IconName;
}

export function ItemPreview({
  itemId,
  onClose,
  context,
  footerStart,
}: {
  itemId: string | null;
  onClose: () => void;
  context?: PreviewContext;
  /** Left side of the footer (e.g. a ‹ 1/60 › pager); empty in the practice browser. */
  footerStart?: ReactNode;
}) {
  const bank = useApp((s) => s.bank);
  const item = itemId && bank ? bank.byId.get(itemId) : undefined;
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      width={760}
      className="ip-modal"
      title={item ? <PreviewTitle item={item} /> : undefined}
      footer={item ? <PreviewFooter item={item} onClose={onClose} start={footerStart} /> : undefined}
    >
      {item && <PreviewBody key={item.id} item={item} context={context} />}
    </Modal>
  );
}

function PreviewTitle({ item }: { item: Item }) {
  return (
    <span className="ip-title">
      <SubjectTag subject={item.subject} size="sm" />
      <span className="ip-title-text">{item.source.session ? `${item.source.label.split(' ')[0]} · ${shortLabel(item)}` : shortLabel(item)}</span>
    </span>
  );
}

/** Last-attempt status, written like the other meta facts (a small status mark + text, no chip). */
function lastStatus(p: ItemProgress | undefined, lastDate?: string): { status: ItemStatus; text: string } {
  if (!p || p.attempts === 0) return { status: 'todo', text: '还没做过' };
  const when = lastDate ? ` · ${fmtDateShort(lastDate)}` : '';
  const times = p.attempts > 1 ? `做过 ${p.attempts} 次，` : '';
  return p.lastCorrect ? { status: 'right', text: `${times}上次答对${when}` } : { status: 'wrong', text: `${times}上次答错${when}` };
}

function PreviewBody({ item, context }: { item: Item; context?: PreviewContext }) {
  const state = useApp((s) => s.state);
  const bank = useApp((s) => s.bank);
  const showGloss = useApp((s) => s.state?.settings.showZhGloss);
  const last = useMemo(() => (state ? lastAttemptOf(state, item.id) : undefined), [state, item.id]);
  const p = state?.progress[item.id];
  const given: Response | undefined = context && 'response' in context ? context.response : last?.response;
  const [reveal, setReveal] = useState(!!last || !!context);
  const topic = bank?.topics.get(item.topic);
  const hasNote = !!bank?.notesByTopic.has(item.topic);
  const held = useMemo(() => (state && bank && !context ? reservedFor(reservedMap(state, bank), item) : undefined), [state, bank, item, context]);
  const status = lastStatus(p, last?.date);

  return (
    <div className="ip-body">
      {/* One meta line, one treatment: text facts joined by "·", each with at most a small glyph. */}
      <Meta className="ip-meta">
        {topic &&
          (hasNote ? (
            <a className="ip-topic" href={href('/notes/' + item.topic)}>
              {topic.name}
              <Icon name="notebook" size={13} />
            </a>
          ) : (
            <span className="ip-topic is-plain">{topic.name}</span>
          ))}
        <DifficultyMeter value={item.difficulty} />
        <span className="num">目标 {fmtClock(item.targetSec)}</span>
        {!context && (
          <span className={cx('ip-status', `is-${status.status}`)}>
            {status.status !== 'todo' && <StatusIcon status={status.status} size={16} />}
            {status.text}
          </span>
        )}
        {held && (
          <span className="ip-held">
            <Icon name="flag" size={13} />留给 {fmtDateShort(held.date)} 模考
          </span>
        )}
      </Meta>

      {context?.note && (
        <Callout tone={context.noteTone || 'neutral'} icon={context.noteIcon || 'info'} className="ip-note">
          {context.note}
        </Callout>
      )}

      {item.audio && <AudioButton src={item.audio.src} start={item.audio.start} />}

      <QuestionStem item={item} showGloss={showGloss} />

      {item.format === 'choice' && <OptionList item={item} chosen={typeof given === 'number' ? given : null} reveal={reveal} />}

      {reveal ? (
        <>
          {item.format === 'blanks' && (
            <div className="ip-answer">
              <div className="ip-answer-label">正确答案{given && typeof given === 'object' ? '（划线为你的作答）' : ''}</div>
              <BlanksAnswer item={item} given={given && typeof given === 'object' ? given : null} />
            </div>
          )}
          <div className="ip-ex">
            <div className="ip-ex-head">
              <Icon name="bulb" size={15} />
              解析
            </div>
            <Explanation item={item} />
          </div>
        </>
      ) : (
        <button type="button" className="ip-reveal" onClick={() => setReveal(true)}>
          <span className="ip-reveal-main">
            <Icon name="eye" size={16} />
            显示答案与解析
          </span>
          <span className="ip-reveal-hint">想先自己做，就点「练这题」</span>
        </button>
      )}
    </div>
  );
}

function PreviewFooter({ item, onClose, start }: { item: Item; onClose: () => void; start?: ReactNode }) {
  const state = useApp((s) => s.state);
  const bank = useApp((s) => s.bank);
  const starred = !!state?.progress[item.id]?.starred;
  const confirm = useConfirm();

  const practice = async () => {
    if (!state || !bank) return;
    const reserved = reservedMap(state, bank);
    const held = reservedFor(reserved, item);
    if (held) {
      const pad = isPadding(reserved, item);
      const ok = await confirm.ask(pad ? '这道题留给了模考' : '这道题在模考预留卷里', {
        body: pad
          ? `${fmtDateShort(held.date)}「${mockTitle(held.title)}」会用这道原创题补足日语题量。现在做了，到时模考会偏高。`
          : `${fmtDateShort(held.date)}「${mockTitle(held.title)}」会用到这套卷。现在做了，到时模考会偏高。`,
        ok: '仍然练这题',
        focus: 'cancel',
      });
      if (!ok) return;
    }
    const s = update((d) => startSession(d, { kind: 'drill', title: `单题 · ${shortLabel(item)}`, subject: item.subject, itemIds: [item.id] }));
    onClose();
    navigate('/session/' + s.id);
  };

  return (
    <div className="ip-foot">
      <div className="ip-foot-start">{start}</div>
      <div className="ip-foot-end">
        <Button
          variant="ghost"
          icon="star"
          className={cx('ip-star', starred && 'is-on')}
          aria-pressed={starred}
          onClick={() => {
            update((d) => toggleStar(d, item.id));
            toast(starred ? '已取消收藏' : '已收藏，在「题目 · 收藏」里找到它', starred ? 'neutral' : 'success');
          }}
        >
          {starred ? '已收藏' : '收藏'}
        </Button>
        <Button variant="primary" icon="play" onClick={() => void practice()}>
          练这题
        </Button>
      </div>
      {confirm.node}
    </div>
  );
}

function AudioButton({ src, start }: { src: string; start?: number }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const off = onSpeechChange(() => {
      const el = speechElement();
      setPlaying(!!el && !el.paused && el.src.endsWith(src));
    });
    return () => {
      off();
      const el = speechElement();
      if (el && el.src.endsWith(src)) stopSpeech();
    };
  }, [src]);
  return (
    <div className="ip-audio">
      <Button
        variant={playing ? 'soft' : 'secondary'}
        size="sm"
        icon={playing ? 'pause' : 'headphones'}
        onClick={() => {
          if (playing) stopSpeech();
          else void playSpeech(src, { start }).catch(() => toast('音频暂时无法播放', 'danger'));
        }}
      >
        {playing ? '暂停' : '播放音频'}
      </Button>
      {playing && (
        <Badge tone="primary" icon="volume">
          播放中
        </Badge>
      )}
    </div>
  );
}
