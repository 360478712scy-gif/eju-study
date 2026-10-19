// Read-only preview of one bank item: stem, options, answer + explanation, and "练这题".
// Shared by the practice browser and the mock result page.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Item } from '@shared/types.ts';
import { startSession, toggleStar } from '@shared/actions.ts';
import { useApp, update } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { playSpeech, stopSpeech, onSpeechChange, speechElement } from '../../lib/audio.ts';
import { cx, fmtClock, fmtDateShort } from '../../lib/format.ts';
import { Badge, Button, Modal, SubjectTag, toast, useConfirm } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { QuestionStem } from '../../components/question/QuestionStem.tsx';
import { OptionList, BlanksAnswer } from '../../components/question/OptionList.tsx';
import { Explanation } from '../../components/question/Explanation.tsx';
import { isPadding, lastAttemptOf, reservedFor, reservedMap, shortLabel } from './practiceData.ts';
import './preview.css';

type Response = number | Record<string, string> | null;

export interface PreviewContext {
  /** Response to show instead of the learner's last one (e.g. this mock's answer). */
  response?: Response;
  /** One line shown above the stem, e.g. "本次模考：答错 · 用时 2:10". */
  note?: ReactNode;
  noteTone?: 'success' | 'danger' | 'neutral' | 'warning';
}

export function ItemPreview({ itemId, onClose, context }: { itemId: string | null; onClose: () => void; context?: PreviewContext }) {
  const bank = useApp((s) => s.bank);
  const item = itemId && bank ? bank.byId.get(itemId) : undefined;
  return (
    <Modal open={!!item} onClose={onClose} width={780} title={item ? <PreviewTitle item={item} /> : undefined} footer={item ? <PreviewFooter item={item} onClose={onClose} /> : undefined}>
      {item && <PreviewBody key={item.id} item={item} context={context} />}
    </Modal>
  );
}

function PreviewTitle({ item }: { item: Item }) {
  return (
    <span className="ip-title">
      <SubjectTag subject={item.subject} size="sm" />
      <span>{item.source.session ? `${item.source.label.split(' ')[0]} · ${shortLabel(item)}` : shortLabel(item)}</span>
    </span>
  );
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

  return (
    <div className="ip-body">
      <div className="ip-meta">
        {topic && (
          <span className="ip-meta-item">
            <Icon name="layers" size={13} />
            {topic.name}
          </span>
        )}
        <span className="ip-meta-item" title="难度">
          <span className="ip-diff" aria-label={`难度 ${item.difficulty}`}>
            {[1, 2, 3].map((d) => (
              <i key={d} className={cx(d <= item.difficulty && 'on')} />
            ))}
          </span>
          {['基础', '中等', '较难'][item.difficulty - 1]}
        </span>
        <span className="ip-meta-item">
          <Icon name="clock" size={13} />
          目标 {fmtClock(item.targetSec)}
        </span>
        {p && p.attempts > 0 ? (
          <span className={cx('ip-meta-item', p.lastCorrect ? 'is-right' : 'is-wrong')}>
            <Icon name={p.lastCorrect ? 'checkCircle' : 'xCircle'} size={13} />
            做过 {p.attempts} 次 · 上次{p.lastCorrect ? '答对' : '答错'}
            {last ? ` · ${fmtDateShort(last.date)}` : ''}
          </span>
        ) : (
          <span className="ip-meta-item">
            <Icon name="sparkles" size={13} />
            还没做过
          </span>
        )}
      </div>

      {context?.note && <div className={cx('ip-note', `tone-${context.noteTone || 'neutral'}`)}>{context.note}</div>}

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
          <Icon name="eye" size={16} />
          显示答案与解析
          <span className="faint">想先自己做，就点下面的「练这题」</span>
        </button>
      )}
    </div>
  );
}

function PreviewFooter({ item, onClose }: { item: Item; onClose: () => void }) {
  const state = useApp((s) => s.state);
  const bank = useApp((s) => s.bank);
  const starred = !!state?.progress[item.id]?.starred;
  const hasNote = !!bank?.notesByTopic.has(item.topic);
  const confirm = useConfirm();

  const practice = async () => {
    if (!state || !bank) return;
    const reserved = reservedMap(state, bank);
    const held = reservedFor(reserved, item);
    if (held) {
      const pad = isPadding(reserved, item);
      const ok = await confirm.ask(pad ? '这道题留给了模考' : '这道题在模考预留卷里', {
        body: pad
          ? `${fmtDateShort(held.date)}「${held.title}」会用这道原创题补足日语题量。现在做了，到时模考会偏高。`
          : `${fmtDateShort(held.date)}「${held.title}」会用到这套卷。现在做了，到时模考会偏高。`,
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
      <div className="row">
        <Button
          variant="ghost"
          size="sm"
          icon="star"
          className={cx('ip-star', starred && 'is-on')}
          onClick={() => {
            update((d) => toggleStar(d, item.id));
            toast(starred ? '已取消收藏' : '已收藏，在「题目 · 收藏」里找到它', starred ? 'neutral' : 'success');
          }}
        >
          {starred ? '已收藏' : '收藏'}
        </Button>
        {hasNote && (
          <Button
            variant="ghost"
            size="sm"
            icon="notebook"
            onClick={() => {
              onClose();
              navigate('/notes/' + item.topic);
            }}
          >
            考点笔记
          </Button>
        )}
      </div>
      <div className="row">
        <Button variant="ghost" onClick={onClose}>
          关闭
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
