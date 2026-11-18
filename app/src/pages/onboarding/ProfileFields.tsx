import { MAX_SCORE, SCHOOLS, SUBJECTS, type ScoreMap, type School } from '@shared/types.ts';
import { matchesTopic } from '@shared/stats.ts';
import type { BankIndex } from '@shared/bank.ts';
import { Chip, Icon, IconButton, SubjectGlyph } from '../../ui/ui.tsx';
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
  const labels = baseline ? baselineLabels : targetLabels;
  const set = (subject: (typeof SUBJECTS)[number], n: number) =>
    change({ ...value, [subject]: Math.max(0, Math.min(MAX_SCORE[subject], Math.round(n) || 0)) });
  return <div className="score-tiles">
    {SUBJECTS.map(subject => {
      const step = MAX_SCORE[subject] >= 200 ? 5 : 2;
      return <div key={subject} className="score-tile" data-tone={subject}>
        <div className="score-tile-head">
          <SubjectGlyph subject={subject} size="sm" />
          <span>{t.common.subjectName(subject)}</span>
        </div>
        <div className="score-tile-value">
          <input className="num" type="number" inputMode="numeric" aria-label={labels[subject]} min={0} max={MAX_SCORE[subject]}
            value={String(value[subject])} onChange={event => set(subject, Number(event.currentTarget.value))}
            onFocus={event => event.currentTarget.select()} />
          <span className="num">/ {MAX_SCORE[subject]}</span>
        </div>
        <div className="score-tile-steps">
          <IconButton icon="minus" size="sm" label={labels[subject]} onClick={() => set(subject, value[subject] - step)} />
          <span className="score-tile-bar"><span style={{ width: `${(value[subject] / MAX_SCORE[subject]) * 100}%` }} /></span>
          <IconButton icon="plus" size="sm" label={labels[subject]} onClick={() => set(subject, value[subject] + step)} />
        </div>
      </div>;
    })}
  </div>;
}
export function WeakFields({ value, change, bank }: { value: string[]; change: (value: string[]) => void; bank: BankIndex }) {
  const topics = [...bank.topics.values()];
  const selected = topics.filter(topic => matchesTopic(value, topic.id)).map(topic => topic.id);
  // Expand any inherited prefix before removing one child, preserving its other siblings.
  const toggle = (id: string) => change(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  return <div className="weak-fields">
    {SUBJECTS.map(subject => {
      const mine = topics.filter(it => it.subject === subject);
      const on = mine.filter(it => selected.includes(it.id));
      const off = mine.filter(it => !selected.includes(it.id));
      return <div key={subject} className="weak-subject">
        <div className="weak-subject-head">
          <SubjectGlyph subject={subject} size="sm" />
          <b>{t.common.subjectName(subject)}</b>
          <span className="num t-3">{on.length}</span>
        </div>
        <div className="profile-chips">
          {on.map(it => <Chip key={it.id} sm tone={subject} selected onClick={() => toggle(it.id)}>{it.name}<Icon name="close" size={11} /></Chip>)}
        </div>
        {off.length > 0 && <details className="weak-more">
          <summary><Icon name="plus" size={13} />{t.common.expandBtn}</summary>
          <div className="profile-chips">
            {off.map(it => <Chip key={it.id} sm onClick={() => toggle(it.id)}>{it.name}</Chip>)}
          </div>
        </details>}
      </div>;
    })}
  </div>;
}
