import { useEffect, useRef, useState } from 'react';
import { daysBetween } from '@shared/dates.ts';
import type { Item, PracticeSession } from '@shared/types.ts';
import { Page } from '../../shell/Shell.tsx';
import { Button, Card, Chip, Empty, Glass, Icon, List, Row, Section, Stat, SubjectGlyph, Tabs, toast } from '../../ui/ui.tsx';
import { RichText } from '../../ui/RichText.tsx';
import { t } from '../../copy/index.ts';
import { itemMinutes, topicName } from '../../lib/model.ts';
import { isTyping, link, go } from '../../lib/navigation.ts';
import { onWindowVisibility } from '../../lib/native.ts';
import { useStudy } from '../../lib/study.tsx';
import './review.css';

type Rating = 1 | 2 | 3;
type Filter = 'all' | 'mistakes' | 'traps' | 'cards';
const INITIAL_ROWS = 30;
export const cardRating = (item: Item, rating: Rating) => ({
  response: rating === 1 ? null : item.answer ?? null,
  confidence: (rating === 1 ? 'guess' : rating === 2 ? 'unsure' : 'sure') as 'guess' | 'unsure' | 'sure',
  gaveUp: rating === 1 || item.answer == null,
});

export function FlashCard({ item, index, total, onRate, disabled = false, shortcuts = true, trackTime = false }: {
  item: Item; index: number; total: number; onRate: (rating: Rating, seconds: number) => void; disabled?: boolean; shortcuts?: boolean; trackTime?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const { bank } = useStudy();
  const time = useRef({ start: 0, elapsed: 0 });
  useEffect(() => {
    if (!trackTime || !shortcuts) return;
    const update = (visible: boolean) => {
      const watch = time.current;
      if (watch.start) watch.elapsed += performance.now() - watch.start;
      watch.start = visible ? performance.now() : 0;
    };
    update(!document.hidden);
    const remove = onWindowVisibility(update);
    return () => { update(false); remove(); };
  }, [shortcuts, trackTime]);
  const rate = (rating: Rating) => {
    const { start, elapsed } = time.current;
    onRate(rating, Math.min(3600, Math.floor((elapsed + (start ? performance.now() - start : 0)) / 1000)));
  };
  useEffect(() => {
    if (!shortcuts) return;
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTyping(event) || disabled) return;
      if ((event.target as HTMLElement)?.closest('button') && event.code === 'Space') return;
      if (event.code === 'Space') {
        event.preventDefault();
        setFlipped(value => !value);
      } else if (flipped && /^[123]$/.test(event.key)) {
        event.preventDefault();
        rate(Number(event.key) as Rating);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [flipped, onRate, disabled, shortcuts]);

  return <>
    <div className={`flash${flipped ? ' is-flipped' : ''}`}>
      <div className="flash-inner">
        <Glass kind="read" className="flash-face" inert={flipped || undefined}>
          <Chip tone={item.subject} icon="cards" sm>{topicName(bank, item.topic)} · {t.review.cardCounter(index, total)}</Chip>
          <div className="flash-q"><RichText text={item.stem} lang="ja" /></div>
          <Button variant="ghost" size="sm" kbd="Space" onClick={() => setFlipped(true)}>{t.review.flipCardBtn}</Button>
        </Glass>
        <Glass kind="read" className="flash-face flash-back" inert={!flipped || undefined}>
          <Chip tone={item.subject} icon="cards" sm>{topicName(bank, item.topic)}</Chip>
          <div className="flash-a"><RichText text={item.options?.[item.answer ?? -1] ?? ''} lang="ja" inline /></div>
          <div className="flash-more"><RichText text={item.explanation.zh} lang="zh" /></div>
        </Glass>
      </div>
    </div>
    <div className="hstack flash-rating">
      <Button disabled={!flipped || disabled} onClick={() => rate(1)}>{t.review.rateAgainBtn}</Button>
      <Button disabled={!flipped || disabled} onClick={() => rate(2)}>{t.review.rateHardBtn}</Button>
      <Button variant="primary" disabled={!flipped || disabled} onClick={() => rate(3)}>{t.review.rateGoodBtn}</Button>
    </div>
  </>;
}

export function Review({ cardsOnly = false, shortcuts = true }: { cardsOnly?: boolean; shortcuts?: boolean }) {
  const { state, bank, queue, date, startItems, action, active, openSession } = useStudy();
  const [filter, setFilter] = useState<Filter>(cardsOnly ? 'cards' : 'all');
  const [showAll, setShowAll] = useState(false);
  const [rated, setRated] = useState(0);
  const [rating, setRating] = useState(false);
  const ratingLock = useRef(false);
  const traps = queue.filter(row => !row.reasons.includes('card') && (row.traps.length || row.reasons.some(r => ['slow','possible_guess','guess'].includes(r))));
  const mistakes = queue.filter(row => row.reasons.includes('mistake') && !row.reasons.includes('card'));
  const cards = queue.filter(row => row.reasons.includes('card'));
  const shown = { all: queue, mistakes, traps, cards }[filter];
  const visibleRows = showAll ? shown : shown.slice(0, INITIAL_ROWS);
  const item = cards.length ? bank.byId.get(cards[0].itemId) : undefined;
  const items = shown.flatMap(row => { const entry = bank.byId.get(row.itemId); return entry ? [entry] : []; });
  const rate = async (value: Rating, seconds: number) => {
    if (!item || ratingLock.current) return;
    if (active) { toast(t.common.activeSession, 'warn'); openSession(active); return; }
    ratingLock.current = true;
    setRating(true);
    try {
      const session = await action<PracticeSession>({ type: 'startPractice', itemIds: [item.id], kind: 'review' });
      if (!session) return;
      if (seconds) await action({ type: 'tick', sessionId: session.id, seconds });
      const saved = await action({ type: 'answer', sessionId: session.id, itemId: item.id, seconds, ...cardRating(item, value) });
      if (saved !== undefined && await action({ type: 'finish', sessionId: session.id })) setRated(n => n + 1);
      else openSession(session);
    } finally { ratingLock.current = false; setRating(false); }
  };
  return <Page title={t.review.title} desc={t.review.subtitle}
    actions={!!queue.length && <Button variant="primary" icon="review" disabled={!items.length} onClick={() => void startItems(items.map(it => it.id), 'review')}>{t.review.startReviewQueueBtn(items.length)}</Button>}>
    <div className="grid grid-3 enter">
      <Card><Stat label={t.review.statMistakesLabel} value={mistakes.length} icon="history" /></Card>
      <Card><Stat label={t.review.statTrapsLabel} value={traps.length} icon="alert" /></Card>
      <Card><Stat label={t.review.statCardsLabel} value={cards.length} icon="cards" /></Card>
    </div>
    {item && (filter === 'all' || filter === 'cards') && <Section title={t.review.card} desc={t.review.cardFrontPrompt}>
      <FlashCard key={item.id} item={item} index={rated + 1} total={rated + cards.length} onRate={rate} disabled={rating} shortcuts={shortcuts} trackTime />
    </Section>}
    {!queue.length ? <Empty icon="check" title={t.empty.reviewClearTitle} desc={t.empty.reviewClearBody}
      action={<Button onClick={() => go(link('practice'))}>{t.practice.title}</Button>} /> :
      <Section title={t.review.filterAll} desc={t.review.dueSummary(items.length, itemMinutes(items))} actions={
        <Tabs value={filter} onChange={value => { setFilter(value); setShowAll(false); }} options={[
          { value: 'all', label: t.review.filterAll }, { value: 'mistakes', label: t.review.filterMistakes },
          { value: 'traps', label: t.review.filterTrapsAndSlow }, { value: 'cards', label: t.review.filterFlashcards },
        ]} />}>
        {items.length ? <Card pad={false}><List>{visibleRows.map(row => {
          const display = bank.byId.get(row.itemId);
          if (!display) return null;
          const late = row.due ? daysBetween(row.due, date) : 0;
          const p = state.progress[row.itemId];
          return <Row key={row.itemId} lead={<SubjectGlyph subject={display.subject} />} title={display.source.label}
            meta={[topicName(bank, row.topic), row.reasons.includes('slow') && t.review.slowAttemptTag,
              row.reasons.includes('possible_guess') && t.review.possibleGuess,
              row.reasons.includes('guess') && t.review.unsureAttemptTag,
              p?.box ? t.review.streakProgress(p.box) : null,
              row.traps[0] && <RichText text={row.traps[0]} lang="zh" inline />]}
            trail={<Chip sm tone="warn">{!row.due ? t.review.newCard : late > 0 ? t.review.overdueBadge(late) : late < 0 ? t.review.dueTomorrowBadge : t.review.dueTodayBadge}</Chip>}
            onClick={() => void startItems([row.itemId], 'review')} />;
        })}</List>
          {!showAll && shown.length > INITIAL_ROWS && <div className="review-list-more">
            <Button variant="ghost" iconRight="chev-down" onClick={() => setShowAll(true)}>{t.review.showAllItemsBtn(shown.length)}</Button>
          </div>}
        </Card> : <Empty title={t.empty.reviewFilterEmpty} />}
      </Section>}
    {!item && !!rated && <Card title={t.review.deckCompleteTitle} actions={<Icon name="check" size={18} />} />}
  </Page>;
}
