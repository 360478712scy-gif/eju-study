// #/mock/<resultId> — one mock's score, breakdowns, question grid, timing and the correction CTA.
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import type { MockResult, Subject } from '@shared/types.ts';
import { MOCK_LABEL, sessionLabel } from '@shared/bank.ts';
import { startBlock, startSession } from '@shared/actions.ts';
import { weekdayZh } from '@shared/dates.ts';
import { useReady, update } from '../../lib/store.ts';
import { href, navigate } from '../../lib/router.ts';
import { cx, fmtClock, fmtDateShort, pct, SUBJECT_NAME } from '../../lib/format.ts';
import { Badge, Button, Card, Dot, Empty, Legend, PageHeader, StatTile, StatusIcon, SubjectTag, Tooltip, useConfirm, type ItemStatus } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { ItemPreview, type PreviewContext } from '../practice/ItemPreview.tsx';
import { drillTitle, mockTitle, pickDrill, reservedFor, reservedMap, shortLabel } from '../practice/practiceData.ts';
import { correctionIds, findMockSession, isShaky, KIND_INFO, kindTarget, MOCK_MAX, resultRows, type ResultRow, type RowStatus } from './mockData.ts';
import { TargetGap } from './MockList.tsx';
import { isSlow, ScoreBar, TimeBars } from './charts.tsx';

const TOPIC_PREVIEW = 8;
const STATUS_TEXT: Record<RowStatus, string> = { right: '答对', partial: '部分正确', wrong: '答错', blank: '未作答' };
const STATUS_ICON: Record<RowStatus, ItemStatus> = { right: 'right', partial: 'partial', wrong: 'wrong', blank: 'skipped' };

export function MockResultView({ result: r }: { result: MockResult }) {
  const { state, bank, today } = useReady();
  const confirm = useConfirm();
  const [preview, setPreview] = useState<ResultRow | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);
  const [allTopics, setAllTopics] = useState(false);
  const rows = useMemo(() => resultRows(state, bank, r), [state, bank, r]);
  const target = kindTarget(state.profile, r.kind);
  const info = KIND_INFO[r.kind];
  const fix = correctionIds(rows);
  const session = findMockSession(state, r);
  const limit = session?.timeLimitSec;
  const blank = rows.filter((x) => x.status === 'blank').length;
  const shaky = rows.filter(isShaky).length;

  const topics = useMemo(() => {
    const m = new Map<string, { topic: string; subject: Subject; n: number; got: number; marks: RowStatus[] }>();
    for (const row of rows) {
      const t = m.get(row.item.topic) || { topic: row.item.topic, subject: row.item.subject, n: 0, got: 0, marks: [] };
      t.n += 1;
      t.got += row.score;
      t.marks.push(row.status);
      m.set(row.item.topic, t);
    }
    const order: Record<RowStatus, number> = { right: 0, partial: 1, wrong: 2, blank: 2 };
    for (const t of m.values()) t.marks.sort((a, b) => order[a] - order[b]);
    // Most points lost first; among equals, topics with more questions (more telling) lead. A topic
    // with one question is one square, so a single miss never reads as a red "0%".
    return [...m.values()].sort((a, b) => b.n - b.got - (a.n - a.got) || b.n - a.n || a.got / a.n - b.got / b.n);
  }, [rows]);

  const groups = useMemo(() => {
    const out: { name: string; rows: ResultRow[] }[] = [];
    for (const row of rows) {
      const last = out[out.length - 1];
      if (last && last.name === row.group) last.rows.push(row);
      else out.push({ name: row.group, rows: [row] });
    }
    return out;
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<RowStatus, number> = { right: 0, partial: 0, wrong: 0, blank: 0 };
    for (const x of rows) c[x.status]++;
    return c;
  }, [rows]);

  const slowest = useMemo(
    () =>
      rows
        .filter((x) => isSlow({ seconds: x.seconds, target: x.item.targetSec }))
        .sort((a, b) => b.seconds - b.item.targetSec - (a.seconds - a.item.targetSec))
        .slice(0, 5),
    [rows],
  );
  const totalTarget = rows.reduce((s, x) => s + x.item.targetSec, 0);

  const correct = () => {
    if (!fix.length) return;
    const block = state.plans[today]?.blocks.find((b) => b.status === 'todo' && b.reviewOfMock?.kind === r.kind && b.reviewOfMock.session === r.session);
    const s = update((d, bk) => {
      const b = block && d.plans[today]?.blocks.find((x) => x.id === block.id);
      const fromPlan = b ? startBlock(d, bk, b) : null;
      return fromPlan ?? startSession(d, { kind: 'review', title: `模考订正 · ${sessionLabel(r.session)} ${info.short}`, subject: info.subject, itemIds: fix });
    });
    navigate('/session/' + s.id);
  };

  const drillTopic = async (topic: string, subject: Subject) => {
    const reserved = reservedMap(state, bank);
    const pick = pickDrill(state, bank.byTopic.get(topic) || [], 10, reserved, today + topic);
    if (!pick.ids.length) return;
    if (pick.usesReserved) {
      const held = (bank.byTopic.get(topic) || []).map((it) => reservedFor(reserved, it)).find(Boolean);
      const ok = await confirm.ask('剩下的题都留给了模考', {
        body: held ? `${fmtDateShort(held.date)}「${mockTitle(held.title)}」会用到这些题。现在练了，到时模考分数会偏高。` : '现在练了，之后的模考分数会偏高。',
        ok: '仍然练习',
        focus: 'cancel',
      });
      if (!ok) return;
    }
    const s = update((d) => startSession(d, { kind: 'drill', title: drillTitle(bank, topic, pick.ids.length), subject, itemIds: pick.ids }));
    navigate('/session/' + s.id);
  };

  const previewContext: PreviewContext | undefined = preview
    ? {
        response: preview.response,
        note: (
          <>
            本次模考：{STATUS_TEXT[preview.status]}
            {preview.status === 'partial' ? `（${pct(preview.score)}）` : ''} · 用时 <span className="num">{fmtClock(preview.seconds)}</span>（目标 <span className="num">{fmtClock(preview.item.targetSec)}</span>）
            {preview.confidence === 'guess' ? ' · 标记为蒙的' : preview.confidence === 'unsure' ? ' · 标记为没把握' : ''}
          </>
        ),
        noteTone: preview.status === 'right' ? 'success' : preview.status === 'partial' ? 'warning' : preview.status === 'blank' ? 'neutral' : 'danger',
        noteIcon: preview.status === 'right' ? 'checkCircle' : preview.status === 'blank' ? 'minus' : preview.status === 'partial' ? 'alert' : 'xCircle',
      }
    : undefined;

  const bySubject = r.kind === 'science' && r.bySubject ? (['physics', 'chemistry'] as const).filter((s) => r.bySubject?.[s]) : [];

  return (
    <div className="page mk-result">
      <PageHeader
        back={{ label: '模考', href: href('/mock') }}
        eyebrow={
          <>
            <Dot tone={info.tone} />
            <span>{MOCK_LABEL[r.kind]}</span>
          </>
        }
        title="模考成绩"
        desc={
          <span className="num">
            {sessionLabel(r.session)} 真题 · {fmtDateShort(r.date)} {weekdayZh(r.date)}
          </span>
        }
      />

      <Card variant="hero" className={cx('mk-score', `tone-${info.tone}`)}>
        <div className="mk-score-top">
          <div className="mk-score-main">
            <div className="t-eyebrow">估分</div>
            <div className="mk-score-line">
              <span className="num num-2xl">{r.estimate}</span>
              <span className="num-unit">/ {MOCK_MAX}</span>
              <TargetGap value={r.estimate} target={target} />
            </div>
          </div>
          <div className="mk-stats">
            <StatTile label="得分率" value={pct(r.raw)} />
            <StatTile label="答对" value={`${r.correct}/${r.total}`} />
            <StatTile label="用时" value={fmtClock(r.seconds)} sub={limit ? `限时 ${fmtClock(limit)}` : `目标 ${fmtClock(totalTarget)}`} />
            <StatTile label="未作答" value={String(blank)} sub={blank ? '考场上先蒙一个' : '全部作答'} />
          </div>
        </div>
        <ScoreBar value={r.estimate} target={target} max={MOCK_MAX} />
        <div className="mk-cta">
          {fix.length ? (
            <>
              <Button variant="primary" size="lg" icon="refresh" className="mk-cta-btn" onClick={correct}>
                {shaky ? '订正' : '订正错题'} · <span className="num">{fix.length}</span> 题
              </Button>
              <p className="mk-cta-hint">
                {shaky ? `含 ${shaky} 道答对但没把握的题。` : ''}先自己重做，再看解析。做错的题已进入错题本。
              </p>
            </>
          ) : (
            <p className="mk-perfect">
              <StatusIcon status="right" />
              全部答对，没有需要订正的题。
            </p>
          )}
        </div>
      </Card>

      {bySubject.length > 0 && (
        <div className="mk-subjects">
          {bySubject.map((s) => {
            const part = r.bySubject?.[s];
            if (!part) return null;
            const t = state.profile.targets[s];
            return (
              // Subject identity lives in the tag; the bar stays neutral (green only once the target is met).
              <Card key={s} className="mk-subject">
                <div className="row-between">
                  <SubjectTag subject={s} />
                  <TargetGap value={part.estimate} target={t} />
                </div>
                <div className="mk-subject-line">
                  <span className="num num-lg">{part.estimate}</span>
                  <span className="num-unit">/ 100</span>
                </div>
                <ScoreBar value={part.estimate} target={t} max={100} size="sm" />
                <div className="mk-subject-meta num">
                  答对 {part.correct}/{part.total} · 得分率 {pct(part.raw)}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card title="逐题对错" subtitle="点题号看你的作答和解析" className="mk-grid-card">
        <div className="mk-qgroups">
          {groups.map((g) => (
            <div key={g.name} className="mk-qgroup">
              {groups.length > 1 && <div className="t-eyebrow mk-qgroup-name">{g.name}</div>}
              <div className="mk-qgrid">
                {g.rows.map((row) => (
                  <Tooltip key={row.item.id} label={`${shortLabel(row.item)} · ${STATUS_TEXT[row.status]} · ${fmtClock(row.seconds)}`}>
                    <button
                      type="button"
                      className={cx('mk-q num', `is-${row.status}`)}
                      onClick={() => setPreview(row)}
                      aria-label={`${g.name}第 ${row.no} 题，${STATUS_TEXT[row.status]}`}
                    >
                      {row.no}
                      {(row.confidence === 'guess' || row.confidence === 'unsure') && <i className="mk-q-flag" aria-label="没把握" />}
                    </button>
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Legend
          className="mk-legend"
          items={[
            { label: '答对', tone: 'success', value: counts.right },
            ...(counts.partial ? [{ label: '部分正确', tone: 'warning' as const, value: counts.partial }] : []),
            { label: '答错', tone: 'danger', value: counts.wrong },
            ...(counts.blank ? [{ label: '未作答', tone: 'neutral' as const, value: counts.blank }] : []),
            ...(rows.some((x) => x.confidence === 'guess' || x.confidence === 'unsure') ? [{ label: '没把握（右上角小点）', tone: 'warning' as const }] : []),
          ]}
        />
      </Card>

      <div className="mk-two">
        <Card title="各考点得分" subtitle="每格是一道题，失分多的排在前面；点一行练这个考点" className="mk-topics-card">
          <div className="mk-topics">
            {(allTopics ? topics : topics.slice(0, TOPIC_PREVIEW)).map((t) => (
              <TopicLine
                key={t.topic}
                name={bank.topics.get(t.topic)?.name || t.topic}
                sub={r.kind === 'science' ? SUBJECT_NAME[t.subject] : undefined}
                marks={t.marks}
                count={`${Math.round(t.got * 10) / 10}/${t.n}`}
                onDrill={() => void drillTopic(t.topic, t.subject)}
              />
            ))}
          </div>
          <div className="mk-topics-foot">
            {topics.length > TOPIC_PREVIEW ? (
              <Button variant="ghost" size="sm" iconRight={allTopics ? 'up' : 'down'} onClick={() => setAllTopics((v) => !v)}>
                {allTopics ? '收起' : `展开全部 ${topics.length} 个考点`}
              </Button>
            ) : (
              <span />
            )}
            <Legend
              items={[
                { label: '得分', tone: 'success', shape: 'square' },
                ...(counts.partial ? [{ label: '部分得分', tone: 'warning' as const, shape: 'square' as const }] : []),
                { label: '失分', color: 'var(--mk-lost)', shape: 'square' },
              ]}
            />
          </div>
        </Card>

        <Card title="每题用时" subtitle="和各题目标用时相比，虚线是目标；点柱子看那道题" className="mk-time-card">
          {rows.some((x) => x.seconds > 0) ? (
            <>
              <TimeBars
                bars={rows.map((x) => ({
                  id: x.item.id,
                  label: shortLabel(x.item),
                  group: x.group,
                  seconds: x.seconds,
                  target: x.item.targetSec,
                  result: STATUS_TEXT[x.status],
                }))}
                onSelect={(id) => setPreview(rows.find((x) => x.item.id === id) ?? null)}
              />
              <Legend
                className="mk-chart-legend"
                items={[
                  { label: '用时', shape: 'square', color: 'var(--mk-bar)' },
                  { label: '超出目标一半以上', shape: 'square', color: 'var(--mk-slow)' },
                  { label: '目标用时', shape: 'bar', color: 'var(--text-3)' },
                ]}
              />
              {slowest.length > 0 ? (
                <div className="mk-slow">
                  <div className="t-eyebrow mk-slow-title">最拖时间的题</div>
                  {slowest.map((x) => (
                    <button key={x.item.id} type="button" className="mk-slow-row" onClick={() => setPreview(x)}>
                      <StatusIcon status={STATUS_ICON[x.status]} size={18} />
                      <span className="mk-slow-name">
                        {shortLabel(x.item)}
                        <span className="faint"> · {bank.topics.get(x.item.topic)?.name}</span>
                      </span>
                      <span className="num mk-slow-time">
                        {fmtClock(x.seconds)}
                        <span className="faint"> / {fmtClock(x.item.targetSec)}</span>
                      </span>
                      <Badge tone="warning" className="num mk-slow-over">
                        +{fmtClock(x.seconds - x.item.targetSec)}
                      </Badge>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mk-pace-ok">
                  <StatusIcon status="right" size={18} />
                  没有明显超时的题，节奏不错。
                </p>
              )}
            </>
          ) : (
            <Empty icon="clock" size="sm" title="这次没有记录到每题用时" desc="下一场模考会自动记录每题用时。" />
          )}
        </Card>
      </div>

      <ItemPreview itemId={preview?.item.id ?? null} onClose={closePreview} context={previewContext} />
      {confirm.node}
    </div>
  );
}

/** One topic of this mock: one square per question (filled = points), the whole row starts a drill. */
function TopicLine({ name, sub, marks, count, onDrill }: { name: string; sub?: string; marks: RowStatus[]; count: string; onDrill: () => void }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onDrill();
    }
  };
  return (
    <div className="mk-topic" role="button" tabIndex={0} onClick={onDrill} onKeyDown={onKey} aria-label={`${name}：本次得分 ${count}，专项练 10 题`}>
      <div className="mk-topic-name">
        <span>{name}</span>
        {sub && <span className="mk-topic-sub">{sub}</span>}
      </div>
      <span className="mk-marks" aria-hidden>
        {marks.map((m, i) => (
          <i key={i} className={`is-${m}`} />
        ))}
      </span>
      <span className="mk-topic-trail">
        <span className="num mk-topic-n">{count}</span>
        <span className="mk-topic-go" aria-hidden>
          专项练
          <Icon name="arrowRight" size={14} />
        </span>
      </span>
    </div>
  );
}

export function MockNotFound() {
  return (
    <div className="page mk-result">
      <PageHeader back={{ label: '模考', href: href('/mock') }} title="模考成绩" />
      <Card>
        <Empty icon="target" title="没有找到这次模考" desc="可能已经被删除了。回到模考页看看全部记录。" action={<Button variant="primary" onClick={() => navigate('/mock')}>回到模考</Button>} />
      </Card>
    </div>
  );
}
