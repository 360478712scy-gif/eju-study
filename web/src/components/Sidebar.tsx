import { useMemo } from 'react';
import { useApp, update } from '../lib/store.ts';
import { useRoute, href } from '../lib/router.ts';
import { Icon, type IconName } from './Icon.tsx';
import { cx } from '../lib/format.ts';
import { daysBetween } from '@shared/dates.ts';
import { isDue } from '@shared/srs.ts';
import { toggleMusic } from '../App.tsx';
import './sidebar.css';

interface NavItem {
  to: string;
  match: string | undefined;
  label: string;
  icon: IconName;
  badge?: number;
  kbd?: string;
}

export function Sidebar() {
  const state = useApp((s) => s.state)!;
  const today = useApp((s) => s.today);
  const save = useApp((s) => s.save);
  const route = useRoute();
  const head = route.parts[0];
  const left = daysBetween(today, state.profile.examDate);

  const dueMistakes = useMemo(() => Object.values(state.progress).filter((p) => isDue(p, today)).length, [state.progress, today]);
  const plan = state.plans[today];
  const todo = plan ? plan.blocks.filter((b) => b.status !== 'done' && b.status !== 'skipped').length : 0;

  const nav: NavItem[] = [
    { to: '/', match: undefined, label: '今日', icon: 'home', badge: todo || undefined, kbd: '⌘1' },
    { to: '/plan', match: 'plan', label: '冲刺计划', icon: 'calendar' },
    { to: '/practice', match: 'practice', label: '题库练习', icon: 'book', kbd: '⌘2' },
    { to: '/mock', match: 'mock', label: '模考', icon: 'target' },
    { to: '/mistakes', match: 'mistakes', label: '错题本', icon: 'alert', badge: dueMistakes || undefined, kbd: '⌘3' },
    { to: '/vocab', match: 'vocab', label: '词汇', icon: 'languages' },
    { to: '/notes', match: 'notes', label: '考点笔记', icon: 'notebook' },
    { to: '/stats', match: 'stats', label: '数据', icon: 'chart', kbd: '⌘4' },
  ];

  const theme = state.settings.theme;
  const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
  const themeIcon: IconName = theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'eye';

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-logo">
          <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden>
            <defs>
              <linearGradient id="sbg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#6a86ff" />
                <stop offset="1" stopColor="#2f4ae6" />
              </linearGradient>
            </defs>
            <rect width="64" height="64" rx="16" fill="url(#sbg)" />
            <path d="M18 40c6-14 22-14 28 0" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
            <circle cx="32" cy="24" r="5" fill="#fff" />
          </svg>
        </div>
        <div className="sb-brand-text">
          <div className="sb-name">澄学 EJU</div>
          <div className="sb-tag">2026 第2回冲刺</div>
        </div>
      </div>

      <div className="sb-countdown">
        {left > 0 ? (
          <>
            <span className="sb-cd-label">距考试</span>
            <span className="sb-cd-num num">{left}</span>
            <span className="sb-cd-label">天</span>
          </>
        ) : left === 0 ? (
          <span className="sb-cd-label">今天考试，加油！</span>
        ) : (
          <span className="sb-cd-label">考试已结束</span>
        )}
      </div>

      <nav className="sb-nav">
        {nav.map((n) => (
          <a key={n.to} href={href(n.to)} className={cx('sb-item', head === n.match && 'is-active')} title={n.kbd ? `${n.label}（${n.kbd}）` : n.label}>
            <Icon name={n.icon} size={18} />
            <span className="sb-label">{n.label}</span>
            {n.badge ? <span className="sb-badge num">{n.badge > 99 ? '99+' : n.badge}</span> : null}
          </a>
        ))}
      </nav>

      <div className="sb-foot">
        <div className={cx('sb-save', `is-${save}`)} title="学习记录自动保存在本机">
          <span className="sb-save-dot" />
          {save === 'saving' ? '保存中…' : save === 'error' ? '保存失败，重试中' : save === 'conflict' ? '已同步最新记录' : '已自动保存'}
        </div>
        <div className="sb-tools">
          <button className={cx('sb-tool', state.settings.musicEnabled && 'is-on')} onClick={toggleMusic} title="背景音乐（⇧⌘M）" aria-label="背景音乐">
            <Icon name="music" size={17} />
          </button>
          <button
            className="sb-tool"
            onClick={() => update((d) => void (d.settings.theme = nextTheme))}
            title={`主题：${theme === 'dark' ? '深色' : theme === 'light' ? '浅色' : '跟随系统'}`}
            aria-label="切换主题"
          >
            <Icon name={themeIcon} size={17} />
          </button>
          <a className={cx('sb-tool', head === 'settings' && 'is-on')} href={href('/settings')} title="设置" aria-label="设置">
            <Icon name="settings" size={17} />
          </a>
        </div>
      </div>
    </aside>
  );
}
