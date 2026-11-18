import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { practiceView } from '@shared/selectors.ts';
import { daysBetween } from '@shared/dates.ts';
import type { AppState, ContentBundle } from '@shared/types.ts';
import { t } from './copy/index.ts';
import { Aside, AssistantFab, NavPanel, Page, Shell, StudyBar, type NavItem } from './shell/Shell.tsx';
import { Button, Empty, Field, IconButton, Kbd, List, Modal, Row, Section, Sheet, SubjectGlyph, Toaster } from './ui/ui.tsx';
import { RichText } from './ui/RichText.tsx';
import { StudyProvider, useStudy, type CoachContext } from './lib/study.tsx';
import { blockTitle, schoolNames } from './lib/model.ts';
import { go, isTyping, link, noteLink, parseRoute, routes, type SectionName } from './lib/navigation.ts';
import { isNative, onShellCommand, SHELL_PAGES } from './lib/native.ts';
import { setMusic, tracks, useMusic, type Appearance } from './lib/preferences.ts';
import { Today } from './pages/today/Today.tsx';
import { Plan } from './pages/plan/Plan.tsx';
import { Practice, PracticeDetail, defaultPractice } from './pages/practice/Practice.tsx';
import { Review } from './pages/review/Review.tsx';
import { Mock } from './pages/mock/Mock.tsx';
import { Notes } from './pages/notes/Notes.tsx';
import { Insights } from './pages/insights/Insights.tsx';
import { Session } from './pages/session/Session.tsx';
import { Coach } from './pages/coach/Coach.tsx';
import { Onboarding } from './pages/onboarding/Onboarding.tsx';
import { Settings } from './pages/settings/Settings.tsx';

interface Overlay {
  name: 'search' | 'music' | 'notes' | 'coach' | 'shortcuts';
  context?: CoachContext;
  topic?: string;
}
const groups = [t.nav.groupStudy, t.nav.groupStudy, t.nav.groupBank, t.nav.groupBank, t.nav.groupBank, t.nav.groupMaterials, t.nav.groupMaterials];

export function App({ state, bundle, hash, date, appearance }: {
  state: AppState; bundle: ContentBundle; hash: string; date?: string; appearance?: Appearance;
}) {
  const [overlay, setOverlay] = useState<Overlay>();
  const close = useCallback(() => setOverlay(undefined), []);
  const openCoach = useCallback((context?: CoachContext) => setOverlay({ name: 'coach', context }), []);
  const openSearch = useCallback(() => setOverlay({ name: 'search' }), []);
  const openQuickNote = useCallback((topic?: string) => setOverlay({ name: 'notes', topic }), []);
  return <StudyProvider initialState={state} bundle={bundle} initialDate={date} initialAppearance={appearance} hash={hash}
    openCoach={openCoach} openSearch={openSearch} openQuickNote={openQuickNote}>
    <Workspace hash={hash} overlay={overlay} close={close} show={setOverlay} />
    <Toaster />
  </StudyProvider>;
}

function Workspace({ hash, overlay, close, show }: { hash: string; overlay?: Overlay; close: () => void; show: (overlay: Overlay) => void }) {
  const { state, bank, date, active, activeBlock, today, queue, paused, seconds, appearance,
    openCoach, openSearch, startToday, action, openSession, completeManual, togglePause } = useStudy();
  const { name, id, params } = parseRoute(hash);
  const isSession = name === 'session';
  const onboard = !state.profile.onboarded || name === 'onboarding';
  const page = (name === 'settings' || routes.includes(name as typeof routes[number])) ? name as SectionName : 'today';
  const [practice, setPractice] = useState(defaultPractice);
  const topic = (page === 'practice' && practice.tab === 'topic' ? practice.topic : params.get('topic')) || activeBlock?.topic || (page === 'today' ? today.plan.blocks.find(block => block.status === 'todo')?.topic : undefined);
  const [immersive, setImmersive] = useState(false);
  const [zoom, setZoom] = useState<number>();
  const [dockNow, setDockNow] = useState(() => Date.now());
  const examClock = !isSession && !!active?.exam && !active.sealedAt;
  useEffect(() => {
    if (!examClock) return;
    setDockNow(Date.now());
    const timer = setInterval(() => setDockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [examClock]);
  const origin = useRef<string>('#/');
  const previous = useRef(hash);

  useEffect(() => {
    if (hash === previous.current) return;
    if (isSession && parseRoute(previous.current).name !== 'session') {
      origin.current = previous.current;
      try { sessionStorage.setItem('eju-v3-origin:' + id, previous.current); } catch { /* storage unavailable */ }
    }
    previous.current = hash;
    close();
  }, [hash, isSession, id, close]);
  useEffect(() => {
    if (isSession) {
      try { origin.current = sessionStorage.getItem('eju-v3-origin:' + id) ?? origin.current; } catch { /* storage unavailable */ }
    }
  }, [isSession, id]);
  useEffect(() => {
    try {
      const value = Number(localStorage.getItem('eju-v3-zoom'));
      if (value >= .7 && value <= 1.6) setZoom(value);
    } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    const value = zoom ?? state.settings.fontScale;
    document.getElementById('root')?.style.setProperty('--app-zoom', String(value));
  }, [zoom, state.settings.fontScale]);
  useMusic(state.settings);

  const changeMusic = (track?: string) => {
    const current = state.settings;
    const musicEnabled = track ? track !== 'off' : !current.musicEnabled;
    const musicTrack = track && track !== 'off' ? track : current.musicTrack;
    setMusic(musicEnabled, musicTrack, current.musicVolume);
    void action({ type: 'settings', patch: { musicEnabled, musicTrack } });
  };

  const shellCommand = useEffectEvent((command: { action: string; page?: string }) => {
    if (onboard) return;
    if (command.action === 'navigate' && command.page) {
      const destination = SHELL_PAGES[command.page] ?? command.page;
      if (routes.includes(destination as typeof routes[number]) || destination === 'settings') go(link(destination as SectionName));
    }
    if (command.action === 'toggle-music') changeMusic();
    if (command.action === 'toggle-focus' && !isSession) setImmersive(value => !value);
    if (command.action === 'shortcuts') show({ name: 'shortcuts' });
  });
  const hotkey = useEffectEvent((event: KeyboardEvent) => {
    if (onboard || event.isComposing || event.repeat || event.defaultPrevented || event.altKey) return;
    const key = event.key.toLowerCase();
    if (event.metaKey || event.ctrlKey) {
      if (!event.shiftKey && /^[1-7]$/.test(key)) { event.preventDefault(); go(link(routes[Number(key) - 1])); }
      else if (key === 'k') { event.preventDefault(); openSearch(); }
      else if (event.shiftKey && key === 'm') { event.preventDefault(); changeMusic(); }
      else if (event.shiftKey && key === 'f' && !isSession) { event.preventDefault(); setImmersive(value => !value); }
      else if (!isNative() && ['=', '+', '-', '0'].includes(key)) {
        event.preventDefault();
        const next = key === '0' ? 1 : Math.round(Math.max(.7, Math.min(1.6, (zoom ?? state.settings.fontScale) + (key === '-' ? -.1 : .1))) * 10) / 10;
        setZoom(next);
        try { localStorage.setItem('eju-v3-zoom', String(next)); } catch { /* storage unavailable */ }
      }
      return;
    }
    if (overlay || isTyping(event) || (event.target as HTMLElement)?.closest('button, a, summary, [role=dialog]')) return;
    if (event.code === 'Space' && !isSession && page !== 'review') {
      event.preventDefault();
      if (activeBlock && !active) togglePause();
      else if (active || page === 'today') void startToday();
    }
    if (key === '?' && !isSession) show({ name: 'shortcuts' });
  });
  useEffect(() => {
    const off = onShellCommand(command => shellCommand(command));
    const listener = (event: KeyboardEvent) => hotkey(event);
    window.addEventListener('keydown', listener);
    return () => { off(); window.removeEventListener('keydown', listener); };
  }, []);

  if (onboard) return <Onboarding />;
  const countdown = daysBetween(date, state.profile.examDate);
  const navItems: NavItem[] = routes.map((entry, i) => ({
    id: entry, icon: entry, label: t.nav[entry], href: link(entry), group: groups[i],
    ...(entry === 'review' ? { count: queue.length, hint: t.nav.reviewDueBadge(queue.length) } : {}),
  }));
  const openCoachDefault = () => openCoach({ page: t.nav[page], topic });
  const activeTitle = activeBlock ? blockTitle(activeBlock, bank)
    : active?.mock ? (active.mock.kind === 'math' ? t.mock.ejuMathTitle : active.mock.kind === 'science' ? t.mock.ejuScienceTitle : t.mock.schoolRowTitle)
    : active ? t.nav.practice : '';
  const answered = active ? Object.values(active.answers).filter(answer => answer.submitted || answer.response != null).length : 0;
  const currentTime = active?.exam && active.timeLimitSec != null && !active.sealedAt
    ? Math.max(0, Math.ceil((Date.parse(active.startedAt) + active.timeLimitSec * 1000 - dockNow) / 1000))
    : activeBlock ? Math.max(0, activeBlock.minutes * 60 - seconds) : seconds;

  const nav = <NavPanel active={page} brand={t.nav.brand} sub={t.nav.brandSub}
    countdown={countdown > 0 ? { value: countdown, label: t.nav.countdownUnit, progress: 1 - countdown / Math.max(countdown, daysBetween(state.profile.startDate, state.profile.examDate)) }
      : { value: '', label: countdown === 0 ? t.nav.examToday : t.nav.examPassed }}
    items={navItems}
    foot={<><a className="nav-goal" href={link('settings')} aria-label={t.nav.settings}>
      <SubjectGlyph subject="school" size="sm" />
      <span className="nav-goal-text"><span className="nav-goal-title">{state.profile.schools.length
        ? state.profile.schools.length === Object.keys(schoolNames).length ? t.nav.targetSchoolLabel : state.profile.schools.map(school => schoolNames[school]).join(' · ')
        : t.nav.settings}</span><span className="nav-goal-sub">{t.nav.targetSubjectsLabel}</span></span>
    </a><IconButton icon="music" label={t.nav.musicToggle} on={state.settings.musicEnabled} onClick={() => show({ name: 'music' })} />
    <IconButton icon="settings" label={t.nav.settings} on={page === 'settings'} onClick={() => go(link('settings'))} /></>} />;
  const stepIndex = activeBlock ? today.plan.blocks.findIndex(b => b.id === activeBlock.id) + 1 : 0;
  const bar = (active && !isSession) || activeBlock ? <StudyBar
    label={t.nav.barStudying}
    glyph={activeBlock ? <SubjectGlyph subject={activeBlock.subject} size="sm" /> : undefined}
    title={activeTitle}
    sub={active ? t.session.questionProgress(Math.min(active.index + 1, active.itemIds.length), active.itemIds.length)
      : activeBlock ? t.nav.barStep(stepIndex, today.plan.blocks.length) : undefined}
    time={active?.exam || activeBlock ? t.nav.barRemaining(t.time.timerClock(currentTime)) : t.time.timerClock(currentTime)}
    progress={active ? answered / active.itemIds.length : activeBlock ? seconds / (activeBlock.minutes * 60) : undefined}
    paused={paused || (!!active && !isSession)}
    onToggle={!active && activeBlock ? togglePause : undefined}
    toggleLabels={{ pause: t.nav.barPauseBtn, resume: t.nav.barResumeBtn }}
    primary={active ? { label: t.nav.barOpenBtn, onClick: () => openSession(active) }
      : activeBlock ? { label: t.nav.barFinishBtn, onClick: () => void completeManual() } : undefined} /> : undefined;
  const fab = <AssistantFab label={t.nav.fabCoach} kbd="/" on={overlay?.name === 'coach'} onClick={openCoachDefault} />;
  const main: Record<SectionName, ReactNode> = {
    today: <Today />, plan: <Plan />, practice: <Practice selection={practice} setSelection={setPractice} />,
    review: <Review key={params.get('deck')} cardsOnly={params.get('deck') === 'cards'} shortcuts={!overlay} />,
    mock: <Mock reportId={params.get('report')} />, notes: <Notes topic={params.get('topic') ?? undefined} />,
    insights: <Insights />, settings: <Settings />,
  };
  const frame = (body: ReactNode) => <Shell nav={nav} focus={isSession || immersive}
    scene={appearance.scene} tone={state.settings.theme} parallax={appearance.parallax} weather={appearance.particles ? 'auto' : 'off'}
    aside={!isSession && !immersive && page === 'practice' && practice.tab === 'topic' ? <PracticeDetail key={practice.topic} topic={practice.topic} /> : undefined}
    bar={bar} fab={fab}>{body}</Shell>;

  return <>
    {isSession ? <Session id={id} selectedItem={params.get('item')} initialOverlay={params.get('end') === '1' ? 'finish' : params.get('overview') === '1' ? 'overview' : undefined}
      frame={frame} shortcuts={!overlay} returnTo={() => go(origin.current === hash ? link('today') : origin.current)} /> : frame(main[page])}
    <Coach open={overlay?.name === 'coach'} context={overlay?.context ?? { topic, page: t.nav[page] }} onClose={close} />
    <Search open={overlay?.name === 'search'} close={close} />
    <Sheet open={overlay?.name === 'notes'} label={t.notes.quickDrawerTitle} onClose={close}>
      <Notes key={overlay?.topic} topic={overlay?.topic} quick close={close} />
    </Sheet>
    <Sheet open={overlay?.name === 'music'} label={t.settings.music} onClose={close} width={320}>
      <Aside title={t.settings.music} actions={<IconButton icon="close" label={t.common.closeBtn} onClick={close} />}>
        <List>
          <Row title={t.nav.dockMusicOff} current={!state.settings.musicEnabled} onClick={() => changeMusic('off')} />
          {tracks.map(track => <Row key={track.id} title={track.label} current={state.settings.musicEnabled && state.settings.musicTrack === track.id} onClick={() => changeMusic(track.id)} />)}
        </List>
      </Aside>
    </Sheet>
    <Shortcuts open={overlay?.name === 'shortcuts'} close={close} />
  </>;
}

function Search({ open, close }: { open: boolean; close: () => void }) {
  const [query, setQuery] = useState('');
  const { bank, state, startItems } = useStudy();
  const items = useMemo(() => query.trim() ? practiceView(bank, { q: query }).items.slice(0, 15) : [], [bank, query]);
  const books = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return !q ? [] : [...bank.topics.values()].filter(topic => [topic.name, topic.ja, topic.id, bank.notesByTopic.get(topic.id)?.body, state.notes[topic.id]]
      .join(' ').toLocaleLowerCase().includes(q)).slice(0, 10);
  }, [bank, query, state.notes]);
  return <Modal open={open} onClose={close} title={t.nav.globalSearchBtn} closeLabel={t.common.closeBtn} width={670}>
    <Field value={query} onChange={setQuery} placeholder={t.nav.globalSearchPlaceholder} icon="search" autoFocus pill />
    {query.trim() && !items.length && !books.length && <Empty icon="search" title={t.empty.globalSearchEmpty} />}
    {!!items.length && <Section title={t.nav.searchGroupItems}><List>
      {items.map(item => <Row key={item.id} lead={<SubjectGlyph subject={item.subject} size="sm" />} title={item.source.label}
        meta={[<RichText text={item.stem.slice(0, 140)} lang="ja" inline />]} onClick={() => { close(); void startItems([item.id]); }} />)}
    </List></Section>}
    {!!books.length && <Section title={t.nav.searchGroupNotes}><List>
      {books.map(topic => <Row key={topic.id} lead={<SubjectGlyph subject={topic.subject} size="sm" />} title={topic.name} meta={[topic.ja]}
        onClick={() => { close(); go(noteLink(topic.id)); }} />)}
    </List></Section>}
  </Modal>;
}

function Shortcuts({ open, close }: { open: boolean; close: () => void }) {
  const shortcuts = [
    ['⌘1–7', t.nav.shortcutNavSections], ['Space', t.nav.shortcutSpaceStudy], ['⌘K', t.nav.shortcutGlobalSearch],
    ['1–9', t.nav.shortcutPickOption], ['↵', t.nav.shortcutSubmitOrNext], ['← / →', t.nav.shortcutPrevNextItem],
    ['F', t.nav.shortcutFlagUnsure], ['E', t.nav.shortcutToggleExplain], ['/', t.nav.shortcutAskCoach], ['Space · 1–3', t.nav.shortcutFlashcard],
  ];
  return <Modal open={open} onClose={close} title={t.nav.shortcutsTitle} closeLabel={t.common.closeBtn}>
    <List>{shortcuts.map(([key, label]) => <Row key={key} title={label} trail={<Kbd>{key}</Kbd>} />)}</List>
  </Modal>;
}

export function Startup({ error, retry }: { error?: boolean; retry?: () => void }) {
  return <div className="onb" style={{ '--app-zoom': 1 } as CSSProperties}>
    <Page><Empty icon={error ? 'alert' : 'sparkle'} title={error ? t.common.errorTitle : t.common.loading}
      desc={error ? t.common.errorBody : undefined}
      action={error && <Button onClick={retry}>{t.common.retryBtn}</Button>} /></Page>
  </div>;
}
