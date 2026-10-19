// Preview of one bank item: stem, the learner's last answer, explanation, personal note and actions.
// Used by the mistake book and the topic notes page.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Attempt, Item } from '@shared/types.ts';
import { dismissMistake, setItemNote, toggleStar } from '@shared/actions.ts';
import { useReady, update } from '../../lib/store.ts';
import { href } from '../../lib/router.ts';
import { playSpeech, stopSpeech, onSpeechChange, speechElement } from '../../lib/audio.ts';
import { cx, fmtClock, fmtDateShort } from '../../lib/format.ts';
import { Badge, Button, IconButton, Modal, SubjectTag, modalDepth, toast, useConfirm } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { QuestionStem } from '../../components/question/QuestionStem.tsx';
import { BlanksAnswer, OptionList, optionLabel } from '../../components/question/OptionList.tsx';
import { Explanation } from '../../components/question/Explanation.tsx';
import { MODE_LABEL, RESULT_TEXT, dueInfo, fmtMD, launch, resultOf, sourceLabel } from './helpers.ts';
import { BoxDots, ResultMark } from './bits.tsx';
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
    <Modal open={open} onClose={close} width={860} title={item ? <PreviewTitle item={item} /> : undefined}>
      {item && <PreviewBody key={item.id} item={item} ids={ids} onSelect={onSelect} isTop={isTop} />}
    </Modal>
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
  const p = state.progress[item.id];
  const history = useMemo(() => state.attempts.filter((a) => a.itemId === item.id), [state.attempts, item.id]);
  const last = history[history.length - 1];
  const [reveal, setReveal] = useState(history.length > 0);
  const confirm = useConfirm();
  const topic = bank.topics.get(item.topic);
  const idx = ids.indexOf(item.id);
  const prevId = idx > 0 ? ids[idx - 1] : null;
  const nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;
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

  const redo = async () => {
    // Mistake re-tests follow their own schedule; a plain redo of a paper held for a mock gets a warning first.
    const held = p?.inMistakes ? undefined : reservedFor(reservedMap(state, bank), item);
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

  return (
    <div className="mbp">
      <div className="mbp-meta">
        {topic && (
          <a className="mbp-topic" href={href('/notes/' + item.topic)}>
            <Icon name="notebook" size={13} />
            {topic.name}
          </a>
        )}
        <span className="mbp-meta-item" title="难度">
          难度
          <span className="mbp-diff">
            {[1, 2, 3].map((n) => (
              <i key={n} className={cx(n <= item.difficulty && 'on')} />
            ))}
          </span>
        </span>
        <span className="mbp-meta-item">
          <Icon name="clock" size={13} />
          考场节奏 {fmtClock(item.targetSec)}
        </span>
        {p?.inMistakes && (
          <span className="mbp-meta-item">
            <BoxDots box={p.box} />
            {due && <span className={cx('mbp-due', `tone-${due.tone}`)}>{due.text === '今天' ? '今天到期' : `${due.text}复习`}</span>}
          </span>
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
              <Icon name="bulb" size={15} />
              解析
            </h4>
            <Explanation item={item} />
          </section>
        </>
      ) : (
        <div className="mbp-hidden">
          <div>
            <b>这题你还没做过</b>
            <span className="muted">先自己做一遍，印象最深。</span>
          </div>
          <div className="row">
            <Button variant="ghost" icon="eye" onClick={() => setReveal(true)}>
              直接看答案
            </Button>
            <Button variant="primary" icon="play" onClick={() => void redo()}>
              做这题
            </Button>
          </div>
        </div>
      )}

      {p && reveal && <NoteEditor itemId={item.id} initial={p.note || ''} />}

      <footer className="mbp-foot">
        <div className="row">
          <IconButton icon="left" label="上一题（←）" disabled={!prevId} onClick={() => prevId && onSelect(prevId)} />
          <span className="mbp-pos num">{idx >= 0 ? `${idx + 1} / ${ids.length}` : ''}</span>
          <IconButton icon="right" label="下一题（→）" disabled={!nextId} onClick={() => nextId && onSelect(nextId)} />
        </div>
        <div className="row mbp-actions">
          <Button variant="ghost" icon="star" className={cx('mbp-star', p?.starred && 'is-on')} onClick={star}>
            {p?.starred ? '已收藏' : '收藏'}
          </Button>
          {p?.inMistakes && (
            <Button variant="ghost" icon="check" onClick={() => void dismiss()}>
              移出错题本
            </Button>
          )}
          <Button variant="primary" icon="refresh" onClick={() => void redo()}>
            {p?.inMistakes ? '重做这题' : history.length ? '再做一次' : '做这题'}
          </Button>
        </div>
      </footer>
      {confirm.node}
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
          <Icon name="target" size={15} />
          {last ? '上次作答' : '正确答案'}
        </h4>
        {last && (
          <div className="mbp-ans-facts">
            <ResultMark kind={kind} />
            <span className={cx('mbp-res-text', `is-${kind}`)}>{RESULT_TEXT[kind]}</span>
            {what && <span className="faint">· {what}</span>}
            <span className={cx('mbp-fact', slow && 'is-slow')} title={`考场节奏 ${fmtClock(item.targetSec)}`}>
              <Icon name="clock" size={13} />
              {fmtClock(last.seconds)}
              {slow && <span> · 超时</span>}
            </span>
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
      <span className="mbp-history-label">作答记录</span>
      {list.map((a) => {
        const k = resultOf(a);
        return (
          <span key={a.id} className={cx('mbp-hchip', `is-${k}`)} title={`${a.date} · ${MODE_LABEL[a.mode]} · ${RESULT_TEXT[k]} · ${fmtClock(a.seconds)}`}>
            <ResultMark kind={k} size="xs" />
            <span className="num">{fmtMD(a.date)}</span>
            <span className="faint">{MODE_LABEL[a.mode]}</span>
            <span className="num faint">{fmtClock(a.seconds)}</span>
          </span>
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
          <Icon name="pen" size={15} />
          我的笔记
        </span>
        <span className="mbp-note-state faint text-xs">{saved === 'saved' ? '已保存' : saved === 'dirty' ? '输入中…' : '自动保存'}</span>
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
