import { useMemo, useState } from 'react';
import type { Paper } from '@shared/bank.ts';
import type { MockResult, PracticeSession } from '@shared/types.ts';
import { planView } from '@shared/selectors.ts';
import { Page } from '../../shell/Shell.tsx';
import { Bar, Button, Card, Chip, Empty, Icon, List, Modal, Ring, Row, Section, SubjectGlyph } from '../../ui/ui.tsx';
import { t } from '../../copy/index.ts';
import { findItem, percent, schoolNames, shortDate, topicName } from '../../lib/model.ts';
import { go, itemLink, link } from '../../lib/navigation.ts';
import { useStudy } from '../../lib/study.tsx';
import './mock.css';

const kindTitle = { math: t.mock.ejuMathTitle, science: t.mock.ejuScienceTitle, school: t.mock.schoolRowTitle };
const score = (result: MockResult) => result.estimate == null ? t.mock.rawScore(percent(result.raw)) : t.mock.reportScoreRing(result.estimate, 200);

export function Mock({ reportId }: { reportId?: string | null }) {
  const { bank, date, state, active, openSession, action } = useStudy();
  const [selected, select] = useState<Paper>();
  const [busy, setBusy] = useState(false);
  const schedule = useMemo(() => planView(state, bank, date, date).mocks, [state, bank, date]);
  const report = state.mocks.find(record => record.id === reportId);
  if (report) return <MockReport report={report} />;

  const paperCard = (paper: Paper, showSchool = false) => {
    const kind = paper.kind;
    const previous = state.mocks.findLast(result => result.kind === kind && result.session === paper.session);
    const planned = schedule.find(entry => entry.session === paper.session && entry.kind === kind && !entry.done)?.date;
    return <Card key={kind + paper.session} className="mock-card" onClick={() => select(paper)}>
      <div className="hstack mock-heading">
        <SubjectGlyph subject={kind === 'science' ? 'physics' : kind} size="lg" />
        <div className="mock-name"><div className="mock-title">{showSchool && paper.school ? schoolNames[paper.school] : kindTitle[kind]}</div>
          <div className="t-3">{paper.label} · {t.time.durationSec(paper.timeLimitSec)}</div></div>
        <Icon name="chev-right" size={18} />
      </div>
      <div className="mock-foot">
        {showSchool && <Chip tone={paper.schoolPurpose === 'exam_style' ? 'school' : 'neutral'} sm>{paper.schoolPurpose === 'exam_style' ? t.mock.examStyle : t.mock.extension}</Chip>}
        <span className="t-3">{previous ? previous.estimate == null ? score(previous) : t.mock.lastScore(previous.estimate, 200) : t.mock.neverTaken}</span>
        <span className="spacer" /><Chip icon="calendar" sm>{planned ? t.mock.nextScheduled(shortDate(planned)) : t.mock.unscheduled}</Chip>
      </div>
    </Card>;
  };

  return <Page title={t.mock.title} desc={t.mock.subtitle} actions={active?.exam && <Button icon="play" onClick={() => openSession(active)}>{t.mock.resumeMockBtn}</Button>}>
    <Section title={t.mock.ejuRowTitle} desc={t.mock.ejuRowSubtitle}>
      <div className="grid grid-2">{(['math','science'] as const).map(kind => {
        const papers = bank.papers.filter(p => p.kind === kind);
        const index = papers.findIndex(p => schedule.some(entry => entry.session === p.session && entry.kind === kind && entry.date && !entry.done));
        const primary = papers[index >= 0 ? index : 0];
        return <div className="mock-kind" key={kind}>
          {primary ? paperCard(primary) : <Card title={kindTitle[kind]}><Empty title={t.practice.noPapers} /></Card>}
          {papers.length > 1 && <details className="mock-papers">
            <summary>{t.common.viewAllBtn}</summary>
            <List>{papers.filter(p => p !== primary).map(p => <Row key={p.session} title={p.label} trail={t.time.durationSec(p.timeLimitSec)} chevron onClick={() => select(p)} />)}</List>
          </details>}
        </div>;
      })}</div>
    </Section>
    <Section title={t.mock.schoolRowTitle} desc={t.mock.schoolRowSubtitle}>
      <div className="grid grid-3">{bank.papers.filter(p => p.kind === 'school').map(p => paperCard(p, true))}</div>
      {!bank.papers.some(p => p.kind === 'school') && <Empty title={t.practice.noPapers} />}
      <p className="t-3">{t.mock.schoolPolicyNote}</p>
    </Section>
    <Section title={t.mock.history}>
      {!state.mocks.length ? <Empty icon="trophy" title={t.empty.mockNoRecordTitle} desc={t.empty.mockNoRecordBody} /> : <List>
        {state.mocks.slice().reverse().map(result => <Row key={result.id} lead={<SubjectGlyph subject={result.kind === 'science' ? 'physics' : result.kind} />}
          title={bank.papers.find(p => p.kind === result.kind && p.session === result.session)?.label ?? kindTitle[result.kind]}
          meta={[shortDate(result.date), t.mock.answered(result.answered, result.total)]} trail={score(result)} chevron
          onClick={() => go(link('mock') + '?' + new URLSearchParams({ report: result.id }))} />)}
      </List>}
    </Section>
    <Modal open={!!selected} onClose={() => select(undefined)} closeLabel={t.common.closeBtn} title={t.mock.confirmStartTitle}
      footer={selected && <Button variant="primary" icon="play" loading={busy} disabled={busy} onClick={async () => {
        if (active) { select(undefined); openSession(active); return; }
        setBusy(true);
        try {
          const session = await action<PracticeSession>({ type: 'startMock', kind: selected.kind, session: selected.session });
          if (session) { select(undefined); openSession(session); }
        } finally { setBusy(false); }
      }}>{active ? t.today.resumeTodayBtn : t.mock.confirmStartNowBtn(Math.round(selected.timeLimitSec / 60))}</Button>}>
      {selected && <><p>{selected.label} · {t.common.questionCount(selected.itemIds.length)}</p>
        <p>{active ? t.common.activeSession : t.mock.confirmStartBody(Math.round(selected.timeLimitSec / 60))}</p></>}
    </Modal>
  </Page>;
}

function MockReport({ report }: { report: MockResult }) {
  const { bank, state, startItems } = useStudy();
  const session = state.sessions[report.id];
  const paper = bank.papers.find(entry => entry.kind === report.kind && entry.session === report.session);
  const items = report.itemIds.map(id => ({ id, item: findItem(bank, state, id),
    answer: session?.answers[id] ?? state.attempts.findLast(a => a.sessionId === report.id && a.itemId === id) }));
  const incorrect = items.filter(row => row.item && !row.answer?.correct).map(row => row.id);
  const breakdown = new Map<string, { earned: number; total: number }>();
  for (const { item, answer } of items) {
    if (!item) continue;
    const points = item.written?.parts.reduce((sum, part) => sum + part.points, 0) ?? 1;
    const group = breakdown.get(item.topic) ?? { earned: 0, total: 0 };
    group.total += points;
    group.earned += (answer?.score ?? (answer?.correct ? 1 : 0)) * points;
    breakdown.set(item.topic, group);
  }

  return <Page title={t.mock.reportTitle} desc={shortDate(report.date)}
    actions={<Button icon="chev-left" onClick={() => go(link('mock'))}>{t.mock.backToMocksBtn}</Button>}>
    <Card className="mock-summary">
      <Ring value={report.raw} size={116} stroke={7} tone={report.kind === 'school' ? 'school' : 'primary'}><b className="num">{score(report)}</b></Ring>
      <div><h2>{paper?.label ?? kindTitle[report.kind]}</h2>
        <p>{t.mock.answered(report.answered, report.total)}</p>
        <p className="t-3">{paper ? t.mock.reportDuration(Math.round(report.seconds / 60), Math.round(paper.timeLimitSec / 60)) : t.time.durationSec(report.seconds)}</p>
        {report.bySubject && Object.entries(report.bySubject).map(([subject, result]) => <Chip key={subject}>
          {t.common.subjectName(subject as 'math' | 'physics' | 'chemistry')} · {t.common.scorePoints(result.estimate)}
        </Chip>)}
      </div>
    </Card>
    <Section title={t.mock.reportBreakdownTitle}>
      <List>{[...breakdown].sort(([,a], [,b]) => (b.total - b.earned) - (a.total - a.earned)).map(([topic, value]) => <Row
        key={topic} title={topicName(bank, topic)} meta={[t.mock.reportScoreRing(Number(value.earned.toFixed(2)), value.total)]}
        trail={<span className="mock-breakdown-bar"><Bar value={value.earned} max={value.total} /></span>} />)}</List>
    </Section>
    <Section title={t.mock.reviewQuestion} actions={!!incorrect.length && <Button icon="history" onClick={() => void startItems(incorrect, 'review')}>{t.mock.reviewMockMistakesBtn}</Button>}>
      <List>{items.map(({ id, item, answer }) => <Row key={id} lead={item && <SubjectGlyph subject={item.subject} size="sm" />}
        title={item?.source.label ?? id} meta={[item ? topicName(bank, item.topic) : t.common.missingItem]}
        trail={answer ? t.common.percent(percent(answer.score ?? Number(answer.correct))) : t.session.overviewUnanswered}
        onClick={item && session ? () => go(itemLink(session.id) + '?' + new URLSearchParams({ item: id })) : undefined} />)}</List>
    </Section>
  </Page>;
}
