// 按真题卷: papers × sections matrix; a cell opens the section for untimed practice.
import { Fragment, useMemo, useState } from 'react';
import type { AppState, Item, MockResult } from '@shared/types.ts';
import { sessionLabel } from '@shared/bank.ts';
import { planSeconds, type ScheduledMock } from '@shared/planner.ts';
import { startSession } from '@shared/actions.ts';
import { useReady, update } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { cx, fmtDateShort, pct } from '../../lib/format.ts';
import { Button, IconButton, SubjectDot, SubjectTag, useConfirm } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { itemStatus, isWrong, SECTIONS, sectionItems, sessionRank, shortLabel, type ReservedMap, type SectionDef, type SectionKey } from './practiceData.ts';

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
        return { session: paper.session, section, items, done, right, wrong, held: items.length ? reserved.get(`${section.mock}:${paper.session}`) : undefined, mock };
      });
      return { paper, cells, total: cells.reduce((s, c) => s + c.items.length, 0), done: cells.reduce((s, c) => s + c.done, 0) };
    });
  }, [bank, state.progress, state.mocks, reserved]);

  const start = async (cell: Cell, items: Item[], what: string) => {
    if (!items.length) return;
    if (cell.held) {
      const ok = await confirm.ask('这套卷留给了模考', {
        body: `${fmtDateShort(cell.held.date)}「${cell.held.title}」会用这套卷的${cell.section.name}。现在练了，到时模考分数会偏高；想找练习题可以换一套没有旗标的卷子。`,
        ok: '仍然现在练',
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
      <div className="pr-legend">
        <span>
          <b className="num">已做/总题数</b> · 点格子展开本节，不限时练习
        </span>
        <span className="pr-legend-item">
          <span className="pr-flag">
            <Icon name="flag" size={11} />
          </span>
          留给模考，先别做
        </span>
        <span className="pr-legend-item">
          <span className="pr-mockdone">
            <Icon name="check" size={11} />
          </span>
          已用来模考
        </span>
      </div>

      <div className="pr-matrix">
        <div className="pr-mx-head">
          <span>真题卷</span>
          {SECTIONS.map((s) => (
            <span key={s.key} className="pr-mx-col">
              <SubjectDot subject={s.subject} />
              {s.short}
            </span>
          ))}
        </div>
        {papers.map(({ paper, cells, total, done }) => {
          const openCell = open?.session === paper.session ? cells.find((c) => c.section.key === open.key) : undefined;
          return (
            <Fragment key={paper.session}>
              <div className={cx('pr-mx-row', openCell && 'is-open')}>
                <div className="pr-mx-paper">
                  <span className="pr-mx-label">{paper.label}</span>
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
  if (!c.items.length) {
    return (
      <div className="pr-cell is-none" aria-label="本卷没有这一科">
        —
      </div>
    );
  }
  const frac = c.done / c.items.length;
  return (
    <button
      type="button"
     
      className={cx('pr-cell', `tone-${c.section.subject}`, active && 'is-active', c.held && 'is-held', frac === 1 && 'is-full')}
      onClick={onClick}
      aria-label={`${c.section.name} 已做 ${c.done}/${c.items.length}${c.held ? '，留给模考' : ''}`}
      title={c.held ? `留给 ${fmtDateShort(c.held.date)}「${c.held.title}」` : c.mock ? `已用来模考 · 估分 ${c.mock.estimate}` : `${c.section.name} · 已做 ${c.done}/${c.items.length}`}
      aria-expanded={active}
    >
      <span className="pr-cell-top">
        <span className="num pr-cell-count">
          <b>{c.done}</b>/{c.items.length}
        </span>
        {c.held ? (
          <span className="pr-flag" aria-label="留给模考">
            <Icon name="flag" size={11} />
          </span>
        ) : c.mock ? (
          <span className="pr-mockdone" aria-label="已模考">
            <Icon name="check" size={11} />
          </span>
        ) : c.done > 0 ? (
          <span className="num pr-cell-acc">{pct(c.right / c.done)}</span>
        ) : null}
      </span>
      <span className="pr-cell-bar">
        <i style={{ width: `${frac * 100}%` }} />
      </span>
    </button>
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
    <div className={cx('pr-panel', `tone-${c.section.subject}`)}>
      <div className="pr-panel-head">
        <div className="pr-panel-title">
          <SubjectTag subject={c.section.subject} size="sm" />
          <b>
            {sessionLabel(c.session)} · {c.section.name}
          </b>
          <span className="faint num">
            {c.items.length} 题 · 已做 {c.done} · 约 {minutes} 分钟
          </span>
        </div>
        <IconButton icon="x" label="收起" size="sm" onClick={onClose} />
      </div>

      {c.held && (
        <div className="pr-held">
          <Icon name="flag" size={14} />
          <span>
            这套卷安排在 <b>{fmtDateShort(c.held.date)}</b>「{c.held.title}」。现在练会提前见到原题，模考就不准了。
          </span>
        </div>
      )}
      {c.mock && (
        <button type="button" className="pr-mock-link" onClick={() => navigate('/mock/' + c.mock!.id)}>
          <Icon name="award" size={14} />
          <span>
            {fmtDateShort(c.mock.date)} 用这套卷模考过 · 估分 <b className="num">{c.mock.estimate}</b>
          </span>
          <Icon name="arrowRight" size={14} />
        </button>
      )}

      <div className="pr-chips">
        {c.items.map((it, i) => {
          const st = itemStatus(progress[it.id]);
          return (
            <button key={it.id} type="button" className={cx('pr-chip', `is-${st}`)} onClick={() => onPreview(it.id)} title={`${shortLabel(it)} · ${st === 'new' ? '没做过' : st === 'right' ? '上次答对' : '上次答错'}`}>
              {i + 1}
            </button>
          );
        })}
      </div>

      <div className="pr-panel-actions">
        <Button variant={c.held ? 'secondary' : 'primary'} size="sm" icon="play" onClick={() => onStart(c.items, '整节练习')}>
          整节练习 · {c.items.length} 题
        </Button>
        {fresh.length > 0 && fresh.length < c.items.length && (
          <Button variant="secondary" size="sm" onClick={() => onStart(fresh, '没做过的题')}>
            只练没做过的 · {fresh.length}
          </Button>
        )}
        {wrong.length > 0 && (
          <Button variant="ghost" size="sm" icon="refresh" onClick={() => onStart(wrong, '重做错题')}>
            重做错题 · {wrong.length}
          </Button>
        )}
        <span className="pr-panel-hint faint">不限时，每题提交后立刻看解析</span>
      </div>
    </div>
  );
}
