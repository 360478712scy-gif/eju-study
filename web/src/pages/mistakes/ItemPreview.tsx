// Preview of one bank item: stem, the learner's last answer, explanation, personal note and actions.
// Used by the mistake book and the topic notes page.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Attempt, Item } from '@shared/types.ts';
import { dismissMistake, setItemNote, toggleStar } from '@shared/actions.ts';
import { useReady, update } from '../../lib/store.ts';
import { href } from '../../lib/router.ts';
import { playSpeech, stopSpeech, onSpeechChange, speechElement } from '../../lib/audio.ts';
import { cx, fmtClock, fmtDateShort } from '../../lib/format.ts';
import { Badge, Button, IconButton, IconTile, Meta, Modal, SubjectTag, Tooltip, modalDepth, toast, useConfirm } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { QuestionStem } from '../../components/question/QuestionStem.tsx';
import { BlanksAnswer, OptionList, optionLabel } from '../../components/question/OptionList.tsx';
import { Explanation } from '../../components/question/Explanation.tsx';
import { MODE_LABEL, RESULT_TEXT, dueInfo, fmtMD, launch, resultOf, sourceLabel } from './helpers.ts';
import { ItemMark, ResultMark, markText } from './bits.tsx';
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
      width={860}
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
        <Button variant="ghost" icon="star" className={cx('mbp-star', a.p?.starred && 'is-on')} onClick={a.star}>
          {a.p?.starred ? '已收藏' : '收藏'}
        </Button>
        {a.p?.inMistakes && (
          <Button variant="ghost" icon="check" onClick={() => void a.dismiss()}>
            移出错题本
          </Button>
        )}
        <Button variant="primary" icon="refresh" onClick={() => void a.redo()}>
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
      <span>{sourceLabel(item)}</span>
    </span>
  );
}

function PreviewBody({ item, ids, onSelect, isTop }: { item: Item; ids: string[]; onSelect: (id: string | null) => void; isTop: () => boolean }) {
  const { state, bank, today } = useReady();
  const history = useMemo(() => state.attempts.filter((a) => a.itemId === item.id), [state.attempts, item.id]);
  const last = history[history.length - 1];
  const [reveal, setReveal] = useState(history.length > 0);
  const a = useItemActions(item, ids, onSelect);
  const { p, prevId, nextId, held } = a;
  const topic = bank.topics.get(item.topic);
  const due = p?.inMistakes ? dueInfo(p.due, today) : null;

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
        {topic && (
          <a className="mbp-topic" href={href('/notes/' + item.topic)}>
            <Icon name="notebook" size={14} />
            {topic.name}
            <Icon name="right" size={13} className="mbp-topic-go" />
          </a>
        )}
        <Meta>
          <span className="mbp-meta-item">
            难度
            <span className="mbp-diff" aria-label={`难度 ${item.difficulty}/3`}>
              {[1, 2, 3].map((n) => (
                <i key={n} className={cx(n <= item.difficulty && 'on')} />
              ))}
            </span>
          </span>
          <span>
            考场节奏 <span className="num">{fmtClock(item.targetSec)}</span>
          </span>
          {p?.inMistakes && (
            <span className="mbp-meta-item">
              <ItemMark p={p} tooltip={false} />
              {markText(p).replace('在错题本 · ', '')}
            </span>
          )}
          {due && <span className={cx('mbp-due', `is-${due.tone}`)}>{due.text === '今天' ? '今天到期' : `${due.text}复习`}</span>}
        </Meta>
        {held && (
          <Badge tone="warning" icon="flag">
            {fmtDateShort(held.date)}模考要用
          </Badge>
        )}
        {p && !p.inMistakes && p.slow && p.lastCorrect ? (
          <Badge tone="warning" icon="clock">
            做对但太慢
          </Badge>
        ) : (
          p &&
          !p.inMistakes &&
          p.attempts > 0 &&
          p.correct > 0 && (
            <Badge tone="success" icon="check">
              不在错题本
            </Badge>
          )
        )}
      </div>

      {item.audio && <AudioBar src={item.audio.src} start={item.audio.start} />}

      <div className="mbp-stem">
        <QuestionStem item={item} />
      </div>

      {reveal ? (
        <>
          <AnswerBlock item={item} last={last} />
          {history.length > 0 && <History list={history} />}
          <section className="mbp-sec">
            <h4 className="mbp-sec-title">
              <Icon name="bulb" size={16} />
              解析
            </h4>
            <Explanation item={item} />
          </section>
        </>
      ) : (
        <div className="mbp-hidden">
          <IconTile icon="eyeOff" size="md" />
          <div className="mbp-hidden-text">
            <b>这题你还没做过</b>
            <span>先自己做一遍，印象最深。</span>
          </div>
          <div className="mbp-hidden-actions">
            <Button variant="ghost" icon="eye" onClick={() => setReveal(true)}>
              直接看答案
            </Button>
            <Button variant="secondary" icon="play" onClick={() => void a.redo()}>
              做这题
            </Button>
          </div>
        </div>
      )}

      {p && reveal && <NoteEditor itemId={item.id} initial={p.note || ''} />}
      {a.confirmNode}
    </div>
  );
}

function AnswerBlock({ item, last }: { item: Item; last?: Attempt }) {
  const kind = resultOf(last);
  const chosen = last && typeof last.response === 'number' ? last.response : null;
  const given = last && last.response && typeof last.response === 'object' ? last.response : null;
  let what = '';
  if (last) {
    if (last.gaveUp || last.response === null) what = '没有作答';
    else if (item.format === 'choice' && chosen !== null) what = `选了 ${optionLabel(item, chosen)}`;
    else if (item.format === 'blanks') what = `填对 ${Math.round(last.score * 100)}%`;
  }
  const slow = last && last.seconds > item.targetSec * 1.2;
  return (
    <section className="mbp-sec">
      <div className="mbp-ans-head">
        <h4 className="mbp-sec-title">
          <Icon name="target" size={16} />
          {last ? '上次作答' : '正确答案'}
        </h4>
        {last && (
          <div className="mbp-ans-facts">
            <ResultMark kind={kind} />
            <span className={cx('mbp-res-text', `is-${kind}`)}>{RESULT_TEXT[kind]}</span>
            {what && <span className="faint">· {what}</span>}
            <Tooltip label={`考场节奏 ${fmtClock(item.targetSec)}`}>
              <span className={cx('mbp-fact', slow && 'is-slow')}>
                <Icon name="clock" size={13} />
                <span className="num">{fmtClock(last.seconds)}</span>
                {slow && <span> · 超时</span>}
              </span>
            </Tooltip>
            {last.confidence === 'unsure' && <Badge tone="warning">没把握</Badge>}
            {last.confidence === 'guess' && <Badge tone="warning">猜的</Badge>}
          </div>
        )}
      </div>
      {item.format === 'choice' ? (
        <div className={cx('mbp-opts', compactOptions(item) && 'is-compact')}>
          <OptionList item={item} chosen={chosen} />
        </div>
      ) : (
        <BlanksAnswer item={item} given={given} />
      )}
      {item.format === 'blanks' && given && <p className="mbp-hint">红色是你填错的格子，划线是你当时的答案。</p>}
    </section>
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
