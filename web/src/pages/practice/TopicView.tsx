// 按考点: the taxonomy of one subject with per-topic progress and one-click drills.
import { useMemo, useState } from 'react';
import type { Item, Subject, TaxonomyTopic } from '@shared/types.ts';
import type { TopicStat } from '@shared/stats.ts';
import { startSession } from '@shared/actions.ts';
import { useReady, update } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { cx, fmtDateShort, pct, SUBJECT_NAME } from '../../lib/format.ts';
import { Badge, Button, Empty, Progress, Segmented, useConfirm, type Tone } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { drillTitle, isWeakTopic, pickDrill, reservedFor, type DrillPick, type ReservedMap } from './practiceData.ts';
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

export function masteryTone(m: number): Tone {
  if (m < 0.55) return 'danger';
  if (m < 0.75) return 'warning';
  return 'success';
}

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
      // Unit mastery: topic mastery weighted by how often each topic was tried (same scale as the rows).
      const tries = rows.reduce((s, r) => s + (r.stat?.attempts || 0), 0);
      const weighted = rows.reduce((s, r) => s + (r.stat && r.stat.attempts ? r.stat.mastery * r.stat.attempts : 0), 0);
      return { id: u.id, name: u.name, rows: filled, empty, total, done, mastery: tries ? weighted / tries : null, weak: isWeakTopic(weakList, u.id) };
    });
  }, [bank, subject, state, stats, weakList, reserved, today]);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const ranked = useMemo(
    () =>
      units.flatMap((u) => u.rows).sort((a, b) => b.priority - a.priority),
    [units],
  );

  const drill = async (r: TopicRowData) => {
    const pick = r.pick;
    if (!pick.ids.length) return;
    if (pick.usesReserved) {
      const held = r.items.map((it) => reservedFor(reserved, it)).find(Boolean);
      const ok = await confirm.ask('剩下的题都留给了模考', {
        body: held ? `${fmtDateShort(held.date)}「${held.title}」会用到这些题。现在练了，到时模考分数会偏高。` : '现在练了，之后的模考分数会偏高。',
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

  const renderRow = (r: TopicRowData, showUnit: boolean) => (
    <TopicRow
      key={r.topic.id}
      row={r}
      showUnit={showUnit}
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
            在错题本 <b className="num">{units.reduce((s, u) => s + u.rows.reduce((x, r) => x + r.mistakes, 0), 0)}</b>
          </span>
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

      <div className="pr-table">
        <div className="pr-thead" aria-hidden>
          <span>考点</span>
          <span>已做</span>
          <span>掌握度</span>
          <span>错题</span>
          <span />
        </div>
        {order === 'units' ? (
          units.map((u) => {
            if (!u.total) return <NoQuestions key={u.id} unit={u.name} topics={u.empty} weak={u.weak} />;
            const open = !collapsed.has(u.id);
            return (
              <div key={u.id} className={cx('pr-unit', open && 'is-open')}>
                <button type="button" className="pr-unit-head" onClick={() => toggle(u.id)} aria-expanded={open}>
                  <Icon name="right" size={15} className="pr-unit-chevron" />
                  <span className="pr-unit-name">{u.name}</span>
                  {u.weak && (
                    <Badge tone="warning" className="pr-weak">
                      薄弱
                    </Badge>
                  )}
                  <span className="pr-unit-meta">
                    <span className="num">
                      {u.done}/{u.total}
                    </span>
                    <span className="pr-unit-bar">
                      <i style={{ width: `${(u.done / u.total) * 100}%` }} />
                    </span>
                    {u.mastery !== null && (
                      <span className="num pr-unit-acc" title="本单元掌握度">
                        掌握 {pct(u.mastery)}
                      </span>
                    )}
                  </span>
                </button>
                {open && (
                  <div className="pr-unit-rows">
                    {u.rows.map((r) => renderRow(r, false))}
                    {u.empty.length > 0 && <NoQuestions topics={u.empty} />}
                  </div>
                )}
              </div>
            );
          })
        ) : ranked.length ? (
          <div className="pr-unit-rows">{ranked.map((r) => renderRow(r, true))}</div>
        ) : (
          <Empty title="这一科还没有题目" />
        )}
      </div>
      <p className="pr-foot-note">
        <Icon name="info" size={13} />
        「练 10 题」先出没做过的题，再出错题和最久没碰的题；留给模考的题会自动避开。点考点名查看全部题目。
      </p>
      {confirm.node}
    </div>
  );
}

function TopicRow({ row: r, showUnit, hasNote, onDrill, onOpen }: { row: TopicRowData; showUnit: boolean; hasNote: boolean; onDrill: () => void; onOpen: () => void }) {
  const tried = !!r.stat && r.stat.attempts > 0;
  const n = r.pick.ids.length;
  return (
    <div className="pr-topic">
      <div className="pr-topic-main">
        <div className="pr-topic-line">
          <button type="button" className="pr-topic-name" onClick={onOpen} title="查看这个考点的全部题目">
            {r.topic.name}
          </button>
          {r.weak && (
            <Badge tone="warning" className="pr-weak">
              薄弱
            </Badge>
          )}
        </div>
        <div className="pr-topic-sub">
          {showUnit && <span>{r.unitName}</span>}
          {r.topic.ja && <span lang="ja">{r.topic.ja}</span>}
          <span>{r.original ? `真题 ${r.official} · 原创 ${r.original}` : `${r.official} 道真题`}</span>
        </div>
      </div>
      <div className="pr-topic-count">
        <span className="num">
          <b>{r.done}</b>
          <span className="faint">/{r.items.length}</span>
        </span>
      </div>
      <div className="pr-topic-mastery" title={tried && r.stat ? `作答 ${r.stat.attempts} 次，得分 ${Math.round(r.stat.correct * 10) / 10}` : undefined}>
        {tried && r.stat ? (
          <>
            <Progress value={r.stat.mastery} tone={masteryTone(r.stat.mastery)} size="sm" />
            <span className="num">{pct(r.stat.mastery)}</span>
          </>
        ) : (
          <span className="faint">未练</span>
        )}
      </div>
      <div className="pr-topic-mistakes">
        {r.mistakes > 0 ? (
          <Badge tone="danger" className="num">
            {r.mistakes}
          </Badge>
        ) : (
          <span className="faint">0</span>
        )}
      </div>
      <div className="pr-topic-actions">
        {hasNote ? (
          <Button variant="ghost" size="sm" icon="notebook" onClick={() => navigate('/notes/' + r.topic.id)} title="看考点笔记">
            笔记
          </Button>
        ) : (
          <span className="pr-note-gap" />
        )}
        {n ? (
          <Button variant="soft" size="sm" icon={r.pick.usesReserved ? 'flag' : 'play'} onClick={onDrill} title={r.pick.usesReserved ? '剩下的题都留给了模考' : '没做过的优先，其次是错题'}>
            练 {n} 题
          </Button>
        ) : (
          <span className="pr-empty-tag">暂无可练</span>
        )}
      </div>
    </div>
  );
}

/** Topics (or a whole unit) without questions yet: one muted line; topic names open their notes. */
function NoQuestions({ unit, topics, weak }: { unit?: string; topics: TaxonomyTopic[]; weak?: boolean }) {
  const { bank } = useReady();
  return (
    <div className={cx('pr-none', unit && 'pr-unit is-unit')}>
      {unit && <span className="pr-none-unit">{unit}</span>}
      {unit && weak && (
        <Badge tone="warning" className="pr-weak">
          薄弱
        </Badge>
      )}
      <span className="pr-none-label">暂无题目</span>
      <span className="pr-none-topics">
        {topics.map((t) =>
          bank.notesByTopic.has(t.id) ? (
            <button key={t.id} type="button" className="pr-none-topic is-link" onClick={() => navigate('/notes/' + t.id)} title="看考点笔记">
              <Icon name="notebook" size={12} />
              {t.name}
            </button>
          ) : (
            <span key={t.id} className="pr-none-topic">
              {t.name}
            </span>
          ),
        )}
      </span>
    </div>
  );
}
