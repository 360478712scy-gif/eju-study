import { useEffect, useState } from 'react';
import { Shell, NavPanel, Dock, type NavItem } from '../shell/Shell.tsx';
import type { SceneMode } from '../shell/Scene.tsx';
import { Toaster, SubjectGlyph, Button } from '../ui/ui.tsx';
import { TodayProto, TodayAsideProto } from './TodayProto.tsx';
import { SessionProto } from './SessionProto.tsx';
import { Gallery } from './Gallery.tsx';
import { PlanProto } from './PlanProto.tsx';
import { PracticeProto, PracticeAsideProto, ReviewProto } from './PracticeProto.tsx';
import { MockProto, NotesProto, InsightsProto, CoachProto, OnboardingProto, SettingsProto } from './MoreProto.tsx';

// Design prototype entry (mock data). The wired app replaces this file; keep the proto routes reachable at #/proto/*.
const NAV: NavItem[] = [
  { id: 'today', icon: 'today', label: '今天', href: '#/proto/today', group: '学习' },
  { id: 'plan', icon: 'plan', label: '计划', href: '#/proto/plan', group: '学习' },
  { id: 'practice', icon: 'practice', label: '练习', href: '#/proto/practice', group: '题库' },
  { id: 'review', icon: 'review', label: '复习', href: '#/proto/review', group: '题库', count: 12 },
  { id: 'mock', icon: 'mock', label: '模考', href: '#/proto/mock', group: '题库' },
  { id: 'notes', icon: 'notes', label: '笔记', href: '#/proto/notes', group: '资料' },
  { id: 'insights', icon: 'insights', label: '数据', href: '#/proto/insights', group: '资料' },
];

function useHash() {
  const [h, setH] = useState(location.hash || '#/proto/today');
  useEffect(() => {
    const f = () => setH(location.hash || '#/proto/today');
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h;
}

export function Proto() {
  const hash = useHash();
  const params = new URLSearchParams(hash.split('?')[1] || '');
  const scene = (params.get('scene') || 'auto') as SceneMode;
  const route = hash.split('?')[0].replace('#/proto/', '');
  const focus = route === 'session';
  const [running, setRunning] = useState(false);
  const active = route;
  return (
    <>
      <Shell
        scene={scene}
        focus={focus}
        nav={
          <NavPanel
            brand="澄学"
            sub="EJU · 2027 第 1 回"
            countdown={{ value: 213, label: '天后 · 6 月 20 日', progress: 0.02 }}
            items={NAV}
            active={active}
            foot={
              <a className="nav-goal" href="#/proto/settings">
                <SubjectGlyph subject="school" size="sm" />
                <span className="nav-goal-text" style={{ minWidth: 0 }}>
                  <span className="nav-goal-title" style={{ display: 'block' }}>早稻田 · 理工</span>
                  <span className="nav-goal-sub" style={{ display: 'block' }}>数学 190 · 理科 180</span>
                </span>
              </a>
            }
          />
        }
        aside={route === 'today' ? <TodayAsideProto /> : route === 'practice' ? <PracticeAsideProto /> : route === 'coach' ? <CoachProto /> : undefined}
        dock={
          <Dock
            running={running || focus}
            title="電磁誘導 · 导体棒切割磁感线"
            sub="第 1 / 5 件 · 新学 + 例题"
            time="31:08"
            progress={0.22}
            glyph={<SubjectGlyph subject="physics" size="sm" />}
            onToggle={() => setRunning(false)}
            onOpen={() => (location.hash = '#/proto/session')}
            startLabel="开始今天的 2 小时"
            onStart={() => setRunning(true)}
            labels={{ prev: '上一件', next: '下一件', play: '继续', pause: '暂停' }}
            tools={[
              { icon: 'coach', label: '助教', kbd: '/', onClick: () => {} },
              { icon: 'notes', label: '笔记速查', onClick: () => {} },
              { icon: 'music', label: '背景音乐', onClick: () => {} },
            ]}
          />
        }
      >
        {({
          session: <SessionProto />,
          gallery: <Gallery />,
          today: <TodayProto />,
          coach: <TodayProto />,
          plan: <PlanProto />,
          practice: <PracticeProto />,
          review: <ReviewProto />,
          mock: <MockProto />,
          notes: <NotesProto />,
          insights: <InsightsProto />,
          settings: <SettingsProto />,
          onboarding: <div />,
        } as Record<string, React.ReactNode>)[route] ?? <Placeholder />}
      </Shell>
      {route === 'onboarding' && <OnboardingProto />}
      <Toaster />
    </>
  );
}

function Placeholder() {
  return (
    <div style={{ padding: 40 }}>
      <Button onClick={() => (location.hash = '#/proto/today')}>回到今天</Button>
    </div>
  );
}
