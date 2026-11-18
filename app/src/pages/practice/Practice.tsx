import { matchesTopic } from '@shared/stats.ts';
import { useMemo, useState } from 'react';
import { practiceView } from '@shared/selectors.ts';
import { isCard, schoolPurpose } from '@shared/bank.ts';
import { SUBJECTS, type Item, type Subject } from '@shared/types.ts';
import { Aside, Page } from '../../shell/Shell.tsx';
import { Bar, Button, Card, Chip, Empty, Field, IconButton, List, MasteryTile, Ring, Row, Section, Segmented, Sheet, Stat, SubjectGlyph, Tabs } from '../../ui/ui.tsx';
import { t } from '../../copy/index.ts';
import { itemMinutes, percent, practiced, schoolNames } from '../../lib/model.ts';
import { go, noteLink } from '../../lib/navigation.ts';
import { useStudy } from '../../lib/study.tsx';
import './practice.css';

type View = 'topic' | 'paper' | 'school';
export type PracticeSelection = { subject: Subject; tab: View; topic: string };
export const defaultPractice: PracticeSelection = { subject: 'physics', tab: 'topic', topic: 'phys.em.induction' };

export function PracticeDetail({ topic, close }: { topic: string; close?: () => void }) {
  const { state, bank, mastery, startItems } = useStudy();
  const [difficulty, setDifficulty] = useState<'all' | '1' | '2' | '3'>('all');
  const info = bank.topics.get(topic);
  if (!info) return null;
  const all = (bank.byTopic.get(topic) ?? []).filter(item => !isCard(item));
  const items = all.filter(it => difficulty === 'all' || it.difficulty === Number(difficulty));
  const sorted = items.slice().sort((a, b) => (state.progress[a.id]?.attempts ?? 0) - (state.progress[b.id]?.attempts ?? 0) || a.difficulty - b.difficulty);
  const practice = sorted.slice(0, 10);
  const recent = state.attempts.filter(a => a.topic === topic).slice(-10);
  const timed = recent.filter(attempt => attempt.seconds > 0);
  const value = mastery.find(row => row.topic === topic)?.value ?? 0;
  const weak = matchesTopic(state.profile.weakTopics, topic);
  const title = t.practice.topicHeading;
  const body = <div className="practice-detail">
    <div className="hstack practice-heading">
      <Ring value={value} size={64} stroke={5} tone={info.subject}><b className="num">{t.common.percent(percent(value))}</b></Ring>
      <div><div className="practice-topic">{info.name}</div><div className="t-3 ja">{info.ja}</div></div>
    </div>
    <div className="grid grid-2 practice-stats">
      <Card><Stat label={t.practice.detailPracticedLabel} value={t.practice.tileProgress(practiced(all, state), all.length)} /></Card>
      <Card><Stat label={t.practice.detailAvgTimeLabel} value={timed.length ? t.time.timerClock(timed.reduce((sum, a) => sum + a.seconds, 0) / timed.length) : t.common.noValue} /></Card>
    </div>
    {!!recent.length && <><div className="t-eyebrow practice-caption">{t.practice.recent}</div>
      <div className="hstack practice-pips">{recent.map(a => <span key={a.id} className="pip" data-tone={a.correct ? 'ok' : 'bad'} />)}</div></>}
    <div className="t-eyebrow practice-caption">{t.practice.difficulty}</div>
    <div className="hstack practice-difficulty">
      <Chip selected={difficulty === 'all'} onClick={() => setDifficulty('all')}>{t.practice.filterDiffAll}</Chip>
      {([1, 2, 3] as const).map(n => {
        const value = String(n) as '1' | '2' | '3';
        const group = all.filter(it => it.difficulty === n);
        return <Chip key={n} sm selected={difficulty === value} onClick={() => setDifficulty(value)} title={t.common.questionCount(group.length)}>{t.common.difficultyName(n)}</Chip>;
      })}
    </div>
    {([1, 2, 3] as const).map(n => {
      const group = all.filter(it => it.difficulty === n);
      return <div key={n} className="practice-level">
        <div className="hstack"><span>{t.common.difficultyName(n)}</span><span className="spacer" /><span className="t-3">{t.common.questionCount(group.length)}</span></div>
        <Bar value={practiced(group, state)} max={group.length} tone={info.subject} thin />
      </div>;
    })}
    <div className="vstack practice-cta">
      <Button variant="primary" block icon="play" disabled={!practice.length} onClick={() => void startItems(practice.map(it => it.id), 'drill')}>{t.practice.startTopicPracticeBtn(info.name)}</Button>
      {practice.length ? <span className="t-3">{t.common.questionCount(practice.length)} · {t.time.minutes(itemMinutes(practice))}</span> : <span className="t-3">{t.empty.practiceFilterEmpty}</span>}
      <Button block icon="notes" onClick={() => go(noteLink(topic))}>{t.practice.openTopicNoteBtn}</Button>
    </div>
  </div>;
  const tag = weak && <Chip tone="warn" sm>{t.practice.legendWeak}</Chip>;
  return <Aside title={title} actions={<>{tag}{close && <IconButton icon="close" label={t.common.closeBtn} onClick={close} />}</>}>{body}</Aside>;
}

export function Practice({ selection, setSelection }: { selection: PracticeSelection; setSelection: (value: PracticeSelection) => void }) {
  const { state, bank, mastery, openSearch, startItems } = useStudy();
  const [q, setQ] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const { subject, tab, topic } = selection;
  const units = bank.bundle.taxonomy.subjects[subject]?.units ?? [];
  const all = useMemo(() => practiceView(bank, { subject }).items.filter(it => !isCard(it)), [bank, subject]);
  const result = useMemo(() => q.trim() ? practiceView(bank, { subject, q }).items : [], [bank, q, subject]);
  const papers = useMemo(() => {
    const groups = new Map<string, Item[]>();
    for (const item of all.filter(it => it.source.kind === 'official' && it.source.session)) {
      const key = item.source.session!;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups].sort(([a], [b]) => b.localeCompare(a));
  }, [all]);
  const school = bank.papers.filter(p => p.kind === 'school' && p.itemIds.some(id => bank.byId.get(id)?.subject === subject));
  const weak = all.filter(it => matchesTopic(state.profile.weakTopics, it.topic)).sort((a,b) => (state.progress[a.id]?.attempts ?? 0) - (state.progress[b.id]?.attempts ?? 0)).slice(0, 10);
  return <Page title={t.practice.title} desc={t.practice.subtitle}
    actions={<><Field value={q} onChange={setQ} placeholder={t.practice.searchPlaceholder} icon="search" pill />
      <Button square icon="search" aria-label={t.nav.globalSearchBtn} kbd="⌘K" onClick={openSearch} /></>}>
    <div className="hstack practice-toolbar">
      <Segmented size="lg" value={subject} onChange={value => setSelection({ ...selection, subject: value, topic: bank.bundle.taxonomy.subjects[value]?.units[0]?.topics[0]?.id ?? '' })}
        options={SUBJECTS.map(value => ({ value, label: t.common.subjectName(value), icon: value }))} />
      <span className="spacer" />
      <Tabs value={tab} onChange={value => setSelection({ ...selection, tab: value })} options={[
        { value: 'topic', label: t.practice.tabTopics }, { value: 'paper', label: t.practice.tabPapers, count: papers.length },
        { value: 'school', label: t.practice.tabSchools, count: school.length },
      ]} />
    </div>
    {q.trim() ? <Section title={t.nav.searchGroupItems}>
      {result.length ? <List>{result.slice(0, 100).map(it => <Row key={it.id} lead={<SubjectGlyph subject={it.subject} size="sm" />}
        title={it.source.label} meta={[bank.topics.get(it.topic)?.name, t.common.difficultyName(it.difficulty)]} chevron onClick={() => void startItems([it.id])} />)}</List>
        : <Empty icon="search" title={t.empty.practiceNoMatchTitle(q)} desc={t.empty.practiceNoMatchBody} />}
    </Section> : tab === 'topic' ? <>
      {units.map(unit => <Section key={unit.id} title={unit.name} desc={t.practice.topicCount(unit.topics.length)}>
        <div className="grid grid-4">{unit.topics.map(it => {
          const items = all.filter(item => item.topic === it.id);
          const value = mastery.find(row => row.topic === it.id)?.value ?? 0;
          return <MasteryTile key={it.id} name={it.name} ja={it.ja} mastery={value} tone={subject}
            weak={matchesTopic(state.profile.weakTopics, it.id)} selected={topic === it.id} onClick={() => {
              setSelection({ ...selection, topic: it.id });
              if (matchMedia('(max-width: 1359px)').matches) setShowDetails(true);
            }}
            foot={<><span className="num">{t.common.percent(percent(value))}</span><span>·</span><span>{t.practice.tileProgress(practiced(items, state), items.length)}</span></>} />;
        })}</div>
      </Section>)}
      <Sheet open={showDetails} label={t.practice.topicHeading} onClose={() => setShowDetails(false)}>
        <PracticeDetail key={topic} topic={topic} close={() => setShowDetails(false)} />
      </Sheet>
      {!!weak.length && <Section><Button icon="play" onClick={() => void startItems(weak.map(it => it.id), 'drill')}>{t.practice.quickWeakSetBtn}</Button></Section>}
    </> : <Section title={tab === 'paper' ? t.practice.tabPapers : t.practice.tabSchools} desc={tab === 'paper' ? t.practice.paperMockTip : t.practice.schoolViewIntro}>
      {!((tab === 'paper' ? papers : school).length) && <Empty title={t.practice.noPapers} />}
      <div className="grid grid-2">
        {tab === 'paper' ? papers.map(([key, items]) => {
          const official = /^(\d{4})_([12])$/.exec(key);
          return <Card key={key} title={official ? t.practice.paperTitle(Number(official[1]), Number(official[2]) as 1 | 2) : key}
            sub={t.practice.paperProgress(practiced(items, state), items.length)}>
            <Button icon="play" size="sm" onClick={() => void startItems(items.slice().sort((a,b) => (a.order ?? 0) - (b.order ?? 0)).map(it => it.id), 'drill')}>{t.practice.startPaperDrillBtn}</Button>
          </Card>;
        }) : school.map(paper => {
          const items = paper.itemIds.flatMap(id => { const item = bank.byId.get(id); return item?.subject === subject ? [item] : []; });
          return <Card key={paper.session} title={paper.school ? schoolNames[paper.school] : paper.label} sub={paper.label}>
            <div className="hstack practice-difficulty"><Chip tone="school" sm>{items.every(it => schoolPurpose(it) === 'exam_style') ? t.practice.sourceKindSchoolStyle : t.practice.sourceKindBoost}</Chip>
              {items.some(it => it.format === 'written') && <Chip sm>{t.practice.writtenFormatTag}</Chip>}</div>
            <Button icon="play" size="sm" onClick={() => void startItems(items.map(it => it.id), 'drill')}>{t.practice.startSchoolPracticeBtn}</Button>
          </Card>;
        })}
      </div>
    </Section>}
  </Page>;
}
