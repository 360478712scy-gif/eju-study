// 设置: goals, appearance, practice, music, AI coach, data and about. Every change saves at once.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { JournalEntry, Settings } from '@shared/types.ts';
import { regeneratePlan } from '@shared/actions.ts';
import { flush, update, useApp } from '../../lib/store.ts';
import { playSpeech, setMusic, TRACKS } from '../../lib/audio.ts';
import { coachStatus } from '../../lib/api.ts';
import { saveTextFile } from '../../lib/native.ts';
import { cx, fmtDateShort } from '../../lib/format.ts';
import { Icon, type IconName } from '../../components/Icon.tsx';
import { Badge, Button, PageHeader, Segmented, Spinner, toast } from '../../components/ui.tsx';
import { Row, savedToast, SettingCard, Slider, Switch } from './controls.tsx';
import { GoalsCard } from './GoalsCard.tsx';
import './settings.css';

const APP_VERSION = '2.0.0';

const SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: 'goals', label: '学习目标', icon: 'target' },
  { id: 'look', label: '外观', icon: 'sun' },
  { id: 'practice', label: '练习', icon: 'zap' },
  { id: 'music', label: '音乐', icon: 'music' },
  { id: 'coach', label: 'AI 讲解', icon: 'sparkles' },
  { id: 'data', label: '数据', icon: 'download' },
  { id: 'about', label: '关于', icon: 'info' },
];

function setSetting<K extends keyof Settings>(key: K, value: Settings[K], quiet = false) {
  update((d) => {
    d.settings[key] = value;
  });
  if (!quiet) savedToast();
}

function scroller(): HTMLElement | null {
  return document.querySelector('.main');
}

function useScrollSpy(ids: string[]): string {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const root = scroller();
    if (!root) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = root.getBoundingClientRect().top;
        let cur = ids[0];
        for (const id of ids) {
          const el = document.getElementById(`st-${id}`);
          if (el && el.getBoundingClientRect().top - top < 140) cur = id;
        }
        if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) cur = ids[ids.length - 1];
        setActive(cur);
      });
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      root.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [ids]);
  return active;
}

export function SettingsPage() {
  const ready = useApp((s) => !!s.state);
  const [planStale, setPlanStale] = useState(false);
  const ids = useMemo(() => SECTIONS.map((s) => s.id), []);
  const active = useScrollSpy(ids);

  if (!ready) return null;

  const jump = (id: string) => document.getElementById(`st-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const regenerate = () => {
    update((d, bank, today) => {
      regeneratePlan(d, bank, today);
    });
    setPlanStale(false);
    toast('今天的计划已按新设置重排', 'success');
  };

  return (
    <div className="page sg-page">
      <PageHeader title="设置" desc="改动会立刻保存。" />
      <div className="sg-layout">
        <nav className="sg-nav" aria-label="设置分区">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={cx('sg-nav-item', active === s.id && 'is-active')} onClick={() => jump(s.id)}>
              <Icon name={s.icon} size={16} />
              {s.label}
            </button>
          ))}
        </nav>
        <div className="sg-content">
          {planStale && (
            <div className="sg-replan" role="status">
              <span className="sg-replan-icon">
                <Icon name="calendar" size={17} />
              </span>
              <span className="sg-replan-text">
                <b>今天的计划还是按之前的设置排的</b>
                <span>要按新设置重排吗？已经开始或做完的部分不会动。</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setPlanStale(false)}>
                先不用
              </Button>
              <Button variant="primary" size="sm" icon="refresh" onClick={regenerate}>
                重排今天
              </Button>
            </div>
          )}
          <GoalsCard onPlanStale={() => setPlanStale(true)} />
          <LookCard />
          <PracticeCard />
          <MusicCard />
          <CoachCard />
          <DataCard />
          <AboutCard />
        </div>
      </div>
    </div>
  );
}

// ─── 外观 ───

const THEMES: { value: Settings['theme']; label: string; desc: string; icon: IconName }[] = [
  { value: 'system', label: '跟随系统', desc: '随 macOS 自动切换', icon: 'eye' },
  { value: 'light', label: '浅色', desc: '白天更清爽', icon: 'sun' },
  { value: 'dark', label: '深色', desc: '深夜学习不刺眼', icon: 'moon' },
];

function LookCard() {
  const theme = useApp((s) => s.state?.settings.theme ?? 'system');
  const scale = useApp((s) => s.state?.settings.fontScale ?? 1);
  const [local, setLocal] = useState(scale);
  useEffect(() => setLocal(scale), [scale]);

  const commitScale = () => {
    if (Math.abs(local - scale) > 0.001) setSetting('fontScale', Math.round(local * 100) / 100);
  };

  return (
    <SettingCard id="look" icon="sun" title="外观">
      <Row title="主题" stack>
        <div className="sg-themes" role="radiogroup" aria-label="主题">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={theme === t.value}
              className={cx('sg-theme', theme === t.value && 'is-on')}
              onClick={() => theme !== t.value && setSetting('theme', t.value)}
            >
              <span className="sg-theme-icon">
                <Icon name={t.icon} size={18} />
              </span>
              <span className="sg-theme-text">
                <b>{t.label}</b>
                <span>{t.desc}</span>
              </span>
              {theme === t.value && <Icon name="checkCircle" size={17} className="sg-theme-check" />}
            </button>
          ))}
        </div>
      </Row>
      <Row title="阅读字号" desc="题干、解析和长文的字号；按钮和菜单不变。" stack>
        <Slider
          label="阅读字号"
          value={local}
          min={0.9}
          max={1.3}
          step={0.05}
          onChange={setLocal}
          onCommit={commitScale}
          format={(v) => `${Math.round(v * 100)}%`}
          marks={[
            [0.9, '小'],
            [1, '标准'],
            [1.3, '大'],
          ]}
        />
        <div className="sg-preview" style={{ ['--reading-scale' as string]: String(local) }}>
          <p lang="ja" className="sg-preview-ja">
            日本留学試験は、日本の大学で学ぶために必要な日本語力と基礎学力を測る試験である。
          </p>
          <p className="sg-preview-zh">物体沿光滑斜面下滑时，加速度的大小为 g sin θ，与质量无关。</p>
        </div>
      </Row>
    </SettingCard>
  );
}

// ─── 练习 ───

const RATES = [0.8, 0.9, 1, 1.1, 1.2];

function PracticeCard() {
  const settings = useApp((s) => s.state?.settings);
  const sample = useApp((s) => s.bank?.bundle.vocab.find((v) => !!v.audio?.word));
  if (!settings) return null;
  const rate = RATES.reduce((a, b) => (Math.abs(b - settings.pronunciationRate) < Math.abs(a - settings.pronunciationRate) ? b : a), 1);

  const preview = (r: number) => {
    if (!sample?.audio?.word) return;
    playSpeech(sample.audio.word, { rate: r }).catch(() => toast('音频没能播放', 'warning'));
  };

  return (
    <SettingCard id="practice" icon="zap" title="练习">
      <Row title="日语选择题自动下一题" desc="日语读解、听解选完答案后直接进入下一题，不用再按确认。">
        <Switch label="日语选择题自动下一题" checked={settings.autoNextJapanese} onChange={(v) => setSetting('autoNextJapanese', v)} />
      </Row>
      <Row title="默认显示中文对照" desc="数学和理科题干下方直接展开中文翻译；关掉后需要时再点开。">
        <Switch label="默认显示中文对照" checked={settings.showZhGloss} onChange={(v) => setSetting('showZhGloss', v)} />
      </Row>
      <Row title="读音语速" desc="单词和例句朗读的速度，听解题不受影响。">
        <div className="sg-rate">
          <Segmented<string>
            size="sm"
            value={String(rate)}
            onChange={(v) => {
              const r = Number(v);
              setSetting('pronunciationRate', r);
              preview(r);
            }}
            options={RATES.map((r) => ({ value: String(r), label: `${r.toFixed(1)}×` }))}
          />
          {sample && (
            <Button variant="ghost" size="sm" icon="volume" onClick={() => preview(rate)} title={`试听「${sample.word}」`}>
              试听
            </Button>
          )}
        </div>
      </Row>
    </SettingCard>
  );
}

// ─── 音乐 ───

function MusicCard() {
  const enabled = useApp((s) => !!s.state?.settings.musicEnabled);
  const track = useApp((s) => s.state?.settings.musicTrack ?? TRACKS[0].id);
  const volume = useApp((s) => s.state?.settings.musicVolume ?? 0.22);
  const [local, setLocal] = useState(volume);
  useEffect(() => setLocal(volume), [volume]);

  return (
    <SettingCard
      id="music"
      icon="music"
      title="背景音乐"
      desc="轻柔的钢琴即兴，朗读和听力播放时会自动静音。"
      aside={<Switch label="背景音乐" checked={enabled} onChange={(v) => setSetting('musicEnabled', v)} />}
    >
      <div className={cx('sg-tracks', !enabled && 'is-off')} role="radiogroup" aria-label="曲目">
        {TRACKS.map((t, i) => {
          const on = t.id === track;
          return (
            <button key={t.id} type="button" role="radio" aria-checked={on} className={cx('sg-track', on && 'is-on')} onClick={() => !on && setSetting('musicTrack', t.id)}>
              <span className="sg-track-no num">{String(i + 1).padStart(2, '0')}</span>
              <span className="sg-track-name">
                <b>{t.name}</b>
                <span>Kevin MacLeod</span>
              </span>
              {on && enabled ? <span className="sg-eq" aria-label="正在播放"><i /><i /><i /></span> : on ? <Icon name="check" size={16} className="sg-track-check" /> : null}
            </button>
          );
        })}
      </div>
      <Row title="音量" stack>
        <Slider
          label="音乐音量"
          value={local}
          min={0}
          max={0.6}
          step={0.02}
          onChange={(v) => {
            setLocal(v);
            setMusic(enabled, track, v);
          }}
          onCommit={() => Math.abs(local - volume) > 0.001 && setSetting('musicVolume', local)}
          format={(v) => `${Math.round((v / 0.6) * 100)}%`}
        />
      </Row>
    </SettingCard>
  );
}

// ─── AI 讲解 ───

type CoachInfo = { kind: 'loading' } | { kind: 'ok'; available: boolean; model: string; busy: boolean } | { kind: 'error' };

function CoachCard() {
  const enabled = useApp((s) => !!s.state?.settings.coachEnabled);
  const [info, setInfo] = useState<CoachInfo>({ kind: 'loading' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      coachStatus()
        .then((r) => alive && setInfo({ kind: 'ok', ...r }))
        .catch(() => alive && setInfo({ kind: 'error' }));
    void load();
    const t = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tick]);

  let status: ReactNode;
  if (info.kind === 'loading') {
    status = (
      <span className="sg-status">
        <Spinner size={13} /> 正在检查…
      </span>
    );
  } else if (info.kind === 'error') {
    status = (
      <span className="sg-status is-off">
        <span className="sg-dot" />
        暂时连不上本机服务
      </span>
    );
  } else if (!info.available) {
    status = (
      <span className="sg-status is-off">
        <span className="sg-dot" />
        这台电脑上没找到 Codex，题目自带的解析照常可用
      </span>
    );
  } else {
    status = (
      <span className={cx('sg-status', info.busy ? 'is-busy' : 'is-on')}>
        <span className="sg-dot" />
        {info.busy ? '正在回答一个问题' : '可以提问'}
        <span className="sg-model">{info.model}</span>
      </span>
    );
  }

  return (
    <SettingCard
      id="coach"
      icon="sparkles"
      title="AI 讲解"
      desc="做完题后可以就这道题追问，AI 只读题目、答案和解析。"
      aside={<Switch label="AI 讲解" checked={enabled} onChange={(v) => setSetting('coachEnabled', v)} />}
    >
      <div className="sg-coach">
        {status}
        <Button variant="ghost" size="sm" icon="refresh" onClick={() => setTick(tick + 1)}>
          重新检查
        </Button>
      </div>
    </SettingCard>
  );
}

// ─── 数据 ───

interface Backup {
  file: string;
  bytes: number;
}

function backupInfo(b: Backup): { when: string; rev: string } {
  const m = /^state-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-r(\d+)\.json$/.exec(b.file);
  if (!m) return { when: b.file, rev: '' };
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { when: `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`, rev: m[6] };
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const JOURNAL_KIND: Record<JournalEntry['kind'], { label: string; tone: 'primary' | 'success' | 'neutral' }> = {
  note: { label: '笔记', tone: 'primary' },
  review: { label: '复盘', tone: 'success' },
  legacy: { label: '旧版记录', tone: 'neutral' },
};

function DataCard() {
  const state = useApp((s) => s.state);
  const today = useApp((s) => s.today);
  const [exporting, setExporting] = useState(false);
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [backupError, setBackupError] = useState(false);
  const [allJournal, setAllJournal] = useState(false);
  const revision = state?.revision;
  const loadedAt = useRef(0);

  useEffect(() => {
    // Refresh the list at most once a minute while saving.
    if (Date.now() - loadedAt.current < 60_000 && backups) return;
    loadedAt.current = Date.now();
    fetch('/api/backups')
      .then((r) => (r.ok ? (r.json() as Promise<{ backups: Backup[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        setBackups(j.backups);
        setBackupError(false);
      })
      .catch(() => setBackupError(true));
  }, [revision]);

  const counts = useMemo(() => {
    if (!state) return null;
    const days = Object.values(state.days);
    return {
      attempts: state.attempts.length,
      vocab: state.vocabAttempts.length,
      mocks: state.mocks.length,
      studyDays: days.filter((d) => d.seconds > 0 || d.answered > 0 || d.vocab > 0).length,
      seconds: days.reduce((s, d) => s + d.seconds, 0),
    };
  }, [state]);

  const journal = useMemo(() => [...(state?.journal ?? [])].sort((a, b) => b.at.localeCompare(a.at)), [state?.journal]);

  if (!state || !counts) return null;

  const exportData = async () => {
    setExporting(true);
    try {
      await flush();
      const r = await fetch('/api/export');
      if (!r.ok) throw new Error(String(r.status));
      const text = await r.text();
      if (await saveTextFile(`澄学EJU-学习记录-${today}.json`, text)) toast('学习记录已导出', 'success');
    } catch {
      toast('导出没成功，稍后再试一次', 'danger');
    } finally {
      setExporting(false);
    }
  };

  const shownJournal = allJournal ? journal : journal.slice(0, 4);

  return (
    <SettingCard id="data" icon="download" title="数据" desc="学习记录只保存在这台电脑上，每次改动都会自动保存。">
      <div className="sg-counts">
        <Count label="题目作答" value={counts.attempts} unit="次" />
        <Count label="词汇作答" value={counts.vocab} unit="次" />
        <Count label="模考" value={counts.mocks} unit="场" />
        <Count label="学习天数" value={counts.studyDays} unit="天" />
        <Count label="累计时长" value={(counts.seconds / 3600).toFixed(1)} unit="小时" />
      </div>

      <Row title="导出学习记录" desc="把全部记录存成一个 JSON 文件，换电脑或备份时用。">
        <Button variant="secondary" icon="download" loading={exporting} onClick={exportData}>
          导出
        </Button>
      </Row>

      <Row title="自动备份" desc={backups ? `共 ${backups.length} 份，每 5 分钟最多存一份，保留最近 80 份。` : '学习时每 5 分钟自动备份一次。'} stack>
        {backupError ? (
          <p className="sg-muted-line">暂时读不到备份列表。</p>
        ) : !backups ? (
          <p className="sg-muted-line">
            <Spinner size={13} /> 读取中…
          </p>
        ) : backups.length === 0 ? (
          <p className="sg-muted-line">还没有备份：开始学习后会自动生成第一份。</p>
        ) : (
          <ul className="sg-backups">
            {backups.slice(0, 5).map((b) => {
              const info = backupInfo(b);
              return (
                <li key={b.file}>
                  <Icon name="clock" size={14} />
                  <span className="sg-backup-when">{info.when}</span>
                  {info.rev && <span className="sg-backup-rev">第 {info.rev} 版</span>}
                  <span className="sg-backup-size num">{fmtBytes(b.bytes)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Row>

      <Row title="学习日志" desc="以前写下的笔记和复盘，包括旧版（v1）留下的记录。" stack>
        {journal.length === 0 ? (
          <p className="sg-muted-line">还没有日志。</p>
        ) : (
          <ul className="sg-journal">
            {shownJournal.map((j) => (
              <li key={j.id}>
                <div className="sg-journal-meta">
                  <span className="num">{fmtDateShort(j.date)}</span>
                  <Badge tone={JOURNAL_KIND[j.kind].tone}>{JOURNAL_KIND[j.kind].label}</Badge>
                </div>
                <p>{j.text}</p>
              </li>
            ))}
            {journal.length > shownJournal.length && (
              <li className="sg-journal-more">
                <Button variant="ghost" size="sm" icon="down" onClick={() => setAllJournal(true)}>
                  显示全部 {journal.length} 条
                </Button>
              </li>
            )}
          </ul>
        )}
      </Row>
    </SettingCard>
  );
}

function Count({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="sg-count">
      <span className="sg-count-label">{label}</span>
      <span className="sg-count-value num">
        {value}
        {unit && <small>{unit}</small>}
      </span>
    </div>
  );
}

// ─── 关于 ───

function AboutCard() {
  return (
    <SettingCard id="about" icon="info" title="关于">
      <div className="sg-about">
        <div className="sg-about-brand">
          <svg viewBox="0 0 64 64" width="40" height="40" aria-hidden>
            <rect width="64" height="64" rx="16" fill="var(--primary)" />
            <path d="M18 40c6-14 22-14 28 0" stroke="var(--text-inverse)" strokeWidth="5" fill="none" strokeLinecap="round" />
            <circle cx="32" cy="24" r="5" fill="var(--text-inverse)" />
          </svg>
          <div>
            <b>澄学 EJU</b>
            <span className="num">版本 {APP_VERSION}</span>
          </div>
        </div>
        <dl className="sg-credits">
          <div>
            <dt>题目</dt>
            <dd>JASSO 日本留学试验 2015–2021 年官方公开试题，仅供个人学习使用。</dd>
          </div>
          <div>
            <dt>背景音乐</dt>
            <dd>Kevin MacLeod「Meditation Impromptu」01–03（incompetech.com），CC BY 4.0 授权。</dd>
          </div>
          <div>
            <dt>单词读音</dt>
            <dd>由 macOS Kyoko 语音合成，个别读音和音调可能与真人略有差别。</dd>
          </div>
        </dl>
      </div>
    </SettingCard>
  );
}
