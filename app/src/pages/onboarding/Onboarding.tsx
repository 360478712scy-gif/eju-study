import { useState } from 'react';
import { dateRange, isoWeekday } from '@shared/dates.ts';
import { Scene } from '../../shell/Scene.tsx';
import { Button, Glass, Segmented } from '../../ui/ui.tsx';
import { DayPicker } from '../../ui/Learning.tsx';
import { t } from '../../copy/index.ts';
import { go, link } from '../../lib/navigation.ts';
import { useStudy } from '../../lib/study.tsx';
import { SchoolFields, ScoreFields, WeakFields } from './ProfileFields.tsx';
import './onboarding.css';

export function Onboarding() {
  const { state, bank, action, appearance } = useStudy();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState(state.profile);
  const [busy, setBusy] = useState(false);
  const patch = (value: Partial<typeof draft>) => setDraft(old => ({ ...old, ...value }));
  const titles = [t.onboarding.step1Title, t.onboarding.step2Title, t.onboarding.step3Title];
  const descriptions = [t.onboarding.step1Subtitle, t.onboarding.step2Subtitle, t.onboarding.step3Subtitle];
  const buttons = [t.onboarding.toStep2Btn, t.onboarding.toStep3Btn, t.onboarding.completeOnboardingBtn];
  const spans = [...new Set([90, 120, 150, draft.dailyMinutes])].sort((a, b) => a - b);
  const days = dateRange(draft.startDate, draft.examDate).filter(d => draft.weekdays.includes(isoWeekday(d)));
  const submit = async () => {
    if (step === 1) { setStep(2); return; }
    if (step === 2) { setStep(3); return; }
    if (busy) return;
    setBusy(true);
    try {
      if (await action({ type: 'profile', patch: {
        schools: draft.schools, targets: draft.targets, baseline: draft.baseline, weekdays: draft.weekdays,
        dailyMinutes: draft.dailyMinutes, weakTopics: draft.weakTopics, onboarded: true,
      } })) go(link('today'));
    } finally { setBusy(false); }
  };
  return <>
    <Scene mode={appearance.scene} weather={appearance.particles ? 'auto' : 'off'} parallax={appearance.parallax} tone={state.settings.theme} />
    <div className="onb">
      <Glass kind="float" className="onb-card onb-scroll scroll enter">
        <div className="onb-steps" aria-label={t.onboarding.stepProgress(step)}>{[1,2,3].map(i => <span key={i} className={i <= step ? 'is-on' : ''} />)}</div>
        <div className="t-eyebrow">{t.onboarding.welcomeEyebrow} · {t.onboarding.stepProgress(step)}</div>
        <h1 className="page-title onb-title">{titles[step - 1]}</h1>
        <p className="page-desc">{descriptions[step - 1]}</p>
        {step === 1 && <div className="vstack onb-fields">
          <b>{t.onboarding.targetSchoolsLabel}</b><SchoolFields value={draft.schools} change={schools => patch({ schools })} />
          <p className="t-3">{t.onboarding.examDateReadout}</p>
          <b>{t.onboarding.subjectTargetsHeading}</b><ScoreFields value={draft.targets} change={targets => patch({ targets })} />
          <p className="t-3">{t.onboarding.totalTargetSummary(Object.values(draft.targets).reduce((sum, n) => sum + n, 0))}</p>
        </div>}
        {step === 2 && <div className="vstack onb-fields">
          <b>{t.onboarding.pickWeekdaysLabel}</b>
          <DayPicker large label={t.onboarding.pickWeekdaysLabel} value={draft.weekdays} onChange={weekdays => patch({ weekdays })} />
          <p className="t-3">{t.onboarding.pickedDaysSummary(draft.weekdays.length)}</p>
          <div className="onb-minutes"><span>{t.onboarding.dailyDurationLabel}</span>
            <Segmented value={String(draft.dailyMinutes)} onChange={value => patch({ dailyMinutes: Number(value) })}
              options={spans.map(value => ({ value: String(value), label: t.time.hours(value / 60) }))} />
          </div>
          <p className="t-3">{t.onboarding.cumulativeHoursNote(Math.round(days.length * draft.dailyMinutes / 60))}</p>
        </div>}
        {step === 3 && <div className="vstack onb-fields">
          <b>{t.onboarding.baselineHeading}</b><ScoreFields baseline value={draft.baseline} change={baseline => patch({ baseline })} />
          <b>{t.onboarding.weakTopicsHeading}</b><WeakFields value={draft.weakTopics} change={weakTopics => patch({ weakTopics })} bank={bank} moreLabel={t.onboarding.moreTopicsBtn} />
          <p className="t-3">{t.onboarding.weakTopicsCountNote(draft.weakTopics.length)}</p>
        </div>}
        <div className="hstack onb-actions">
          {step > 1 && <Button variant="ghost" icon="chev-left" onClick={() => setStep(step === 3 ? 2 : 1)}>{t.onboarding.backStepBtn}</Button>}
          <span className="spacer" />
          <Button variant="primary" size="lg" iconRight="arrow-right" loading={busy}
            disabled={busy || (step === 2 && !draft.weekdays.length)} onClick={() => void submit()}>{buttons[step - 1]}</Button>
        </div>
      </Glass>
    </div>
  </>;
}
