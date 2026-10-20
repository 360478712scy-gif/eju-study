// Preview of one bank item: stem, the learner's last answer, explanation, personal note and actions.
// Used by the mistake book and the topic notes page.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Attempt, Item, ItemProgress } from '@shared/types.ts';
import { dismissMistake, setItemNote, toggleStar } from '@shared/actions.ts';
import { MISTAKE_GRADUATE_BOX } from '@shared/srs.ts';
import { useReady, update } from '../../lib/store.ts';
import { href } from '../../lib/router.ts';
import { playSpeech, stopSpeech, onSpeechChange, speechElement } from '../../lib/audio.ts';
import { cx, fmtClock, fmtDateShort } from '../../lib/format.ts';
import { Badge, Button, IconButton, Meta, Modal, SubjectTag, Tooltip, modalDepth, toast, useConfirm, type Tone } from '../../components/ui.tsx';
import { Icon, type IconName } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import { QuestionStem } from '../../components/question/QuestionStem.tsx';
import { BlanksAnswer, OptionList, optionBadge, optionLabel } from '../../components/question/OptionList.tsx';
import { Explanation } from '../../components/question/Explanation.tsx';
import { DifficultyMeter } from '../../components/question/DifficultyMeter.tsx';
import { MODE_LABEL, RESULT_TEXT, dueInfo, fmtMD, launch, resultOf, sourceLabel } from './helpers.ts';
import { ResultMark } from './bits.tsx';
import { reservedFor, reservedMap } from '../practice/practiceData.ts';
import './item-preview.css';

interface Props {
  /** Item being shown, or null when closed. */
  itemId: string | null;
  /** Ordered ids for previous/next navigation. */
  ids: string[];
  onSelect: (id: string | null) => void;
}

export function ItemPreview({ itemId, ids, onSelect }: Props) {
  const close = useCallback(() => onSelect(null), [onSelect]);
  const { bank } = useReady();
  const item = itemId ? bank.byId.get(itemId) : undefined;
  const open = !!item;
  // Depth of the preview in the modal stack, taken after the Modal registered itself (child
  // effects run first). Arrow keys only page through items while nothing is open on top.
  const depth = useRef(0);
  useEffect(() => {
    depth.current = open ? modalDepth() : 0;
  }, [open]);
  const isTop = useCallback(() => depth.current > 0 && modalDepth() === depth.current, []);
  return (
    <Modal
      open={open}
      onClose={close}
      width={760}
      className="mbp-modal"
      title={item ? <PreviewTitle item={item} /> : undefined}
      footer={item ? <PreviewFoot key={item.id} item={item} ids={ids} onSelect={onSelect} /> : undefined}
    >
      {item && <PreviewBody key={item.id} item={item} ids={ids} onSelect={onSelect} isTop={isTop} />}
    </Modal>
  );
}

/** Redo / star / dismiss for one item. Used by the body (unseen items) and the footer. */
function useItemActions(item: Item, ids: string[], onSelect: (id: string | null) => void) {
  const { state, bank } = useReady();
  const p = state.progress[item.id];
  const confirm = useConfirm();
  const idx = ids.indexOf(item.id);
  const prevId = idx > 0 ? ids[idx - 1] : null;
  const nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;
  // Paper held for an upcoming mock (mistake re-tests keep their own schedule, so no flag for them).
  const held = useMemo(() => (p?.inMistakes ? undefined : reservedFor(reservedMap(state, bank), item)), [p?.inMistakes, state, bank, item]);

  const redo = async () => {
    // Mistake re-tests follow their own schedule; a plain redo of a paper held for a mock gets a warning first.
    if (held) {
      const ok = await confirm.ask('这道题在模考预留卷里', {
        body: `${fmtDateShort(held.date)}「${held.title}」会用到这套卷。现在做了，到时模考分数会偏高。`,
        ok: '仍然做这题',
        focus: 'cancel',
      });
      if (!ok) return;
    }
    stopSpeech();
    launch({ kind: p?.inMistakes ? 'review' : 'drill', title: p?.inMistakes ? '错题重做' : '单题练习', items: [item] });
  };

  const star = () => {
    const on = !p?.starred;
    update((d) => toggleStar(d, item.id));
    toast(on ? '已收藏' : '已取消收藏', on ? 'success' : 'neutral', 1600);
  };

  const dismiss = async () => {
    const ok = await confirm.ask('移出错题本？', {
      body: '这道题不再安排复习。以后再做错，会自动回到错题本。',
      ok: '移出',
      danger: true,
      focus: 'cancel',
    });
    if (!ok) return;
    const next = nextId || prevId;
    update((d) => dismissMistake(d, item.id));
    toast('已移出错题本', 'success', 1800);
    onSelect(next);
  };

  return { p, idx, prevId, nextId, held, redo, star, dismiss, confirmNode: confirm.node };
}

function PreviewFoot({ item, ids, onSelect }: { item: Item; ids: string[]; onSelect: (id: string | null) => void }) {
  const { state } = useReady();
  const a = useItemActions(item, ids, onSelect);
  const tried = state.attempts.some((x) => x.itemId === item.id);
  return (
    <div className="mbp-foot">
      <div className="mbp-nav">
        <IconButton icon="left" label="上一题（←）" disabled={!a.prevId} onClick={() => a.prevId && onSelect(a.prevId)} />
        <span className="mbp-pos num">{a.idx >= 0 ? `${a.idx + 1} / ${ids.length}` : ''}</span>
        <IconButton icon="right" label="下一题（→）" disabled={!a.nextId} onClick={() => a.nextId && onSelect(a.nextId)} />
      </div>
      <div className="mbp-actions">
        <Button variant="ghost" icon="star" className={cx('mbp-star', a.p?.starred && 'is-on')} aria-pressed={!!a.p?.starred} onClick={a.star}>
          {a.p?.starred ? '已收藏' : '收藏'}
        </Button>
        {a.p?.inMistakes && (
          <Button variant="ghost" icon="check" onClick={() => void a.dismiss()}>
            移出错题本
          </Button>
        )}
        <Button variant="primary" icon={a.p?.inMistakes || tried ? 'refresh' : 'play'} onClick={() => void a.redo()}>
          {a.p?.inMistakes ? '重做这题' : tried ? '再做一次' : '做这题'}
        </Button>
      </div>
      {a.confirmNode}
    </div>
  );
}

function PreviewTitle({ item }: { item: Item }) {
  return (
    <span className="mbp-title">
      <SubjectTag subject={item.subject} size="sm" />
      <span className="mbp-title-text">{sourceLabel(item)}</span>
    </span>
  );
}

/** One status badge, as in the practice preview: when it comes back and how far from leaving the book. */
function statusBadge(p: ItemProgress | undefined, today: string, lastDate?: string): { tone: Tone; icon?: IconName; text: string } | null {
  if (!p || p.attempts === 0) return { tone: 'neutral', text: '还没做过' };
  if (p.inMistakes) {
    const due = dueInfo(p.due, today);
    const left = Math.max(1, MISTAKE_GRADUATE_BOX - Math.max(0, p.box));
    const when = !due ? '在错题本' : due.tone === 'now' ? '今天到期' : `${due.text}复习`;
    return { tone: due?.tone === 'now' ? 'warning' : 'neutral', icon: 'clock', text: `${when} · 再对 ${left} 次移出` };
  }
  if (p.slow && p.lastCorrect) return { tone: 'warning', icon: 'clock', text: '做对但太慢' };
  const when = lastDate ? ` · ${fmtDateShort(lastDate)}` : '';
  if (p.box >= MISTAKE_GRADUATE_BOX && p.lastCorrect) return { tone: 'success', icon: 'check', text: `已移出错题本${when}` };
  return p.lastCorrect ? { tone: 'success', icon: 'check', text: `上次答对${when}` } : { tone: 'neutral', text: `上次没答对${when}` };
}

function PreviewBody({ item, ids, onSelect, isTop }: { item: Item; ids: string[]; onSelect: (id: string | null) => void; isTop: () => boolean }) {
  const { state, bank, today } = useReady();
  const showGloss = state.settings.showZhGloss;
  const history = useMemo(() => state.attempts.filter((a) => a.itemId === item.id), [state.attempts, item.id]);
  const last = history[history.length - 1];
  const [reveal, setReveal] = useState(history.length > 0);
  const a = useItemActions(item, ids, onSelect);
  const { p, prevId, nextId, held } = a;
  const topic = bank.topics.get(item.topic);
  const hasNote = bank.notesByTopic.has(item.topic);
  const status = statusBadge(p, today, last?.date);
  const chosen = last && typeof last.response === 'number' ? last.response : null;
  const given = last && last.response && typeof last.response === 'object' ? last.response : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || !isTop()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && prevId) {
        e.preventDefault();
        onSelect(prevId);
      } else if (e.key === 'ArrowRight' && nextId) {
        e.preventDefault();
        onSelect(nextId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevId, nextId, onSelect, isTop]);

  return (
    <div className="mbp">
      <div className="mbp-meta">
        {topic &&
          (hasNote ? (
            <a className="mbp-topic" href={href('/notes/' + item.topic)}>
              <Icon name="notebook" size={13} />
              {topic.name}
            </a>
          ) : (
            <span className="mbp-topic is-plain">
              <Icon name="layers" size={13} />
              {topic.name}
            </span>
          ))}
        <DifficultyMeter value={item.difficulty} />
        <span className="mbp-meta-item num">
          <Icon name="clock" size={13} />
          目标 {fmtClock(item.targetSec)}
        </span>
        {status && (
          <Badge tone={status.tone} icon={status.icon}>
            {status.text}
          </Badge>
        )}
        {held && <Badge icon="flag">留给 {fmtDateShort(held.date)} 模考</Badge>}
      </div>

      {last && <LastTry item={item} last={last} />}

      {item.audio && <AudioBar src={item.audio.src} start={item.audio.start} />}

      <QuestionStem item={item} showGloss={showGloss} />

      {item.format === 'choice' && (
        <div className={cx('mbp-opts', compactOptions(item) && 'is-compact')}>
          <OptionList item={item} chosen={chosen} reveal={reveal} />
        </div>
      )}

      {reveal ? (
        <>
          {item.format === 'blanks' && (
            <div className="mbp-answer">
              <div className="mbp-answer-label">正确答案{given ? '（红色是填错的格子，划线是你当时的答案）' : ''}</div>
              <BlanksAnswer item={item} given={given} />
            </div>
          )}
          {history.length > 1 && <History list={history} />}
          <section className="mbp-ex">
            <h4 className="mbp-ex-head">
              <Icon name="bulb" size={15} />
              解析
            </h4>
            <Explanation item={item} />
          </section>
        </>
      ) : (
        <button type="button" className="mbp-reveal" onClick={() => setReveal(true)}>
          <span className="mbp-reveal-main">
            <Icon name="eye" size={16} />
            显示答案与解析
          </span>
          <span className="mbp-reveal-hint">想先自己做，就点「做这题」</span>
        </button>
      )}

      {p && reveal && <NoteEditor itemId={item.id} initial={p.note || ''} />}
      {a.confirmNode}
    </div>
  );
}

/** Why this item is here, above the fold: the last answer, its time against the target, and the trap. */
function LastTry({ item, last }: { item: Item; last: Attempt }) {
  const kind = resultOf(last);
  const chosen = typeof last.response === 'number' ? last.response : null;
  let what = '';
  if (last.gaveUp || last.response === null) what = '没有作答';
  else if (item.format === 'choice' && chosen !== null) what = `选了 ${optionBadge(optionLabel(item, chosen))}`;
  else if (item.format === 'blanks') what = `填对 ${Math.round(last.score * 100)}%`;
  const slow = last.seconds > item.targetSec * 1.2;
  const trap = kind !== 'right' ? item.explanation.traps?.[0] : undefined;
  return (
    <div className="mbp-last">
      <div className="mbp-last-head">
        <ResultMark kind={kind} size="xs" />
        <span className={cx('mbp-res-text', `is-${kind}`)}>上次{RESULT_TEXT[kind]}</span>
        <Meta className="mbp-last-meta">
          {what && <span>{what}</span>}
          <span className={cx('mbp-fact', slow && 'is-slow')}>
            用时 <span className="num">{fmtClock(last.seconds)}</span>
            {slow && <> · 比目标慢 <span className="num">{fmtClock(last.seconds - item.targetSec)}</span></>}
          </span>
          <span>{fmtDateShort(last.date)}</span>
        </Meta>
        {last.confidence === 'unsure' && <Badge tone="warning">没把握</Badge>}
        {last.confidence === 'guess' && <Badge tone="warning">猜的</Badge>}
      </div>
      {trap && (
        <div className="mbp-last-trap">
          <span className="mbp-last-label">
            <Icon name="alert" size={14} />
            易错
          </span>
          <RichText text={trap} lang="zh" inline />
        </div>
      )}
    </div>
  );
}

/** Short options (formulas, numbers) read better in a grid than one per line. */
function compactOptions(item: Item): boolean {
  const opts = item.options || [];
  return opts.length >= 4 && opts.every((o) => o.replace(/\\[a-z]+|[{}$\s]/gi, '').length <= 18);
}

function History({ list }: { list: Attempt[] }) {
  return (
    <div className="mbp-history" aria-label="作答记录">
      <span className="t-eyebrow mbp-history-label">作答记录</span>
      {list.map((a) => {
        const k = resultOf(a);
        return (
          <Tooltip key={a.id} label={`${fmtMD(a.date)} · ${MODE_LABEL[a.mode]} · ${RESULT_TEXT[k]} · 用时 ${fmtClock(a.seconds)}`}>
            <span className={cx('mbp-hchip', `is-${k}`)} tabIndex={0}>
              <ResultMark kind={k} size="xs" />
              <span className="num">{fmtMD(a.date)}</span>
              <span className="faint">{MODE_LABEL[a.mode]}</span>
              <span className="num faint">{fmtClock(a.seconds)}</span>
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}

function NoteEditor({ itemId, initial }: { itemId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState<'idle' | 'dirty' | 'saved'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);
  latest.current = text;

  const save = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = latest.current.trim() ? latest.current : '';
    update((d) => setItemNote(d, itemId, value));
    setSaved('saved');
  }, [itemId]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        const value = latest.current.trim() ? latest.current : '';
        update((d) => setItemNote(d, itemId, value));
      }
    },
    [itemId],
  );

  return (
    <section className="mbp-note">
      <div className="mbp-note-head">
        <span className="mbp-sec-title">
          <Icon name="pen" size={16} />
          我的笔记
        </span>
        <span className="mbp-note-state">{saved === 'saved' ? '已保存' : saved === 'dirty' ? '输入中…' : '自动保存'}</span>
      </div>
      <textarea
        className="mbp-note-input"
        value={text}
        rows={2}
        maxLength={2000}
        placeholder="一句话提醒自己：错在哪、下次先看什么。比如「圧力 是压强，不是压力」"
        onChange={(e) => {
          setText(e.target.value);
          setSaved('dirty');
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(save, 700);
        }}
        onBlur={() => timer.current && save()}
      />
    </section>
  );
}

function AudioBar({ src, start }: { src: string; start?: number }) {
  const [playing, setPlaying] = useState(false);
  const mine = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const off = onSpeechChange(() => {
      const el = speechElement();
      setPlaying(!!el && el === mine.current && !el.paused);
    });
    return () => {
      off();
      if (mine.current && speechElement() === mine.current) stopSpeech();
    };
  }, []);
  const toggle = async () => {
    if (playing) {
      stopSpeech();
      return;
    }
    try {
      mine.current = await playSpeech(src, { start });
      setPlaying(true);
    } catch {
      toast('音频播放失败', 'danger');
    }
  };
  return (
    <div className="mbp-audio">
      <Button variant={playing ? 'soft' : 'secondary'} size="sm" icon={playing ? 'pause' : 'headphones'} onClick={() => void toggle()}>
        {playing ? '暂停' : '播放听力音频'}
      </Button>
      <span className="faint text-sm">听力原文在解析末尾</span>
    </div>
  );
}
