// 按考点: the taxonomy of one subject with per-topic progress and one-click drills.
import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { Item, Subject, TaxonomyTopic } from '@shared/types.ts';
import type { TopicStat } from '@shared/stats.ts';
import { startSession } from '@shared/actions.ts';
import { useReady, update } from '../../lib/store.ts';
import { href, navigate } from '../../lib/router.ts';
import { cx, fmtDateShort, pct, SUBJECT_NAME } from '../../lib/format.ts';
import { Badge, Button, Empty, IconButton, InfoTip, Segmented, Tooltip, useConfirm } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { drillTitle, isWeakTopic, masteryTarget, mockTitle, pickDrill, reservedFor, type DrillPick, type ReservedMap } from './practiceData.ts';
import { MasteryBar, MasteryLegend } from './Mastery.tsx';
import type { SubjectSummary } from './PracticePage.tsx';

const DRILL_SIZE = 10;

interface TopicRowData {
  topic: TaxonomyTopic;
  unitName: string;
  items: Item[];
  official: number;
  original: number;
  done: number;
  mistakes: number;
  stat?: TopicStat;
  weak: boolean;
  priority: number;
  pick: DrillPick;
}

type Order = 'units' | 'weak';

export function TopicView({
  subject,
  summary,
  stats,
  reserved,
  today,
  onOpenTopic,
}: {
  subject: Subject;
  summary: SubjectSummary;
  stats: Map<string, TopicStat>;
  reserved: ReservedMap;
  today: string;
  onOpenTopic: (topic: string) => void;
}) {
  const { state, bank } = useReady();
  const confirm = useConfirm();
  const [order, setOrder] = useState<Order>('units');
  const weakList = state.profile.weakTopics;
  const target = masteryTarget(state.profile, subject);

  const units = useMemo(() => {
    return bank.bundle.taxonomy.subjects[subject].units.map((u) => {
      const rows: TopicRowData[] = u.topics.map((t) => {
        const items = bank.byTopic.get(t.id) || [];
        let done = 0;
        let mistakes = 0;
        let official = 0;
        for (const it of items) {
          const p = state.progress[it.id];
          if (p && p.attempts > 0) done++;
          if (p?.inMistakes) mistakes++;
          if (it.source.kind === 'official') official++;
        }
        const stat = stats.get(t.id);
        const weak = isWeakTopic(weakList, t.id);
        const mastery = stat && stat.attempts > 0 ? stat.mastery : 0.6;
        return {
          topic: t,
          unitName: u.name,
          items,
          official,
          original: items.length - official,
          done,
          mistakes,
          stat,
          weak,
          priority: (t.weight / 5) * (1.15 - mastery) * (weak ? 1.35 : 1) + (done < items.length ? 0.02 : 0),
          pick: pickDrill(state, items, DRILL_SIZE, reserved, today + t.id),
        };
      });
      // Topics without questions yet do not get rows: they collapse into one muted line per unit.
      const empty = rows.filter((r) => !r.items.length).map((r) => r.topic);
      const filled = rows.filter((r) => r.items.length > 0);
      const total = filled.reduce((s, r) => s + r.items.length, 0);
      const done = rows.reduce((s, r) => s + r.done, 0);
      const mistakes = rows.reduce((s, r) => s + r.mistakes, 0);
      // Unit mastery: topic mastery weighted by how often each topic was tried (same scale as the rows).
      const tries = rows.reduce((s, r) => s + (r.stat?.attempts || 0), 0);
      const weighted = rows.reduce((s, r) => s + (r.stat && r.stat.attempts ? r.stat.mastery * r.stat.attempts : 0), 0);
      return { id: u.id, name: u.name, rows: filled, empty, total, done, mistakes, mastery: tries ? weighted / tries : null, weak: isWeakTopic(weakList, u.id) };
    });
  }, [bank, subject, state, stats, weakList, reserved, today]);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const ranked = useMemo(() => units.flatMap((u) => u.rows).sort((a, b) => b.priority - a.priority), [units]);
  /** The one recommended drill: the highest-priority topic that still has questions to pick. */
  const next = useMemo(() => ranked.find((r) => r.pick.ids.length > 0), [ranked]);
  const nextId = next?.topic.id;
  const inMistakes = units.reduce((s, u) => s + u.mistakes, 0);

  const drill = async (r: TopicRowData) => {
    const pick = r.pick;
    if (!pick.ids.length) return;
    if (pick.usesReserved) {
      const held = r.items.map((it) => reservedFor(reserved, it)).find(Boolean);
      const ok = await confirm.ask('剩下的题都留给了模考', {
        body: held ? `${fmtDateShort(held.date)}「${mockTitle(held.title)}」会用到这些题。现在练了，到时模考分数会偏高。` : '现在练了，之后的模考分数会偏高。',
        ok: '仍然练习',
        focus: 'cancel',
      });
      if (!ok) return;
    }
    const s = update((d) => startSession(d, { kind: 'drill', title: drillTitle(bank, r.topic.id, pick.ids.length), subject, itemIds: pick.ids }));
    navigate('/session/' + s.id);
  };

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderRow = (r: TopicRowData, flat: boolean, current = r.topic.id === nextId) => (
    <TopicRow
      key={r.topic.id}
      row={r}
      flat={flat}
      target={target}
      current={current}
      hasNote={bank.notesByTopic.has(r.topic.id)}
      onDrill={() => void drill(r)}
      onOpen={() => onOpenTopic(r.topic.id)}
    />
  );

  return (
    <div className="pr-topics">
      <div className="pr-toolbar">
        <div className="pr-summary">
          <span className="pr-summary-main">
            {SUBJECT_NAME[subject]} · <b className="num">{summary.total}</b> 题
          </span>
          <span className="pr-summary-sep" />
          <span>
            已做 <b className="num">{summary.done}</b>
          </span>
          <span>
            正确率 <b className="num">{pct(summary.accuracy)}</b>
          </span>
          <span>
            在错题本 <b className="num">{inMistakes}</b>
          </span>
          <InfoTip>「练 N 题」先出没做过的题，再出错题和最久没碰的题；留给模考的题会自动避开。点一行查看这个考点的全部题目。</InfoTip>
        </div>
        <Segmented<Order>
          size="sm"
          value={order}
          onChange={setOrder}
          options={[
            { value: 'units', label: '按单元' },
            { value: 'weak', label: '薄弱优先' },
          ]}
        />
      </div>

      <div className={cx('card card-flush pr-table', order === 'weak' && 'is-flat')}>
        <div className="pr-thead pr-grid" aria-hidden>
          <span>考点</span>
          <span className="is-num">已做</span>
          <span>掌握度</span>
          <span className="is-num">错题</span>
          <span />
        </div>
        {order === 'units' && next && (
          // The recommended drill sits on top (it can be anywhere in the unit order); its own
          // unit row stays plain so there is one filled button.
          <div className="pr-pinned">
            <div className="pr-pinned-label">建议先练</div>
            {renderRow(next, true, true)}
          </div>
        )}
        {order === 'units' ? (
          units.map((u) => {
            if (!u.total) return <NotesOnly key={u.id} unit={u.name} topics={u.empty} weak={u.weak} />;
            const open = !collapsed.has(u.id);
            return (
              <div key={u.id} className={cx('pr-unit', open && 'is-open')}>
                <button type="button" className="pr-unit-head pr-grid" onClick={() => toggle(u.id)} aria-expanded={open}>
                  <span className="pr-unit-title">
                    <Icon name="right" size={15} className="pr-unit-chevron" />
                    <span className="pr-unit-name">{u.name}</span>
                    {u.weak && (
                      <Badge size="sm" className="pr-weak">
                        薄弱
                      </Badge>
                    )}
                  </span>
                  {u.rows.length > 1 ? (
                    <>
                      <span className="pr-count num">
                        <b>{u.done}</b>
                        <span>/{u.total}</span>
                      </span>
                      <MasteryBar value={u.mastery} target={target} />
                      <span className={cx('pr-mistakes num', !u.mistakes && 'is-zero')}>{u.mistakes || '—'}</span>
                      <span />
                    </>
                  ) : null}
                </button>
                {open && (
                  <div className="pr-unit-rows">
                    {u.rows.map((r) => renderRow(r, false, false))}
                    {u.empty.length > 0 && <NotesOnly topics={u.empty} />}
                  </div>
                )}
              </div>
            );
          })
        ) : ranked.length ? (
          <div className="pr-unit-rows">{ranked.map((r) => renderRow(r, true))}</div>
        ) : (
          <Empty title="这一科还没有题目" desc="可以先去考点笔记复习，题目上线后会出现在这里。" action={<Button size="sm" onClick={() => navigate('/notes')}>看考点笔记</Button>} />
        )}
      </div>
      <div className="pr-foot">
        <span className="pr-foot-label">掌握度</span>
        <MasteryLegend target={target} />
      </div>
      {confirm.node}
    </div>
  );
}

function TopicRow({
  row: r,
  flat,
  target,
  current,
  hasNote,
  onDrill,
  onOpen,
}: {
  row: TopicRowData;
  flat: boolean;
  target: number;
  current: boolean;
  hasNote: boolean;
  onDrill: () => void;
  onOpen: () => void;
}) {
  const tried = !!r.stat && r.stat.attempts > 0;
  const n = r.pick.ids.length;
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    // A button inside the row does its own thing.
    const inner = (e.target as HTMLElement).closest('button, a');
    if (inner && inner !== e.currentTarget) return;
    onOpen();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <div className={cx('pr-topic pr-grid', current && 'is-current')} role="button" tabIndex={0} onClick={onClick} onKeyDown={onKey} aria-label={`${r.topic.name}：查看全部 ${r.items.length} 题`}>
      <div className="pr-topic-main">
        <div className="pr-topic-line">
          <span className="pr-topic-name">{r.topic.name}</span>
          {r.weak && (
            <Badge size="sm" className="pr-weak">
              薄弱
            </Badge>
          )}
        </div>
        <div className="pr-topic-sub">
          {flat && r.unitName !== r.topic.name && <span>{r.unitName}</span>}
          {r.topic.ja && r.topic.ja !== r.topic.name && !(flat && r.topic.ja === r.unitName) && <span lang="ja">{r.topic.ja}</span>}
          <span className="num">{!r.official ? `${r.original} 道原创题` : r.original ? `真题 ${r.official} · 原创 ${r.original}` : `${r.official} 道真题`}</span>
        </div>
      </div>
      <span className="pr-count num">
        <b>{r.done}</b>
        <span>/{r.items.length}</span>
      </span>
      <Tooltip label={tried && r.stat ? `作答 ${r.stat.attempts} 次，得分 ${Math.round(r.stat.correct * 10) / 10}` : '还没练过'}>
        <span className="pr-topic-mastery">
          <MasteryBar value={tried && r.stat ? r.stat.mastery : null} target={target} />
        </span>
      </Tooltip>
      <span className={cx('pr-mistakes num', !r.mistakes && 'is-zero')}>{r.mistakes || '—'}</span>
      <div className="pr-topic-actions">
        {hasNote ? <IconButton icon="notebook" label="考点笔记" size="sm" onClick={() => navigate('/notes/' + r.topic.id)} /> : <span />}
        {n > 0 ? (
          <Tooltip label={r.pick.usesReserved ? '剩下的题都留给了模考' : '没做过的优先，其次是错题'}>
            <Button variant={current ? 'primary' : 'ghost'} size="sm" icon={r.pick.usesReserved ? 'flag' : 'play'} className="pr-drill" onClick={onDrill}>
              练 <span className="num">{n}</span> 题
            </Button>
          </Tooltip>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

/**
 * Topics (or a whole unit) without questions yet: one muted line. It expands into the topic names,
 * which open their notes.
 */
function NotesOnly({ unit, topics, weak }: { unit?: string; topics: TaxonomyTopic[]; weak?: boolean }) {
  const { bank } = useReady();
  const [open, setOpen] = useState(false);
  const withNotes = topics.filter((t) => bank.notesByTopic.has(t.id)).length;
  const label = unit
    ? withNotes === topics.length
      ? `只有笔记 · ${topics.length} 个考点`
      : `暂无题目 · ${topics.length} 个考点`
    : withNotes === topics.length
      ? `另有 ${topics.length} 个考点只有笔记`
      : `另有 ${topics.length} 个考点暂无题目`;
  return (
    <div className={cx('pr-notes-only', unit && 'is-unit', open && 'is-open')}>
      <button type="button" className="pr-notes-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {unit && (
          <span className="pr-notes-unit">
            <Icon name="right" size={15} className="pr-unit-chevron" />
            {unit}
            {weak && (
              <Badge size="sm" className="pr-weak">
                薄弱
              </Badge>
            )}
          </span>
        )}
        <span className="pr-notes-label">
          {label}
          {!unit && <Icon name="right" size={13} className="pr-notes-caret" />}
        </span>
      </button>
      {open && (
        <div className="pr-notes-links">
          {topics.map((t) =>
            bank.notesByTopic.has(t.id) ? (
              <a key={t.id} className="pr-notes-link" href={href('/notes/' + t.id)}>
                <Icon name="notebook" size={13} />
                {t.name}
              </a>
            ) : (
              <span key={t.id} className="pr-notes-link is-plain">
                {t.name}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
