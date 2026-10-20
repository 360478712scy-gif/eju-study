// Today's task list under the hero: what comes next (three rows, the rest folded), what does not
// fit before bedtime ("明天继续"), and the finished / skipped tasks folded into one summary row.
import { useState, type ReactNode } from 'react';
import { navigate } from '../../lib/router.ts';
import { Badge, Button, IconTile, List, ListRow, Tooltip, toast } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import type { AppState, PlanBlock, Subject } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { SCALE_MAX } from '@shared/stats.ts';
import { cx, fmtMinutes } from '../../lib/format.ts';
import {
  blockCount,
  blockIcon,
  blockKindLabel,
  blockReason,
  blockTone,
  countLabel,
  displayTitle,
  finishBlockManually,
  finishedSessionFor,
  openSessionFor,
  redoBlock,
  restoreBlock,
  sessionAnswered,
  skipBlock,
  type BlockView,
} from './blocks.ts';
import { TOTAL_MAX } from './scores.ts';

export interface Entry {
  block: PlanBlock;
  view: BlockView;
}

const SHOW_NEXT = 3;

/** Skip a task with an undo action in the toast (Today rows and 跟学). */
export function skipWithUndo(id: string) {
  skipBlock(id);
  toast(
    <span className="td-toast">
      已跳过，随时可以恢复
      <button type="button" className="td-toast-undo" onClick={() => restoreBlock(id)}>
        撤销
      </button>
    </span>,
    'neutral',
    5000,
  );
}

/** Accuracy that counts as "at target" for a block: the subject's target share of its scale. */
function targetRate(state: AppState, subject: Subject | 'mixed'): number {
  if (subject === 'mixed') return state.profile.targetTotal / TOTAL_MAX;
  return state.profile.targets[subject] / SCALE_MAX[subject];
}

/** The reason without its trailing numbers in brackets ("（新题 7 · 回炉 6）"), which go to the tooltip. */
function shortReason(r: string): string {
  return r.replace(/\s*[（(][^）)]*[）)]\s*[。.]?$/, '').trim();
}

function Row({
  state,
  bank,
  today,
  entry,
  later,
  onStart,
}: {
  state: AppState;
  bank: BankIndex;
  today: string;
  entry: Entry;
  /** Does not fit before tonight's bedtime. */
  later?: boolean;
  onStart: (b: PlanBlock) => void;
}) {
  const { block: b, view } = entry;
  const n = blockCount(state, bank, b, today);
  const title = displayTitle(state, bank, b, today);
  const reason = blockReason(state, bank, b, today);
  const kind = blockKindLabel(b);
  const isMock = b.kind === 'mock';
  const open = view === 'active' ? openSessionFor(state, b.id) : undefined;
  const mockResult = isMock && b.mock && view === 'done' ? [...state.mocks].reverse().find((m) => m.kind === b.mock?.kind && m.session === b.mock?.session) : undefined;
  const size = [n !== null ? countLabel(b, n) : null, fmtMinutes(b.minutes)].filter(Boolean).join(' · ');
  const short = shortReason(reason);
  // The kind leads the line when the title does not already say it ("专项练习 · 掌握度 68%…").
  const metaText = title.startsWith(kind.slice(0, 2)) || isMock ? short : `${kind} · ${short}`;

  let trail: ReactNode = <span className="td-row-size num">{size}</span>;
  let hover: ReactNode = null;
  let onClick: (() => void) | undefined;

  switch (view) {
    case 'todo':
      onClick = () => onStart(b);
      if (later) trail = <span className="td-row-size">明天</span>;
      hover = (
        <>
          <Tooltip label="跳过这一项，可随时恢复">
            <button type="button" className="btn btn-ghost btn-sm td-row-skip" onClick={() => skipWithUndo(b.id)}>
              <Icon name="skip" size={14} />
              <span>跳过</span>
            </button>
          </Tooltip>
          <Button size="sm" variant="ghost" iconRight="arrowRight" className="td-row-go" onClick={() => onStart(b)}>
            {isMock ? '开始模考' : '开始'}
          </Button>
        </>
      );
      break;
    case 'active':
      onClick = () => onStart(b);
      if (open) {
        trail = (
          <span className="td-row-size num">
            已做 {sessionAnswered(open)}/{open.itemIds.length}
          </span>
        );
      }
      hover = (
        <>
          {!open && (
            <Button size="sm" variant="ghost" icon="check" className="td-row-skip" onClick={() => finishBlockManually(b.id)}>
              完成
            </Button>
          )}
          <Button size="sm" variant="ghost" iconRight="arrowRight" className="td-row-go" onClick={() => onStart(b)}>
            继续
          </Button>
        </>
      );
      break;
    case 'done': {
      const r = b.result;
      const fin = finishedSessionFor(state, b.id);
      if (mockResult) {
        trail = (
          <span className="td-row-size">
            估分 <b className="num">{mockResult.estimate}</b>
          </span>
        );
        onClick = () => navigate('/mock/' + mockResult.id);
        hover = (
          <Button size="sm" variant="ghost" iconRight="arrowRight" className="td-row-go" onClick={() => navigate('/mock/' + mockResult.id)}>
            报告
          </Button>
        );
      } else {
        if (r && r.answered > 0) {
          const good = r.correct / r.answered >= targetRate(state, b.subject);
          trail = (
            <span className="td-row-size">
              对 <b className={cx('num', good && 'is-good')}>{`${r.correct}/${r.answered}`}</b>
              <span className="td-row-sep">·</span>
              <span className="num">{fmtMinutes(Math.max(1, r.seconds / 60))}</span>
            </span>
          );
        } else trail = <span className="td-row-size">已完成</span>;
        onClick = fin ? () => navigate('/session/' + fin.id) : () => redoBlock(state, b);
        if (!isMock) {
          hover = (
            <Button size="sm" variant="ghost" icon="refresh" className="td-row-go" onClick={() => redoBlock(state, b)}>
              {b.kind === 'vocab' ? '再背' : b.kind === 'notes' || b.kind === 'traps' ? '再看' : '再练'}
            </Button>
          );
        }
      }
      break;
    }
    case 'skipped':
      trail = <span className="td-row-size">已跳过</span>;
      onClick = () => restoreBlock(b.id);
      hover = (
        <Button size="sm" variant="ghost" icon="undo" className="td-row-go" onClick={() => restoreBlock(b.id)}>
          恢复
        </Button>
      );
      break;
    case 'locked':
      trail = (
        <span className="td-row-size td-row-locked">
          <Icon name="lock" size={13} />
          模考交卷后解锁
        </span>
      );
      break;
  }

  const tone = view === 'done' ? 'success' : view === 'skipped' || view === 'locked' ? 'neutral' : blockTone(b);
  return (
    <ListRow
      className={cx('td-row', `is-${view}`, later && 'is-later', hover !== null && 'has-hover')}
      lead={<IconTile icon={view === 'done' ? 'check' : view === 'skipped' ? 'skip' : blockIcon(b)} tone={tone} size="md" />}
      title={
        <>
          {title}
          {b.extra && (
            <Badge size="sm" className="td-row-badge">
              加练
            </Badge>
          )}
          {isMock && (
            <Badge size="sm" tone="primary" className="td-row-badge">
              真题整卷
            </Badge>
          )}
        </>
      }
      meta={
        <Tooltip label={reason} side="bottom">
          <span>{metaText}</span>
        </Tooltip>
      }
      trail={trail}
      hoverAction={hover}
      onClick={onClick}
    />
  );
}

/** A folded group: one quiet row that opens to show the tasks inside. */
function FoldRow({ lead, title, meta, open, onToggle }: { lead: ReactNode; title: ReactNode; meta?: ReactNode; open: boolean; onToggle: () => void }) {
  return (
    <ListRow
      className={cx('td-fold', open && 'is-open')}
      lead={lead}
      title={title}
      meta={meta}
      trail={
        <span className="td-fold-go">
          {open ? '收起' : '查看'}
          <Icon name={open ? 'up' : 'down'} size={14} />
        </span>
      }
      onClick={onToggle}
    />
  );
}

export function PlanList({
  state,
  bank,
  today,
  upcoming,
  later,
  finished,
  title,
  sub,
  actions,
  footer,
  onStart,
}: {
  state: AppState;
  bank: BankIndex;
  today: string;
  upcoming: Entry[];
  later: Entry[];
  finished: Entry[];
  title: ReactNode;
  sub: ReactNode;
  actions: ReactNode;
  footer?: ReactNode;
  onStart: (b: PlanBlock) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [laterOpen, setLaterOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const shown = moreOpen ? upcoming : upcoming.slice(0, SHOW_NEXT);
  const hidden = upcoming.slice(SHOW_NEXT);
  const hiddenMin = hidden.reduce((s, e) => s + e.block.minutes, 0);
  const done = finished.filter((e) => e.view === 'done');
  const skipped = finished.filter((e) => e.view === 'skipped');
  const doneMin = done.reduce((s, e) => s + (e.block.result ? e.block.result.seconds / 60 : e.block.minutes), 0);
  const allDone = !upcoming.length && !later.length;
  const row = (e: Entry, isLater?: boolean) => <Row key={e.block.id} state={state} bank={bank} today={today} entry={e} later={isLater} onStart={onStart} />;

  return (
    <section className="card card-flush td-plan">
      <header className="td-plan-head">
        <div className="td-plan-headtext">
          <h2 className="card-title">{title}</h2>
          <p className="card-sub">{sub}</p>
        </div>
        <div className="td-plan-actions">{actions}</div>
      </header>
      <List className="td-list">
        {shown.map((e) => row(e))}
        {hidden.length > 0 && (
          <FoldRow
            lead={
              <span className="td-fold-lead" aria-hidden>
                <Icon name="list" size={16} />
              </span>
            }
            title={moreOpen ? '收起后面的任务' : `其余 ${hidden.length} 项`}
            meta={moreOpen ? undefined : `约 ${fmtMinutes(hiddenMin)}`}
            open={moreOpen}
            onToggle={() => setMoreOpen((o) => !o)}
          />
        )}
        {later.length > 0 && (
          <>
            <FoldRow
              lead={<IconTile icon="moon" tone="neutral" size="md" />}
              title={`明天继续 · ${later.length} 项`}
              meta="今晚的时间不够，睡前不再开新任务"
              open={laterOpen}
              onToggle={() => setLaterOpen((o) => !o)}
            />
            {laterOpen && later.map((e) => row(e, true))}
          </>
        )}
        {finished.length > 0 && (
          <>
            <FoldRow
              lead={<IconTile icon={done.length ? 'check' : 'skip'} tone={done.length ? 'success' : 'neutral'} size="md" />}
              title={
                done.length
                  ? allDone
                    ? `${done.length} 项已完成${skipped.length ? ` · 跳过 ${skipped.length} 项` : ''}`
                    : `已完成 ${done.length} 项${skipped.length ? ` · 跳过 ${skipped.length} 项` : ''}`
                  : `已跳过 ${skipped.length} 项`
              }
              meta={done.length ? `共 ${fmtMinutes(doneMin)}` : '点开可以恢复'}
              open={doneOpen}
              onToggle={() => setDoneOpen((o) => !o)}
            />
            {doneOpen && finished.map((e) => row(e))}
          </>
        )}
      </List>
      {footer}
    </section>
  );
}
