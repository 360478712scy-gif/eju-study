import { MAX_SCORE, SCHOOLS, SUBJECTS, type ScoreMap, type School } from '@shared/types.ts';
import { matchesTopic } from '@shared/stats.ts';
import type { BankIndex } from '@shared/bank.ts';
import { Chip, Field, SubjectGlyph } from '../../ui/ui.tsx';
import { t } from '../../copy/index.ts';
import { schoolNames } from '../../lib/model.ts';

const targetLabels = { math: t.onboarding.mathTargetField, physics: t.onboarding.physicsTargetField, chemistry: t.onboarding.chemistryTargetField };
const baselineLabels = { math: t.onboarding.baselineMathField, physics: t.onboarding.baselinePhysicsField, chemistry: t.onboarding.baselineChemistryField };

export function SchoolFields({ value, change }: { value: School[]; change: (value: School[]) => void }) {
  return <div className="hstack profile-chips">
    {SCHOOLS.map(school => <Chip key={school} tone="school" selected={value.includes(school)}
      onClick={() => change(value.includes(school) ? value.filter(x => x !== school) : [...value, school])}>{schoolNames[school]}</Chip>)}
  </div>;
}
export function ScoreFields({ value, change, baseline = false }: { value: ScoreMap; change: (value: ScoreMap) => void; baseline?: boolean }) {
  return <div className="grid grid-3 profile-scores">
    {SUBJECTS.map(subject => <div key={subject} className="profile-score">
      <div className="hstack"><SubjectGlyph subject={subject} size="sm" /><span>{(baseline ? baselineLabels : targetLabels)[subject]}</span></div>
      <Field type="number" value={String(value[subject])} ariaLabel={(baseline ? baselineLabels : targetLabels)[subject]}
        min={0} max={MAX_SCORE[subject]} onChange={input => change({ ...value, [subject]: Math.max(0, Math.min(MAX_SCORE[subject], Math.round(Number(input)) || 0)) })} />
    </div>)}
  </div>;
}
export function WeakFields({ value, change, bank }: { value: string[]; change: (value: string[]) => void; bank: BankIndex }) {
  const topics = [...bank.topics.values()];
  return <div className="vstack profile-topics">
    {SUBJECTS.map(subject => <details key={subject} open>
      <summary>{t.common.subjectName(subject)}</summary>
      <div className="hstack profile-chips">
        {topics.filter(it => it.subject === subject).map(it => <Chip key={it.id} sm tone={subject}
          selected={matchesTopic(value, it.id)} onClick={() => {
            // Expand any inherited prefix before removing one child, preserving its other siblings.
            const selected = topics.filter(topic => matchesTopic(value, topic.id)).map(topic => topic.id);
            change(selected.includes(it.id) ? selected.filter(id => id !== it.id) : [...selected, it.id]);
          }}>{it.name}</Chip>)}
      </div>
    </details>)}
  </div>;
}
