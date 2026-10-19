// #/mock/<resultId> — one mock's score, breakdowns, question grid, timing and the correction CTA.
import { useCallback, useMemo, useState } from 'react';
import type { MockResult, Subject } from '@shared/types.ts';
import { MOCK_LABEL, sessionLabel } from '@shared/bank.ts';
import { startBlock, startSession } from '@shared/actions.ts';
import { weekdayZh } from '@shared/dates.ts';
import { useReady, update } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { cx, fmtClock, fmtDateShort, pct, SUBJECT_NAME } from '../../lib/format.ts';
import { Badge, Button, Card, Empty, Progress, SubjectTag, useConfirm } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { ItemPreview, type PreviewContext } from '../practice/ItemPreview.tsx';
import { drillTitle, pickDrill, reservedFor, reservedMap, shortLabel } from '../practice/practiceData.ts';
import { masteryTone } from '../practice/TopicView.tsx';
import { correctionIds, findMockSession, isShaky, KIND_INFO, kindTarget, MOCK_MAX, resultRows, type ResultRow, type RowStatus } from './mockData.ts';
import { isSlow, TimeBars } from './charts.tsx';

const TOPIC_PREVIEW = 8;
const STATUS_TEXT: Record<RowStatus, string> = { right: '答对', partial: '部分正确', wrong: '答错', blank: '未作答' };

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
  const gap = r.estimate - target;
  const blank = rows.filter((x) => x.status === 'blank').length;
  const shaky = rows.filter(isShaky).length;

  const topics = useMemo(() => {
    const m = new Map<string, { topic: string; subject: Subject; n: number; got: number; wrong: number }>();
    for (const row of rows) {
      const t = m.get(row.item.topic) || { topic: row.item.topic, subject: row.item.subject, n: 0, got: 0, wrong: 0 };
      t.n += 1;
      t.got += row.score;
      if (row.status !== 'right') t.wrong += 1;
      m.set(row.item.topic, t);
    }
    return [...m.values()].sort((a, b) => a.got / a.n - b.got / b.n || b.n - a.n);
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
        body: held ? `${fmtDateShort(held.date)}「${held.title}」会用到这些题。现在练了，到时模考分数会偏高。` : '现在练了，之后的模考分数会偏高。',
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
            <Icon name={preview.status === 'right' ? 'checkCircle' : preview.status === 'blank' ? 'minus' : 'xCircle'} size={15} />
            本次模考：{STATUS_TEXT[preview.status]}
            {preview.status === 'partial' ? `（${pct(preview.score)}）` : ''} · 用时 {fmtClock(preview.seconds)}（目标 {fmtClock(preview.item.targetSec)}）
            {preview.confidence === 'guess' ? ' · 标记为蒙的' : preview.confidence === 'unsure' ? ' · 标记为没把握' : ''}
          </>
        ),
        noteTone: preview.status === 'right' ? 'success' : preview.status === 'partial' ? 'warning' : preview.status === 'blank' ? 'neutral' : 'danger',
      }
    : undefined;

  const bySubject = r.kind === 'science' && r.bySubject ? (['physics', 'chemistry'] as const).filter((s) => r.bySubject?.[s]) : [];

  return (
    <div className="page mk-result">
      <div className="mk-back">
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => navigate('/mock')}>
          模考
        </Button>
      </div>

      <header className="mk-res-head">
        <div>
          <div className="mk-eyebrow">
            <span className={cx('mk-swatch', `tone-${info.tone}`)} />
            {MOCK_LABEL[r.kind]} · {sessionLabel(r.session)}
          </div>
          <h1 className="page-title">模考成绩</h1>
          <p className="page-desc">
            {fmtDateShort(r.date)} {weekdayZh(r.date)} · 用时 {fmtClock(r.seconds)}
            {limit ? ` / ${fmtClock(limit)}` : ''}
          </p>
        </div>
      </header>

      <section className={cx('mk-score', `tone-${info.tone}`)}>
        <div className="mk-score-main">
          <div className="mk-score-label">估分</div>
          <div className="mk-score-line">
            <span className="mk-score-num">{r.estimate}</span>
            <span className="mk-score-max">/ {MOCK_MAX}</span>
          </div>
          <div className={cx('mk-score-gap', gap >= 0 ? 'is-up' : 'is-down')}>
            <Icon name={gap >= 0 ? 'trending' : 'target'} size={15} />
            {gap >= 0 ? `高于目标 ${target}，多 ${gap} 分` : `目标 ${target}，还差 ${-gap} 分`}
          </div>
          <Gauge value={r.estimate} target={target} max={MOCK_MAX} />
        </div>
        <div className="mk-score-side">
          <div className="mk-kpis">
            <Kpi label="得分率" value={pct(r.raw)} />
            <Kpi label="答对" value={`${r.correct}/${r.total}`} />
            <Kpi label="用时" value={fmtClock(r.seconds)} sub={limit ? `限时 ${fmtClock(limit)}` : `目标 ${fmtClock(totalTarget)}`} />
            <Kpi label="未作答" value={String(blank)} sub={blank ? '考场上先蒙一个' : '全部作答'} />
          </div>
          <div className="mk-cta">
            {fix.length ? (
              <>
                <Button variant="primary" size="lg" icon="refresh" block onClick={correct}>
                  {shaky ? '订正' : '订正错题'} · {fix.length} 题
                </Button>
                <p className="faint text-xs">
                  {shaky ? `含 ${shaky} 道答对但没把握的题。` : ''}先自己重做，再看解析。做错的题已进入错题本，隔天会再出现。
                </p>
              </>
            ) : (
              <p className="mk-perfect">
                <Icon name="award" size={16} />
                全部答对，没有需要订正的题。
              </p>
            )}
          </div>
        </div>
      </section>

      {bySubject.length > 0 && (
        <div className="mk-subjects">
          {bySubject.map((s) => {
            const part = r.bySubject?.[s];
            if (!part) return null;
            const t = state.profile.targets[s];
            const d = part.estimate - t;
            return (
              <Card key={s} className={cx('mk-subject', `tone-${s}`)}>
                <div className="row-between">
                  <SubjectTag subject={s} />
                  <span className={cx('mk-gap', d >= 0 ? 'is-up' : 'is-down')}>{d >= 0 ? `达标 +${d}` : `差 ${-d}`}</span>
                </div>
                <div className="mk-subject-line">
                  <span className="mk-subject-num num">{part.estimate}</span>
                  <span className="faint">/ 100 · 目标 {t}</span>
                </div>
                <Gauge value={part.estimate} target={t} max={100} />
                <div className="faint text-sm num">
                  答对 {part.correct}/{part.total} · 得分率 {pct(part.raw)}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card title="逐题对错" subtitle="点题号查看你的作答和解析" icon="grid" className="mk-grid-card">
        <div className="mk-qgroups">
          {groups.map((g) => (
            <div key={g.name} className="mk-qgroup">
              {groups.length > 1 && <div className="mk-qgroup-name">{g.name}</div>}
              <div className="mk-qgrid">
                {g.rows.map((row) => (
                  <button
                    key={row.item.id}
                    type="button"
                    className={cx('mk-q', `is-${row.status}`)}
                    onClick={() => setPreview(row)}
                    title={`${shortLabel(row.item)} · ${STATUS_TEXT[row.status]} · ${fmtClock(row.seconds)}`}
                  >
                    {row.no}
                    {(row.confidence === 'guess' || row.confidence === 'unsure') && <i className="mk-q-flag" aria-label="没把握" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mk-legend">
          <span>
            <i className="mk-lg is-right" />
            答对
          </span>
          {rows.some((x) => x.status === 'partial') && (
            <span>
              <i className="mk-lg is-partial" />
              部分正确
            </span>
          )}
          <span>
            <i className="mk-lg is-wrong" />
            答错
          </span>
          <span>
            <i className="mk-lg is-blank" />
            未作答
          </span>
          {rows.some((x) => x.confidence === 'guess' || x.confidence === 'unsure') && (
            <span>
              <i className="mk-lg-flag" />
              没把握
            </span>
          )}
        </div>
      </Card>

      <div className="mk-two">
        <Card title="各考点得分" subtitle="从最弱的开始补" icon="layers" className="mk-topics-card">
          <div className="mk-topics">
            {(allTopics ? topics : topics.slice(0, TOPIC_PREVIEW)).map((t) => {
              const acc = t.got / t.n;
              return (
                <div key={t.topic} className="mk-topic">
                  <div className="mk-topic-name">
                    <span title={bank.topics.get(t.topic)?.name}>{bank.topics.get(t.topic)?.name || t.topic}</span>
                    {r.kind === 'science' && <span className="faint text-xs">{SUBJECT_NAME[t.subject]}</span>}
                  </div>
                  <div className="mk-topic-bar">
                    <Progress value={acc} tone={masteryTone(acc)} size="sm" />
                  </div>
                  <span className="num mk-topic-n">
                    {Math.round(t.got * 10) / 10}/{t.n}
                  </span>
                  {acc < 0.8 ? (
                    <Button variant="ghost" size="sm" className="mk-topic-go" onClick={() => void drillTopic(t.topic, t.subject)}>
                      专项练
                    </Button>
                  ) : (
                    <span className="mk-topic-go mk-topic-ok">
                      <Icon name="check" size={14} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {topics.length > TOPIC_PREVIEW && (
            <Button variant="ghost" size="sm" className="mk-more" iconRight={allTopics ? 'up' : 'down'} onClick={() => setAllTopics((v) => !v)}>
              {allTopics ? '收起' : `展开全部 ${topics.length} 个考点`}
            </Button>
          )}
        </Card>

        <Card title="每题用时" subtitle={`横线是目标用时；橙色是超出 50% 以上的题`} icon="clock" className="mk-time-card">
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
              <div className="mk-chart-legend">
                <span>
                  <i className="mk-sw-bar" />
                  用时
                </span>
                <span>
                  <i className="mk-sw-slow" />
                  明显超时
                </span>
                <span>
                  <i className="mk-sw-tick" />
                  目标用时
                </span>
              </div>
              {slowest.length > 0 ? (
                <div className="mk-slow">
                  <div className="mk-slow-title">最拖时间的题</div>
                  {slowest.map((x) => (
                    <button key={x.item.id} type="button" className="mk-slow-row" onClick={() => setPreview(x)}>
                      <span className={cx('mk-sdot', `is-${x.status}`)} />
                      <span className="mk-slow-name">
                        {shortLabel(x.item)}
                        <span className="faint"> · {bank.topics.get(x.item.topic)?.name}</span>
                      </span>
                      <span className="num mk-slow-time">
                        {fmtClock(x.seconds)}
                        <span className="faint"> / {fmtClock(x.item.targetSec)}</span>
                      </span>
                      <Badge tone="warning" className="num">
                        +{fmtClock(x.seconds - x.item.targetSec)}
                      </Badge>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mk-pace-ok">
                  <Icon name="checkCircle" size={15} />
                  没有明显超时的题，节奏不错。
                </p>
              )}
            </>
          ) : (
            <Empty icon="clock" title="这次没有记录到每题用时" />
          )}
        </Card>
      </div>

      <ItemPreview itemId={preview?.item.id ?? null} onClose={closePreview} context={previewContext} />
      {confirm.node}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="mk-kpi">
      <span className="mk-kpi-label">{label}</span>
      <span className="mk-kpi-value num">{value}</span>
      {sub && <span className="mk-kpi-sub">{sub}</span>}
    </div>
  );
}

function Gauge({ value, target, max }: { value: number; target: number; max: number }) {
  const v = Math.max(0, Math.min(1, value / max));
  const t = Math.max(0, Math.min(1, target / max));
  return (
    <div className="mk-gauge" role="img" aria-label={`估分 ${value}，目标 ${target}，满分 ${max}`}>
      <div className="mk-gauge-track">
        <div className={cx('mk-gauge-fill', value >= target && 'is-met')} style={{ width: `${v * 100}%` }} />
      </div>
      <div className="mk-gauge-target" style={{ left: `${t * 100}%` }}>
        <span>目标</span>
      </div>
    </div>
  );
}

export function MockNotFound() {
  return (
    <div className="page mk-result">
      <div className="mk-back">
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => navigate('/mock')}>
          模考
        </Button>
      </div>
      <Empty icon="target" title="没有找到这次模考" desc="可能已经被删除了。回到模考页看看全部记录。" action={<Button variant="primary" onClick={() => navigate('/mock')}>回到模考</Button>} />
    </div>
  );
}
