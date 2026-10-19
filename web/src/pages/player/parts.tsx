// Smaller building blocks of the player screen.
import { useRef, type ReactNode } from 'react';
import type { Confidence, Item, ItemProgress, SessionAnswer } from '@shared/types.ts';
import type { GradeResult } from '@shared/grading.ts';
import { toggleStar } from '@shared/actions.ts';
import { daysBetween } from '@shared/dates.ts';
import { update, useApp } from '../../lib/store.ts';
import { Icon, type IconName } from '../../components/Icon.tsx';
import { Button, Kbd, Modal } from '../../components/ui.tsx';
import { Explanation } from '../../components/question/Explanation.tsx';
import { RichText } from '../../components/RichText.tsx';
import { optionBadge, optionLabel } from '../../components/question/OptionList.tsx';
import { cx, fmtClock } from '../../lib/format.ts';
import type { StripCell } from './TopBar.tsx';

// ─── Item header (source · topic · difficulty · target) ───

export function ItemHeader({ item, groupPos }: { item: Item; groupPos?: { n: number; of: number } }) {
  const topic = useApp((s) => s.bank?.topics.get(item.topic));
  const starred = useApp((s) => !!s.state?.progress[item.id]?.starred);
  return (
    <div className="pl-ihead">
      <div className="pl-ihead-main">
        <div className="pl-source" title={item.source.label}>
          <span className={cx('pl-source-dot', `tone-${item.subject}`)} />
          {item.source.label}
        </div>
        <div className="pl-ihead-meta">
          {topic && (
            <span className="pl-meta">
              <Icon name="layers" size={13} />
              {topic.name}
            </span>
          )}
          <span className="pl-meta" title={`难度 ${item.difficulty} / 3`}>
            <span className="pl-diff" aria-label={`难度 ${item.difficulty}`}>
              {[1, 2, 3].map((d) => (
                <i key={d} className={cx(d <= item.difficulty && 'is-on')} />
              ))}
            </span>
            {['基础', '标准', '较难'][item.difficulty - 1]}
          </span>
          <span className="pl-meta" title="EJU 考场节奏下的目标用时">
            <Icon name="clock" size={13} />
            目标 <span className="num">{fmtClock(item.targetSec)}</span>
          </span>
          {groupPos && groupPos.of > 1 && (
            <span className="pl-meta pl-meta-group">
              <Icon name="file" size={13} />
              同一篇 · 第 {groupPos.n} / {groupPos.of} 问
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        className={cx('pl-star', starred && 'is-on')}
        onClick={() => update((d) => toggleStar(d, item.id))}
        title={starred ? '取消收藏' : '收藏这题'}
        aria-pressed={starred}
      >
        <Icon name="star" size={18} />
      </button>
    </div>
  );
}

// ─── Listening hero texts ───

export function ListeningTitle({ item }: { item: Item }) {
  const m = item.source.label.match(/(\d+)番/);
  return (
    <>
      <Icon name="headphones" size={14} />
      聴解{m ? ` · ${m[1]}番` : ''}
    </>
  );
}

export function ListeningCaption({ item, revealed }: { item: Item; revealed: boolean }) {
  return (
    <>
      <RichText text={item.stem} lang="ja" className="pl-audio-stem" />
      {!revealed && <p className="pl-audio-tip">选项只在录音里读出。边听边记关键词，听完在右侧选 1–{item.options?.length ?? 4}。</p>}
    </>
  );
}

// ─── Confidence ───

const CONF: { value: Confidence; label: string; icon: IconName }[] = [
  { value: 'sure', label: '确定', icon: 'checkCircle' },
  { value: 'unsure', label: '没把握', icon: 'help' },
  { value: 'guess', label: '猜的', icon: 'flag' },
];

export function ConfidencePicker({ value, onChange, exam }: { value: Confidence; onChange: (c: Confidence) => void; exam: boolean }) {
  return (
    <div className="pl-conf" data-hotkeys>
      <span className="pl-conf-label">
        {exam ? '标记' : '把握'}
        <Kbd>F</Kbd>
      </span>
      <div className="pl-conf-seg" role="radiogroup">
        {CONF.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={value === c.value}
            className={cx('pl-conf-btn', `is-${c.value}`, value === c.value && 'is-on')}
            onClick={() => onChange(c.value)}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Icon name={c.icon} size={13} />
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function nextConfidence(c: Confidence): Confidence {
  return c === 'sure' ? 'unsure' : c === 'unsure' ? 'guess' : 'sure';
}

// ─── Result banner ───

function relDay(today: string, due: string): string {
  const n = daysBetween(today, due);
  if (n <= 0) return '今天';
  if (n === 1) return '明天';
  if (n === 2) return '后天';
  return `${n} 天后`;
}

export function ResultBanner({
  item,
  answer,
  grade,
  today,
  progress,
  exam,
}: {
  item: Item;
  answer: SessionAnswer;
  grade: GradeResult;
  today: string;
  progress?: ItemProgress;
  /** Exam review: an empty answer means time ran out / skipped, not "gave up". */
  exam?: boolean;
}) {
  const gaveUp = !!answer.gaveUp;
  const blank = !!exam && (answer.response === null || answer.response === undefined);
  const correct = !gaveUp && grade.correct;
  const groups = grade.groups || [];
  const partial = !correct && !gaveUp && item.format === 'blanks' && groups.some((g) => g.correct);
  const tone = correct ? 'success' : gaveUp ? 'warning' : partial ? 'warning' : 'danger';
  const icon: IconName = correct ? 'check' : gaveUp ? 'bulb' : 'x';

  let title: string;
  let sub: ReactNode = null;
  if (item.format === 'choice') {
    const right = item.answer !== undefined ? optionLabel(item, item.answer) : '?';
    title = correct ? '回答正确' : blank ? '未作答' : gaveUp ? '看懂解析就是收获' : '答错了';
    if (!correct) {
      const mine = typeof answer.response === 'number' ? optionLabel(item, answer.response) : null;
      sub = (
        <>
          正确答案 <b className="pl-res-key num">{optionBadge(right)}</b>
          {mine && !gaveUp && (
            <>
              <span className="pl-res-dot">·</span>你选了 <b className="pl-res-key is-mine num">{optionBadge(mine)}</b>
            </>
          )}
        </>
      );
    }
  } else {
    const ok = groups.filter((g) => g.correct).length;
    title = correct ? '全部正确' : blank ? '未作答' : gaveUp ? '看懂解析就是收获' : `对了 ${ok} / ${groups.length} 组`;
    if (!correct) sub = '答题卡上标出了每组的正确答案';
  }

  const secs = answer.seconds;
  const diff = secs - item.targetSec;
  const timeNote = Math.abs(diff) < 5 ? '正好在目标内' : diff < 0 ? `比目标快 ${fmtClock(-diff)}` : `超出目标 ${fmtClock(diff)}`;
  const conf = answer.confidence && answer.confidence !== 'sure' ? (answer.confidence === 'guess' ? '猜的' : '没把握') : null;
  let review: string | null = null;
  if (progress?.inMistakes && progress.due) {
    const when = relDay(today, progress.due);
    if (!correct) review = `已记入错题本 · ${when}再练`;
    else if (answer.confidence === 'guess') review = `猜对的题也会回来 · ${when}再练`;
    else review = `错题本复习中 · ${when}再确认一次`;
  }

  return (
    <div className={cx('pl-res', `tone-${tone}`)} role="status">
      <div className="pl-res-icon">
        <Icon name={icon} size={20} />
      </div>
      <div className="pl-res-body">
        <div className="pl-res-title">
          {title}
          {conf && <span className="pl-res-conf">{conf}</span>}
        </div>
        {sub && <div className="pl-res-sub">{sub}</div>}
        <div className="pl-res-meta">
          <span className={cx('pl-res-time', diff > 15 && 'is-over')}>
            <Icon name="clock" size={12} />
            用时 <span className="num">{fmtClock(secs)}</span> · 目标 <span className="num">{fmtClock(item.targetSec)}</span>
          </span>
          <span className="faint">{timeNote}</span>
        </div>
        {review && (
          <div className="pl-res-review">
            <Icon name="refresh" size={12} />
            {review}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Explanation card ───

export function ExplanationCard({ item, open, onToggle }: { item: Item; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const toggle = () => {
    onToggle();
    if (!open) setTimeout(() => ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 40);
  };
  const ex = item.explanation;
  const hint = [ex.keyPoints?.length ? '考点' : '', ex.traps?.length ? '易错点' : '', ex.shortcut ? '考场速解' : '', item.transcript ? '听力原文' : ''].filter(Boolean).join(' · ');
  return (
    <section className={cx('pl-card pl-excard', open && 'is-open')} ref={ref}>
      <button type="button" className="pl-excard-head" onClick={toggle} aria-expanded={open}>
        <span className="pl-card-title">
          <span className="pl-ex-icon">
            <Icon name="bulb" size={15} />
          </span>
          解析
        </span>
        {!open && <span className="faint text-sm pl-excard-hint">思路{hint && ` · ${hint}`}</span>}
        <span className="pl-excard-right">
          <Kbd>E</Kbd>
          <Icon name="down" size={16} className="pl-excard-chev" />
        </span>
      </button>
      {open && (
        <div className="pl-excard-body">
          <Explanation item={item} />
        </div>
      )}
    </section>
  );
}

// ─── Exam answer sheet (grid navigator) ───

export function ExamSheet({
  open,
  onClose,
  cells,
  current,
  onJump,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  cells: StripCell[];
  current: number;
  onJump: (i: number) => void;
  onSubmit: () => void;
}) {
  const answered = cells.filter((c) => c.answered).length;
  const flagged = cells.filter((c) => c.state === 'flag').length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="答题卡"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            继续作答
          </Button>
          <Button variant="primary" icon="check" onClick={onSubmit}>
            交卷
          </Button>
        </>
      }
    >
      <div className="pl-xs-legend">
        <span>
          <i className="pl-xs-dot is-answered" /> 已作答 <b className="num">{answered}</b>
        </span>
        <span>
          <i className="pl-xs-dot is-flag" /> 没把握 <b className="num">{flagged}</b>
        </span>
        <span>
          <i className="pl-xs-dot is-todo" /> 未作答 <b className="num">{cells.length - answered}</b>
        </span>
      </div>
      <div className="pl-xs-grid">
        {cells.map((c, i) => (
          <button
            key={i}
            type="button"
            className={cx('pl-xs-cell', `is-${c.state}`, i === current && 'is-current')}
            onClick={() => {
              onJump(i);
              onClose();
            }}
          >
            <span className="num">{i + 1}</span>
            {c.state === 'flag' && <Icon name="flag" size={10} className="pl-xs-flag" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}
