import { useEffect, useState } from 'react';
import { useApp, tickToday, update } from './lib/store.ts';
import { useRoute, navigate } from './lib/router.ts';
import { onShellCommand, SHELL_PAGES } from './lib/native.ts';
import { setMusic, musicPlaying } from './lib/audio.ts';
import { Toaster, Spinner, Button, Modal, Kbd } from './components/ui.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { TodayPage } from './pages/today/TodayPage.tsx';
import { PlanPage } from './pages/plan/PlanPage.tsx';
import { PracticePage } from './pages/practice/PracticePage.tsx';
import { PlayerPage } from './pages/player/PlayerPage.tsx';
import { MockPage } from './pages/mock/MockPage.tsx';
import { MistakesPage } from './pages/mistakes/MistakesPage.tsx';
import { VocabPage } from './pages/vocab/VocabPage.tsx';
import { StatsPage } from './pages/stats/StatsPage.tsx';
import { NotesPage } from './pages/notes/NotesPage.tsx';
import { SettingsPage } from './pages/settings/SettingsPage.tsx';
import { OnboardingPage } from './pages/onboarding/OnboardingPage.tsx';

function useTheme() {
  const theme = useApp((s) => s.state?.settings.theme);
  const scale = useApp((s) => s.state?.settings.fontScale);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    try {
      localStorage.setItem('eju-theme', theme || 'system');
    } catch {
      /* ignore */
    }
  }, [theme]);
  useEffect(() => {
    document.documentElement.style.setProperty('--reading-scale', String(scale || 1));
  }, [scale]);
}

function useMusicSync() {
  const enabled = useApp((s) => s.state?.settings.musicEnabled);
  const track = useApp((s) => s.state?.settings.musicTrack);
  const volume = useApp((s) => s.state?.settings.musicVolume);
  useEffect(() => {
    if (enabled === undefined) return;
    setMusic(!!enabled, track || 'music-01', volume ?? 0.22);
  }, [enabled, track, volume]);
}

export function toggleMusic() {
  update((d) => {
    d.settings.musicEnabled = !musicPlaying() && !d.settings.musicEnabled ? true : !d.settings.musicEnabled;
  });
}

const SHORTCUTS: [string, string][] = [
  ['⌘1 / ⌘2 / ⌘3 / ⌘4', '今日 / 题库 / 错题本 / 数据'],
  ['1–9', '选择选项'],
  ['Enter', '提交 / 下一题'],
  ['← →', '上一题 / 下一题（已作答后）'],
  ['F', '标记没把握'],
  ['E', '展开 / 收起解析'],
  ['Space', '播放 / 暂停听力'],
  ['Esc', '关闭弹窗'],
  ['⇧⌘M', '背景音乐开关'],
  ['⌘/', '快捷键一览'],
];

export function App() {
  const ready = useApp((s) => s.ready);
  const error = useApp((s) => s.error);
  const onboarded = useApp((s) => s.state?.profile.onboarded);
  const route = useRoute();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useTheme();
  useMusicSync();

  useEffect(() => {
    const t = setInterval(tickToday, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(
    () =>
      onShellCommand((c) => {
        if (c.action === 'navigate' && c.page) navigate(SHELL_PAGES[c.page] || '/');
        else if (c.action === 'toggle-music') toggleMusic();
        else if (c.action === 'shortcuts') setShortcutsOpen(true);
        else if (c.action === 'toggle-focus') window.dispatchEvent(new CustomEvent('eju-toggle-focus'));
      }),
    [],
  );

  // Browser fallback for the shell's menu shortcuts (the native shell intercepts these itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.isComposing || e.repeat) return;
      const pages = ['today', 'learning', 'notebook', 'report'];
      if (/^[1-4]$/.test(e.key) && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('eju-command', { detail: { action: 'navigate', page: pages[Number(e.key) - 1] } }));
      } else if (e.key === '/') {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMusic();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (error) {
    return (
      <div className="boot">
        <div className="boot-card">
          <h2>学习空间暂时无法打开</h2>
          <p className="muted">{error}</p>
          <p className="faint text-sm">学习记录保存在项目的 data 文件夹，不会丢失。</p>
          <Button variant="primary" icon="refresh" onClick={() => window.location.reload()}>
            重试
          </Button>
        </div>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="boot">
        <Spinner size={22} />
      </div>
    );
  }
  if (!onboarded) {
    return (
      <>
        <OnboardingPage />
        <Toaster />
      </>
    );
  }

  const [head, a] = route.parts;
  const focus = head === 'session';
  let page;
  switch (head) {
    case undefined:
      page = <TodayPage />;
      break;
    case 'plan':
      page = <PlanPage />;
      break;
    case 'practice':
      page = <PracticePage />;
      break;
    case 'session':
      page = <PlayerPage sessionId={a} />;
      break;
    case 'mock':
      page = <MockPage resultId={a} />;
      break;
    case 'mistakes':
      page = <MistakesPage />;
      break;
    case 'vocab':
      page = <VocabPage />;
      break;
    case 'stats':
      page = <StatsPage />;
      break;
    case 'notes':
      page = <NotesPage topic={a} />;
      break;
    case 'settings':
      page = <SettingsPage />;
      break;
    default:
      page = <TodayPage />;
  }

  return (
    <div className={focus ? 'app app-focus' : 'app'}>
      {!focus && <Sidebar />}
      <main className="main" key={head || 'today'}>
        {page}
      </main>
      <Toaster />
      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="快捷键" width={460}>
        <div className="shortcut-list">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="row-between shortcut-row">
              <span className="muted">{v}</span>
              <span className="row" style={{ gap: 4 }}>
                {k.split(' / ').map((x) => (
                  <Kbd key={x}>{x}</Kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
