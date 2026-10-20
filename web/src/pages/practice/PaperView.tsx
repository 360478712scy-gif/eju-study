// 按真题卷: papers × sections matrix; a cell opens the section for untimed practice.
import { Fragment, useMemo, useState } from 'react';
import type { AppState, Item, MockResult } from '@shared/types.ts';
import { sessionLabel } from '@shared/bank.ts';
import { planSeconds, type ScheduledMock } from '@shared/planner.ts';
import { startSession } from '@shared/actions.ts';
import { useReady, update } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { cx, fmtDateShort, fmtMinutes, pct } from '../../lib/format.ts';
import { Badge, Button, Callout, IconButton, InfoTip, SubjectDot, SubjectTag, Tooltip, useConfirm } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { itemStatus, isWrong, mockTitle, SECTIONS, sectionItems, sessionRank, shortLabel, type ReservedMap, type SectionDef, type SectionKey } from './practiceData.ts';

interface Cell {
  session: string;
  section: SectionDef;
  items: Item[];
  done: number;
  right: number;
  wrong: number;
  held?: ScheduledMock;
  mock?: MockResult;
}

const STATUS_TEXT = { new: '没做过', right: '上次答对', wrong: '上次答错' } as const;

export function PaperView({ reserved, onPreview }: { reserved: ReservedMap; onPreview: (id: string) => void }) {
  const { state, bank } = useReady();
  const confirm = useConfirm();
  const [open, setOpen] = useState<{ session: string; key: SectionKey } | null>(null);

  const papers = useMemo(() => {
    const sessions = [...bank.bundle.papers].sort((a, b) => sessionRank(b.session) - sessionRank(a.session));
    return sessions.map((paper) => {
      const cells = SECTIONS.map((section): Cell => {
        const items = sectionItems(bank, section.key, paper.session);
        let done = 0;
        let right = 0;
        let wrong = 0;
        for (const it of items) {
          const p = state.progress[it.id];
          if (p && p.attempts > 0) {
            done++;
            if (p.lastCorrect) right++;
          }
          if (isWrong(p)) wrong++;
        }
        const mock = [...state.mocks].reverse().find((m) => m.kind === section.mock && m.session === paper.session);
        return { session: paper.session, section, items, done, right, wrong, held: items.length ? reserved.papers.get(`${section.mock}:${paper.session}`) : undefined, mock };
      });
      const held = cells.filter((c) => c.held);
      return { paper, cells, held, total: cells.reduce((s, c) => s + c.items.length, 0), done: cells.reduce((s, c) => s + c.done, 0) };
    });
  }, [bank, state.progress, state.mocks, reserved]);

  const summary = useMemo(
    () => ({
      done: papers.reduce((s, p) => s + p.done, 0),
      total: papers.reduce((s, p) => s + p.total, 0),
      held: papers.filter((p) => p.held.length > 0).length,
    }),
    [papers],
  );

  const start = async (cell: Cell, items: Item[], what: string) => {
    if (!items.length) return;
    if (cell.held) {
      const ok = await confirm.ask('这套卷留给了模考', {
        body: `${fmtDateShort(cell.held.date)}「${mockTitle(cell.held.title)}」会用这套卷的${cell.section.name}。现在练了，到时模考分数会偏高；想找练习题可以换一套没有「留给模考」的卷子。`,
        ok: '仍然现在练',
        focus: 'cancel',
      });
      if (!ok) return;
    }
    const s = update((d) =>
      startSession(d, {
        kind: 'free',
        title: `${sessionLabel(cell.session)} ${cell.section.name} · ${what}`,
        subject: cell.section.subject,
        itemIds: items.map((it) => it.id),
      }),
    );
    navigate('/session/' + s.id);
  };

  return (
    <div className="pr-papers">
      <div className="pr-toolbar">
        <div className="pr-summary">
          <span className="pr-summary-main">
            真题卷 · <b className="num">{papers.length}</b> 套
          </span>
          <span className="pr-summary-sep" />
          <span>
            已做 <b className="num">{summary.done}</b>
            <span className="num">/{summary.total}</span> 题
          </span>
          {summary.held > 0 && (
            <span>
              留给模考 <b className="num">{summary.held}</b> 套
            </span>
          )}
          <InfoTip>格子里是已做 / 总题数。点开一节可以不限时整节练习，每题提交后马上看解析。带「留给模考」的卷子已排进模考日程，先别练。</InfoTip>
        </div>
      </div>

      <div className="card card-flush pr-matrix">
        <div className="pr-mx-head pr-mx-grid" aria-hidden>
          <span>真题卷</span>
          {SECTIONS.map((s) => (
            <span key={s.key} className="pr-mx-col">
              <SubjectDot subject={s.subject} />
              {s.short}
            </span>
          ))}
        </div>
        {papers.map(({ paper, cells, held, total, done }) => {
          const openCell = open?.session === paper.session ? cells.find((c) => c.section.key === open.key) : undefined;
          return (
            <Fragment key={paper.session}>
              <div className={cx('pr-mx-row pr-mx-grid', openCell && 'is-open')}>
                <div className="pr-mx-paper">
                  <span className="pr-mx-label">
                    {paper.label}
                    {held.length > 0 && (
                      <Tooltip label={`${held.map((c) => c.section.short).join('、')}留给 ${fmtDateShort(held[0].held!.date)}「${mockTitle(held[0].held!.title, true)}」`}>
                        <span className="pr-mx-held" tabIndex={0}>
                          <Badge size="sm">留给模考</Badge>
                        </span>
                      </Tooltip>
                    )}
                  </span>
                  <span className="pr-mx-sub num">
                    {done}/{total} 题
                  </span>
                </div>
                {cells.map((c) => (
                  <PaperCell
                    key={c.section.key}
                    cell={c}
                    active={openCell === c}
                    onClick={() => setOpen(openCell === c ? null : { session: c.session, key: c.section.key })}
                  />
                ))}
              </div>
              {openCell && (
                <SectionPanel
                  cell={openCell}
                  progress={state.progress}
                  onClose={() => setOpen(null)}
                  onPreview={onPreview}
                  onStart={(items, what) => void start(openCell, items, what)}
                />
              )}
            </Fragment>
          );
        })}
      </div>
      {confirm.node}
    </div>
  );
}

function PaperCell({ cell: c, active, onClick }: { cell: Cell; active: boolean; onClick: () => void }) {
  // A paper without this section: a blank cell, no placeholder glyph.
  if (!c.items.length) return <span className="pr-cell is-none" aria-hidden />;
  const frac = c.done / c.items.length;
  const tip = c.held
    ? `留给 ${fmtDateShort(c.held.date)}「${mockTitle(c.held.title, true)}」`
    : c.mock
      ? `已用来模考 · 估分 ${c.mock.estimate}`
      : c.done
        ? `已做 ${c.done} 题 · 上次答对 ${pct(c.right / c.done)}`
        : `${c.items.length} 题，还没做过`;
  return (
    <Tooltip label={tip}>
      <button
        type="button"
        className={cx('pr-cell', `tone-${c.section.subject}`, active && 'is-active', c.held && 'is-held')}
        onClick={onClick}
        aria-label={`${c.section.name} 已做 ${c.done}/${c.items.length}${c.held ? '，留给模考' : ''}`}
        aria-expanded={active}
      >
        <span className="pr-cell-value num">
          <b>{c.done}</b>
          <span>/{c.items.length}</span>
          {c.mock && <Icon name="check" size={13} className="pr-cell-mock" />}
        </span>
        <span className="pr-cell-bar">
          <i style={{ width: `${frac * 100}%` }} />
        </span>
      </button>
    </Tooltip>
  );
}

function SectionPanel({
  cell: c,
  progress,
  onClose,
  onPreview,
  onStart,
}: {
  cell: Cell;
  progress: AppState['progress'];
  onClose: () => void;
  onPreview: (id: string) => void;
  onStart: (items: Item[], what: string) => void;
}) {
  const fresh = c.items.filter((it) => itemStatus(progress[it.id]) === 'new');
  const wrong = c.items.filter((it) => isWrong(progress[it.id]));
  const minutes = Math.max(1, Math.round(c.items.reduce((s, it) => s + planSeconds(it), 0) / 60));
  return (
    <div className="pr-panel">
      <div className="pr-panel-head">
        <div className="pr-panel-title">
          <SubjectTag subject={c.section.subject} size="sm" />
          <b>
            {sessionLabel(c.session)} · {c.section.name}
          </b>
          <span className="pr-panel-meta num">
            {c.items.length} 题 · 已做 {c.done} · 约 {fmtMinutes(minutes)}
          </span>
        </div>
        <IconButton icon="x" label="收起" size="sm" onClick={onClose} />
      </div>

      {c.held && (
        <Callout tone="warning" icon="flag">
          这套卷安排在 <b>{fmtDateShort(c.held.date)}</b>「{mockTitle(c.held.title)}」。现在练会提前见到原题，模考就不准了。
        </Callout>
      )}
      {c.mock && (
        <button type="button" className="pr-mock-link" onClick={() => navigate('/mock/' + c.mock!.id)}>
          <Icon name="award" size={15} className="pr-mock-link-icon" />
          <span>
            {fmtDateShort(c.mock.date)} 用这套卷模考过 · 估分 <b className="num">{c.mock.estimate}</b>
            <span className="faint"> / 200</span>
          </span>
          <Icon name="right" size={15} className="pr-mock-link-go" />
        </button>
      )}

      <div className="pr-chips">
        {c.items.map((it, i) => {
          const st = itemStatus(progress[it.id]);
          return (
            <Tooltip key={it.id} label={`${shortLabel(it)} · ${STATUS_TEXT[st]}`}>
              <button type="button" className={cx('pr-chip num', `is-${st}`)} onClick={() => onPreview(it.id)} aria-label={`第 ${i + 1} 题，${STATUS_TEXT[st]}`}>
                {i + 1}
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div className="pr-panel-actions">
        <Button variant={c.held ? 'secondary' : 'primary'} size="sm" icon="play" onClick={() => onStart(c.items, '整节练习')}>
          整节练习 · <span className="num">{c.items.length}</span> 题
        </Button>
        {fresh.length > 0 && fresh.length < c.items.length && (
          <Button variant="secondary" size="sm" onClick={() => onStart(fresh, '没做过的题')}>
            只练没做过的 · <span className="num">{fresh.length}</span>
          </Button>
        )}
        {wrong.length > 0 && (
          <Button variant="ghost" size="sm" icon="refresh" onClick={() => onStart(wrong, '重做错题')}>
            重做错题 · <span className="num">{wrong.length}</span>
          </Button>
        )}
        <span className="pr-panel-hint">不限时 · 点题号先看题</span>
      </div>
    </div>
  );
}
