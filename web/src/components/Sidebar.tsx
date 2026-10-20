import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useApp, update } from '../lib/store.ts';
import { useRoute, href } from '../lib/router.ts';
import { Icon, type IconName } from './Icon.tsx';
import { Tooltip } from './ui.tsx';
import { cx, fmtDateShort } from '../lib/format.ts';
import { daysBetween } from '@shared/dates.ts';
import { isDue } from '@shared/srs.ts';
import { toggleMusic } from '../App.tsx';
import './sidebar.css';

interface NavItem {
  to: string;
  /** First route segment(s) that make this item active (undefined = Today). */
  match: (string | undefined)[];
  label: string;
  icon: IconName;
  badge?: number;
  /** Badge tone in the icon rail: primary for today's work, neutral for the rest. */
  badgeTone?: 'primary' | 'neutral';
  kbd?: string;
}

// The sidebar turns into a 64px icon rail at this width (tokens.css sets --sidebar-w to match).
const RAIL_QUERY = '(max-width: 1024px)';
function useRail() {
  return useSyncExternalStore(
    (l) => {
      const mq = window.matchMedia(RAIL_QUERY);
      mq.addEventListener('change', l);
      return () => mq.removeEventListener('change', l);
    },
    () => window.matchMedia(RAIL_QUERY).matches,
  );
}

/** "已保存" shows briefly after a save; otherwise only the dot (its tooltip explains it). */
function useSaveFlash(save: string) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(save);
  useEffect(() => {
    const was = prev.current;
    prev.current = save;
    if (save === 'saved' && was === 'saving') {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1800);
      return () => clearTimeout(t);
    }
  }, [save]);
  return flash;
}

export function Sidebar() {
  const state = useApp((s) => s.state)!;
  const today = useApp((s) => s.today);
  const save = useApp((s) => s.save);
  const route = useRoute();
  const rail = useRail();
  const flash = useSaveFlash(save);
  const head = route.parts[0];
  const examDate = state.profile.examDate;
  const left = daysBetween(today, examDate);

  const dueMistakes = useMemo(() => Object.values(state.progress).filter((p) => isDue(p, today)).length, [state.progress, today]);
  const plan = state.plans[today];
  // On and after exam day the study plan no longer applies, so Today shows no count.
  const todo = plan && left > 0 ? plan.blocks.filter((b) => b.status !== 'done' && b.status !== 'skipped').length : 0;

  const nav: NavItem[] = [
    { to: '/', match: [undefined], label: '今日', icon: 'home', badge: todo || undefined, badgeTone: 'primary', kbd: '⌘1' },
    { to: '/plan', match: ['plan'], label: '冲刺计划', icon: 'calendar' },
    { to: '/practice', match: ['practice'], label: '题库练习', icon: 'book', kbd: '⌘2' },
    { to: '/mock', match: ['mock'], label: '模考', icon: 'target' },
    { to: '/mistakes', match: ['mistakes', 'traps'], label: '错题本', icon: 'alert', badge: dueMistakes || undefined, kbd: '⌘3' },
    { to: '/vocab', match: ['vocab'], label: '词汇', icon: 'languages' },
    { to: '/notes', match: ['notes'], label: '考点笔记', icon: 'notebook' },
    { to: '/stats', match: ['stats'], label: '数据', icon: 'chart', kbd: '⌘4' },
  ];

  const theme = state.settings.theme;
  const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
  const themeIcon: IconName = theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'contrast';
  const themeName = theme === 'dark' ? '深色' : theme === 'light' ? '浅色' : '跟随系统';
  const nextThemeName = nextTheme === 'dark' ? '深色' : nextTheme === 'light' ? '浅色' : '跟随系统';
  const toolSide = rail ? 'right' : 'top';

  const saveText = save === 'saving' ? '保存中…' : save === 'error' ? '保存失败，重试中' : save === 'conflict' ? '已同步最新记录' : flash ? '已保存' : '';
  const saveTip = save === 'error' ? '保存失败，正在重试。学习记录仍在本机内存里。' : '学习记录自动保存在本机';

  const countdown =
    left > 0 ? (
      <div className="sb-countdown">
        <div className="sb-cd-top">
          <span>距考试</span>
          <span className="sb-cd-date">{fmtDateShort(examDate)}</span>
        </div>
        <div className="sb-cd-main">
          <span className="sb-cd-num num">{left}</span>
          <span className="sb-cd-unit">天</span>
        </div>
      </div>
    ) : (
      <div className={cx('sb-countdown', 'is-text', left === 0 && 'is-today')}>
        <div className="sb-cd-top">
          <span>{left === 0 ? '考试日' : 'EJU'}</span>
          <span className="sb-cd-date">{fmtDateShort(examDate)}</span>
        </div>
        <div className="sb-cd-title">{left === 0 ? '今天考试，加油！' : '考试已结束'}</div>
      </div>
    );
  const countdownTip = left > 0 ? `距考试还有 ${left} 天 · ${fmtDateShort(examDate)}` : left === 0 ? '今天考试，加油！' : '考试已结束';

  return (
    <aside className={cx('sidebar', rail && 'is-rail')}>
      <div className="sb-brand">
        <div className="sb-logo">
          <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden>
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

      {rail ? (
        <Tooltip label={countdownTip} side="right">
          <div className={cx('sb-cd-tile', left <= 0 && 'is-text')} tabIndex={-1}>
            {left > 0 ? (
              <>
                <span className="num">{left}</span>
                <span className="sb-cd-tile-unit">天</span>
              </>
            ) : (
              <Icon name={left === 0 ? 'flag' : 'checkCircle'} size={18} />
            )}
          </div>
        </Tooltip>
      ) : (
        countdown
      )}

      <nav className="sb-nav" aria-label="主导航">
        {nav.map((n) => {
          const active = n.match.includes(head);
          const link = (
            <a key={n.to} href={href(n.to)} className={cx('sb-item', active && 'is-active')} aria-current={active ? 'page' : undefined} aria-label={rail ? n.label : undefined}>
              <span className="sb-icon">
                <Icon name={n.icon} size={18} />
                {rail && n.badge ? <span className={cx('sb-dot', n.badgeTone === 'primary' && 'is-primary')} /> : null}
              </span>
              <span className="sb-label">{n.label}</span>
              {!rail && n.badge ? <span className="sb-badge num">{n.badge > 99 ? '99+' : n.badge}</span> : null}
            </a>
          );
          return rail ? (
            <Tooltip key={n.to} label={n.badge ? `${n.label} · ${n.badge}` : n.label} kbd={n.kbd} side="right">
              {link}
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>

      <div className="sb-foot">
        <div className="sb-tools">
          <Tooltip label={state.settings.musicEnabled ? '背景音乐：开' : '背景音乐：关'} kbd="⇧⌘M" side={toolSide}>
            <button className={cx('sb-tool', state.settings.musicEnabled && 'is-on')} onClick={toggleMusic} aria-label="背景音乐">
              <Icon name="music" size={17} />
            </button>
          </Tooltip>
          <Tooltip label={`主题：${themeName} · 点按切换为${nextThemeName}`} side={toolSide}>
            <button className="sb-tool" onClick={() => update((d) => void (d.settings.theme = nextTheme))} aria-label="切换主题">
              <Icon name={themeIcon} size={17} />
            </button>
          </Tooltip>
          <Tooltip label="设置" side={toolSide}>
            <a className={cx('sb-tool', head === 'settings' && 'is-on')} href={href('/settings')} aria-label="设置">
              <Icon name="settings" size={17} />
            </a>
          </Tooltip>
          <Tooltip label={saveTip} side={toolSide}>
            <div className={cx('sb-save', `is-${save}`, saveText && 'has-text')} role="status" aria-label={saveText || saveTip}>
              <span className="sb-save-text">{saveText}</span>
              <span className="sb-save-dot" />
            </div>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
