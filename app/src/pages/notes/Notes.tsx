import { matchesTopic } from '@shared/stats.ts';
import { useMemo, useState } from 'react';
import { Aside, Page } from '../../shell/Shell.tsx';
import { Button, Chip, Empty, Field, Glass, IconButton, List, Row, SubjectGlyph, TextArea, toast } from '../../ui/ui.tsx';
import { RichText } from '../../ui/RichText.tsx';
import { t } from '../../copy/index.ts';
import { SUBJECTS } from '@shared/types.ts';
import { go, noteLink } from '../../lib/navigation.ts';
import { useStudy } from '../../lib/study.tsx';
import './notes.css';

export function Notes({ topic, quick = false, close }: { topic?: string; quick?: boolean; close?: () => void }) {
  const { bank, state } = useStudy();
  const [search, setSearch] = useState('');
  const all = useMemo(() => [...bank.topics.values()], [bank]);
  const matches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return new Set(all.filter(row => !query || [row.name, row.ja, row.id, bank.notesByTopic.get(row.id)?.body, state.notes[row.id]]
      .join(' ').toLocaleLowerCase().includes(query)).map(row => row.id));
  }, [all, bank, search, state.notes]);
  const pinned = [...matches].filter(id => matchesTopic(state.profile.weakTopics, id));
  const selected = (topic && bank.topics.get(topic)) || bank.topics.get(pinned[0]) || all.find(row => matches.has(row.id));
  const [quickTopic, setQuickTopic] = useState('');
  const entry = quick && quickTopic ? bank.topics.get(quickTopic) : selected;
  const row = (id: string) => {
    const info = bank.topics.get(id);
    return info && <Row key={id} lead={<SubjectGlyph subject={info.subject} size="sm" />} title={info.name} current={entry?.id === id}
      onClick={() => quick ? setQuickTopic(id) : go(noteLink(id))} />;
  };
  const reading = entry ? <NoteBody topic={entry.id} key={entry.id} quick={quick} close={close} /> : <Empty title={t.empty.notesIdlePrompt} />;
  if (quick) return <Aside title={t.notes.quickDrawerTitle} actions={<IconButton icon="close" label={t.common.closeBtn} onClick={close} />}>
    {reading}
    {!topic && <List>{pinned.slice(0, 8).map(row)}</List>}
  </Aside>;
  return <Page wide>
    <div className="notes">
      <div className="notes-toc">
        <Field value={search} onChange={setSearch} placeholder={t.notes.searchPlaceholder} icon="search" pill />
        {!!pinned.length && <><div className="t-caps notes-heading">{t.notes.pinnedWeakHeading}</div><List>{pinned.map(row)}</List></>}
        {!matches.size ? <Empty title={t.empty.notesNoMatchTitle(search)} desc={t.empty.notesNoMatchBody} /> : <>
          <div className="t-caps notes-heading">{t.notes.allSyllabusHeading}</div>
          {SUBJECTS.map(subject => {
            const units = bank.bundle.taxonomy.subjects[subject]?.units.filter(unit => unit.topics.some(topic => matches.has(topic.id)));
            return !!units?.length && <details key={subject} open={entry?.subject === subject || !!search}>
              <summary>{t.common.subjectName(subject)}</summary>
              {units.map(unit => <div key={unit.id}>
                <div className="t-eyebrow notes-unit">{unit.name}</div>
                <List>{unit.topics.filter(topic => matches.has(topic.id)).map(topic => row(topic.id))}</List>
              </div>)}
            </details>;
          })}
        </>}
      </div>
      {reading}
    </div>
  </Page>;
}

function NoteBody({ topic, quick, close }: { topic: string; quick?: boolean; close?: () => void }) {
  const { bank, state, action, startItems, openCoach } = useStudy();
  const [draft, setDraft] = useState<string | null>(null);
  const entry = bank.topics.get(topic)!;
  const unit = bank.bundle.taxonomy.subjects[entry.subject]?.units.find(unit => unit.topics.some(row => row.id === topic));
  const content = bank.notesByTopic.get(topic);
  const items = bank.byTopic.get(topic) ?? [];
  const terms = [...new Map([...(content?.terms ?? []), ...items.flatMap(it => it.explanation.terms ?? [])].map(term => [term.ja, term])).values()];
  const writable = state.notes[topic] ?? '';
  return <Glass as="article" kind="read" className="notes-read selectable">
    <div className="page-eyebrow"><Chip tone={entry.subject} icon={entry.subject} sm>{t.common.subjectName(entry.subject)}{unit && <> · {unit.name}</>}</Chip></div>
    <h1 className="page-title notes-title">{entry.name} <span className="ja t-3">{entry.ja}</span></h1>
    {content?.body ? <RichText text={content.body} lang="zh" /> : <p className="t-3">{t.notes.missingNote}</p>}
    {!!terms.length && <details className="notes-terms"><summary>{t.notes.headingTerms}</summary>
      <dl>{terms.map(term => <div key={term.ja}><dt lang="ja">{term.ja} {term.kana}</dt><dd>{term.zh}</dd></div>)}</dl></details>}
    {!quick && <div className="notes-personal">
      <h3>{t.notes.personal}</h3>
      <TextArea value={draft ?? writable} onChange={setDraft} placeholder={t.notes.personalHint} />
      <Button size="sm" icon="check" disabled={draft === null || draft === writable} onClick={async () => {
        if (await action({ type: 'topicNote', topic, text: draft ?? '' }) !== undefined) {
          setDraft(null);
          toast(t.notes.personalSaved, 'ok');
        }
      }}>{t.common.saveBtn}</Button>
    </div>}
    <div className="hstack notes-actions">
      {quick ? <Button icon="notes" onClick={() => { close?.(); go(noteLink(topic)); }}>{t.notes.openInNotesPageBtn}</Button>
        : <Button icon="play" variant="primary" disabled={!items.length} onClick={() => void startItems(items.slice(0, 5).map(it => it.id), 'drill')}>{t.notes.practiceFromNoteBtn(entry.name)}</Button>}
      <Button icon="coach" onClick={() => { close?.(); openCoach({ topic, page: t.nav.notes }); }}>{t.notes.askCoachFromNoteBtn}</Button>
    </div>
  </Glass>;
}
