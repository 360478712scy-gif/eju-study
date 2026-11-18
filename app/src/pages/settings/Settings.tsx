import { useRef, useState, type ReactNode } from 'react';
import type { AppState, Profile } from '@shared/types.ts';
import { isValidDate } from '@shared/dates.ts';
import { Page } from '../../shell/Shell.tsx';
import { Button, Card, Field, Icon, IconButton, Modal, Section, Segmented, Toggle, toast } from '../../ui/ui.tsx';
import { DayPicker } from '../../ui/Learning.tsx';
import { t } from '../../copy/index.ts';
import { request } from '../../lib/api.ts';
import { saveTextFile } from '../../lib/native.ts';
import { shortDate } from '../../lib/model.ts';
import { scenes } from '../../lib/preferences.ts';
import { addMedia, measureTone, refreshMedia, removeMedia, useMediaItems } from '../../lib/music.ts';
import { useStudy } from '../../lib/study.tsx';
import { resolveScene, type SceneMode } from '../../shell/Scene.tsx';
import { SchoolFields, ScoreFields, WeakFields } from '../onboarding/ProfileFields.tsx';
import './settings.css';

function SettingsRow({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return <div className="set-row"><div className="set-text"><b>{label}</b>{desc && <span>{desc}</span>}</div>{children}</div>;
}

function checkedBackup(input: unknown): input is AppState {
  if (typeof input !== 'object' || input === null) return false;
  const data = input as AppState;
  const object = (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value);
  return data.version === 3 && Number.isInteger(data.revision) && data.revision >= 0 &&
    typeof data.createdAt === 'string' && object(data.profile) && isValidDate(data.profile.startDate) && isValidDate(data.profile.examDate) &&
    object(data.profile.targets) && object(data.profile.baseline) && Array.isArray(data.profile.weekdays) && Array.isArray(data.profile.milestones) &&
    Array.isArray(data.profile.schools) && Array.isArray(data.profile.weakTopics) && Array.isArray(data.profile.strongTopics) &&
    object(data.settings) && object(data.calendar) && object(data.calendar.overrides) && Array.isArray(data.calendar.moves) &&
    Array.isArray(data.calendar.restWeeks) && object(data.progress) && object(data.plans) && object(data.sessions) &&
    object(data.days) && object(data.notes) && object(data.variants) && Array.isArray(data.attempts) && Array.isArray(data.mocks);
}

export function Settings() {
  const { state, bank, date, appearance, setAppearance, action } = useStudy();
  const { settings, profile } = state;
  const [draft, setDraft] = useState<Partial<Profile>>({});
  const [model, setModel] = useState<string | null>(null);
  const [backup, setBackup] = useState<string>();
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const values = { ...profile, ...draft };
  const patch = (p: Partial<Profile>) => setDraft(old => ({ ...old, ...p }));
  const saveProfile = async () => {
    if (!Object.keys(draft).length || busy) return;
    setBusy(true);
    try {
      if (await action({ type: 'profile', patch: draft })) {
        setDraft({});
        toast(t.toast.settingsSaved, 'ok');
      }
    } finally { setBusy(false); }
  };
  const activeScene = appearance.scene === 'auto' ? resolveScene('auto').key : appearance.scene;
  const media = useMediaItems();
  const backgrounds = media.filter(item => item.kind === 'background');
  const picture = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const addPicture = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setAdding(true);
    const tone = await measureTone(f);
    const item = await addMedia(f, 'background', { tone });
    await refreshMedia();
    setAdding(false);
    if (item) { setAppearance({ ...appearance, scene: `custom:${item.id}` }); toast(t.settings.backgroundAdded, 'ok'); }
    else toast(t.settings.backgroundAddFailed, 'warn');
  };
  return <Page title={t.settings.title} desc={t.settings.subtitle}>
    <Section title={t.settings.groupAppearanceTitle} desc={t.settings.groupAppearanceDesc}>
      <Card pad={false}>
        <SettingsRow label={t.settings.fieldSceneMode}>
          <Segmented value={appearance.scene === 'auto' ? 'auto' : 'fixed'} onChange={value => setAppearance({ ...appearance, scene: value === 'auto' ? 'auto' : activeScene as SceneMode })}
            options={[{ value: 'auto', label: t.settings.sceneAuto }, { value: 'fixed', label: t.settings.sceneFixed }]} />
        </SettingsRow>
        <div className="scene-picker">
          {scenes.map(scene => <Button key={scene.id} variant="ghost" className={`scene-thumb${scene.id === activeScene ? ' is-on' : ''}`}
            style={{ backgroundImage: `url(/scenes/${scene.id}.thumb.jpg)` }}
            aria-label={scene.label} aria-pressed={appearance.scene === scene.id} onClick={() => setAppearance({ ...appearance, scene: scene.id })} />)}
          {backgrounds.map(item => {
            const id = `custom:${item.id}` as SceneMode;
            return <div key={item.id} className={`scene-thumb is-custom${appearance.scene === id ? ' is-on' : ''}`}>
              <button type="button" className="scene-thumb-hit" style={{ backgroundImage: `url(${item.url})` }} aria-label={item.name}
                aria-pressed={appearance.scene === id} onClick={() => setAppearance({ ...appearance, scene: id })} />
              <IconButton icon="close" size="sm" className="scene-thumb-del" label={t.settings.backgroundRemove} onClick={async () => {
                if (appearance.scene === id) setAppearance({ ...appearance, scene: 'auto' });
                if (await removeMedia(item.id)) await refreshMedia();
              }} />
            </div>;
          })}
          <button type="button" className="scene-thumb scene-add" disabled={adding} onClick={() => picture.current?.click()} aria-label={t.settings.backgroundAdd}>
            <Icon name="plus" size={20} /><span>{t.settings.backgroundAdd}</span>
          </button>
          <input ref={picture} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden
            onChange={e => { void addPicture(e.currentTarget.files); e.currentTarget.value = ''; }} />
        </div>
        <SettingsRow label={t.settings.fieldParticles} desc={t.settings.fieldParticlesDesc}>
          <Toggle label={t.settings.fieldParticles} on={appearance.particles} onChange={particles => setAppearance({ ...appearance, particles })} />
        </SettingsRow>
        <SettingsRow label={t.settings.fieldGlassTheme}>
          <Segmented value={settings.theme} onChange={theme => void action({ type: 'settings', patch: { theme } })} options={[
            { value: 'system', label: t.settings.themeOptionAuto }, { value: 'light', label: t.settings.themeOptionLight }, { value: 'dark', label: t.settings.themeOptionDark },
          ]} />
        </SettingsRow>
      </Card>
    </Section>
    <Section title={t.settings.groupGoalTitle} desc={t.settings.groupGoalDesc}>
      <Card pad={false}>
        <SettingsRow label={t.settings.fieldTargetSchools} desc={t.settings.fieldTargetSchoolsDesc}><SchoolFields value={values.schools} change={schools => patch({ schools })} /></SettingsRow>
        <SettingsRow label={t.settings.fieldExamDate}><span className="num">{shortDate(profile.examDate)}</span></SettingsRow>
        <SettingsRow label={t.settings.fieldTargetScores}><ScoreFields value={values.targets} change={targets => patch({ targets })} /></SettingsRow>
        <SettingsRow label={t.settings.fieldBaselineScores}><ScoreFields baseline value={values.baseline} change={baseline => patch({ baseline })} /></SettingsRow>
        <SettingsRow label={t.settings.fieldWeakTopics} desc={t.settings.fieldWeakTopicsDesc}>
          <details className="set-weak"><summary>{t.settings.manageWeakTopicsBtn}</summary><WeakFields value={values.weakTopics} change={weakTopics => patch({ weakTopics })} bank={bank} /></details>
        </SettingsRow>
        <div className="set-row"><Button variant="primary" icon="check" onClick={() => void saveProfile()} disabled={!Object.keys(draft).length || !values.weekdays.length || busy}>{t.settings.saveGoalChangesBtn}</Button></div>
      </Card>
    </Section>
    <Section title={t.settings.groupScheduleTitle} desc={t.settings.groupScheduleDesc}>
      <Card pad={false}>
        <SettingsRow label={t.settings.fieldWeeklyDays}><DayPicker label={t.settings.fieldWeeklyDays} value={values.weekdays} onChange={weekdays => patch({ weekdays })} /></SettingsRow>
        <SettingsRow label={t.settings.fieldDailyMinutes}>
          <Field type="number" min={30} max={360} value={String(values.dailyMinutes)} ariaLabel={t.settings.fieldDailyMinutes}
            onChange={value => patch({ dailyMinutes: Math.round(Number(value)) })} />
        </SettingsRow>
        <div className="set-row"><Button variant="primary" onClick={() => void saveProfile()} disabled={!Object.keys(draft).length || !values.weekdays.length || values.dailyMinutes < 30 || values.dailyMinutes > 360 || busy}>{t.common.saveBtn}</Button></div>
      </Card>
    </Section>
    <Section title={t.settings.groupCoachTitle} desc={t.settings.groupCoachDesc}>
      <Card pad={false}>
        <SettingsRow label={t.settings.coachEnabled}><Toggle label={t.settings.coachEnabled} on={settings.coachEnabled} onChange={coachEnabled => void action({ type: 'settings', patch: { coachEnabled } })} /></SettingsRow>
        <SettingsRow label={t.settings.fieldCoachModel}>
          <div className="hstack">
            <Field value={model ?? settings.coachModel} ariaLabel={t.settings.fieldCoachModel} onChange={setModel} />
            <Button size="sm" disabled={model == null || !/^[a-zA-Z0-9._-]{1,80}$/.test(model)} onClick={async () => {
              if (model && await action({ type: 'settings', patch: { coachModel: model } })) setModel(null);
            }}>{t.common.saveBtn}</Button>
          </div>
        </SettingsRow>
        <SettingsRow label={t.settings.fieldCoachEffort}>
          <Segmented value={settings.coachEffort} onChange={coachEffort => void action({ type: 'settings', patch: { coachEffort } })}
            options={[{ value: 'low', label: t.settings.effortOptionLow }, { value: 'medium', label: t.settings.effortOptionMedium }, { value: 'high', label: t.settings.effortOptionHigh }]} />
        </SettingsRow>
        <div className="set-row"><Button icon="coach" onClick={async () => {
          try {
            const status = await request<{ available: boolean; enabled: boolean }>('/api/coach/status');
            toast(status.available && status.enabled ? t.settings.coachCliFound : t.toast.coachUnreachable, status.available && status.enabled ? 'ok' : 'warn');
          } catch { toast(t.toast.coachUnreachable, 'warn'); }
        }}>{t.settings.testCoachBtn}</Button></div>
      </Card>
    </Section>
    <Section title={t.settings.groupDataTitle} desc={t.settings.groupDataDesc}>
      <Card>
        <div className="hstack set-backups">
          <Button icon="download" onClick={async () => {
            try {
              const exportState = await request<AppState>('/api/export');
              if (await saveTextFile('chengxue-eju-' + (date) + '.json', JSON.stringify(exportState, null, 2))) toast(t.toast.backupExported, 'ok');
            } catch { toast(t.common.errorTitle, 'bad'); }
          }}>{t.settings.exportBackupBtn}</Button>
          <Button icon="upload" onClick={() => file.current?.click()}>{t.settings.importBackupBtn}</Button>
          <input ref={file} hidden type="file" accept="application/json,.json" onChange={async event => {
            const selection = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!selection) return;
            try {
              const text = await selection.text();
              if (!checkedBackup(JSON.parse(text))) throw new Error('invalid backup');
              setBackup(text);
            } catch { toast(t.toast.backupInvalid, 'bad'); }
          }} />
        </div>
      </Card>
    </Section>
    <p className="set-version t-3">{t.settings.footerVersionNote('3.0.0')}</p>
    <Modal open={!!backup} onClose={() => setBackup(undefined)} title={t.settings.importVerified} closeLabel={t.common.closeBtn}
      footer={<Button variant="primary" icon="download" onClick={async () => {
        if (backup && await saveTextFile('state-v3.json', backup)) setBackup(undefined);
      }}>{t.settings.saveImportCopy}</Button>}>
      <p>{t.settings.importStaged}</p>
    </Modal>
  </Page>;
}
