import { useState } from 'react';
import type { Item, SessionAnswer, WrittenResponse } from '@shared/types.ts';
import { CheckRow } from '../../ui/Learning.tsx';
import { Button, Chip, Glass, Tabs, TextArea, ThinkRing } from '../../ui/ui.tsx';
import { RichText } from '../../ui/RichText.tsx';
import { useCoachJob } from '../../lib/useCoach.ts';
import type { CoachResults } from '../../lib/api.ts';
import { t } from '../../copy/index.ts';

export function WrittenGrade({ item, text, saved, sealed, onSubmit, disabled }: {
  item: Item;
  text: string;
  saved?: SessionAnswer;
  sealed?: boolean;
  disabled?: boolean;
  onSubmit: (response: WrittenResponse) => void;
}) {
  const parts = item.written?.parts ?? [];
  const possible = parts.reduce((sum, part) => sum + part.points, 0);
  const existing = saved?.response as WrittenResponse | undefined;
  const record = existing?.marks;
  const [tab, setTab] = useState<'self' | 'ai'>('self');
  const [marks, setMarks] = useState<Record<string, number[]>>(() => Object.fromEntries(parts.map(part => [part.id, part.rubric.map(() => 0)])));
  const [script, setScript] = useState(text);
  const [graded, setGraded] = useState<CoachResults['grade']>();
  const coach = useCoachJob<'grade'>();
  const shown = record ?? marks;
  const total = Object.values(shown).flat().reduce((sum, n) => sum + n, 0);
  const grade = async () => {
    if (!script.trim() || record) return;
    const job = await coach.run('grade', { itemId: item.id, text: script });
    if (job?.result) setGraded(job.result);
  };
  return <Glass kind="read" className="explain written-grade selectable">
    <div className="hstack written-heading"><h3>{t.session.modelAnswerHeading}</h3><Chip>{t.session.writtenTotalPoints(possible)}</Chip></div>
    {parts.map(part => <div className="written-part" key={part.id}>
      <h4>{part.label} {t.session.writtenPartPoints(part.points)}</h4>
      <RichText text={part.modelAnswer} lang="ja" />
      {part.final && <div className="written-final"><b>{t.session.finalAnswerHeading}</b> <RichText text={part.final} lang="ja" inline /></div>}
    </div>)}
    {!record && <Tabs value={tab} onChange={setTab} options={[{ value: 'self', label: t.session.tabSelfGrade }, { value: 'ai', label: t.session.tabAiGrade }]} />}
    {tab === 'self' || record ? <>
      <p className="t-2">{record ? t.session.selfGradeTotal(total, possible) : t.session.selfGradePrompt}</p>
      {parts.map(part => <div key={part.id} className="written-rubric">
        <b>{part.label}</b>
        {part.rubric.map((entry, i) => <CheckRow key={i} checked={shown[part.id]?.[i] > 0} disabled={Boolean(record) || disabled}
          onChange={checked => setMarks(old => ({ ...old, [part.id]: old[part.id].map((n,j) => j === i ? checked ? entry.points : 0 : n) }))}>
          <RichText text={entry.text} lang="ja" inline /> · {record ? t.common.outOf(entry.points) + ' · ' + t.common.scorePoints(record[part.id]?.[i] ?? 0) : t.session.rubricPointsTag(entry.points)}
        </CheckRow>)}
      </div>)}
      {!record && <Button variant="primary" disabled={disabled} onClick={() => onSubmit({ method: 'self', marks, ...(sealed || script ? { text: sealed ? text : script } : {}) })}>
        {t.session.saveSelfGradeBtn(total, possible)}
      </Button>}
    </> : <>
      <p>{sealed ? t.session.examWrittenDraft : t.session.aiGradeInputLabel}</p>
      {sealed ? <Glass kind="card" className="written-original"><RichText text={script} /></Glass>
        : <TextArea value={script} onChange={value => { setScript(value); setGraded(undefined); }} placeholder={t.session.aiGradePlaceholder} />}
      <div className="hstack written-heading">
        <Button variant="primary" icon="coach" disabled={!script.trim() || !!coach.pending || disabled} loading={!!coach.pending} onClick={() => void grade()}>{t.session.submitToAiGradeBtn}</Button>
        {coach.pending && <Button size="sm" onClick={() => void coach.cancel()}>{t.coach.cancelJob}</Button>}
      </div>
      {coach.pending && <div className="hstack"><ThinkRing size={18} />{t.session.aiGradingStatus}</div>}
      {coach.error && <p role="status">{coach.error}</p>}
      {graded && <div className="written-results">
        <h4>{t.session.aiGradeResultHeading(graded.earned, graded.possible)}</h4>
        <RichText text={graded.summary} lang="zh" />
        <h4>{t.session.aiGradeFeedbackLabel}</h4>
        <ul>{graded.rows.map((row, i) => <li key={i}><b>{parts.find(part => part.id === row.partId)?.label ?? row.partId} · {t.common.scorePoints(row.points)}</b> <RichText text={row.feedback} lang="zh" inline /></li>)}</ul>
        <Button variant="primary" disabled={disabled} onClick={() => onSubmit({ ...graded.response, text: sealed ? text : script })}>{t.session.acceptAiGradeBtn}</Button>
      </div>}
    </>}
  </Glass>;
}
