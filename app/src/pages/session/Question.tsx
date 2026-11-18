import type { Attempt, Item, Response, SessionAnswer } from '@shared/types.ts';
import { blankGroups } from '@shared/grading.ts';
import { useRef, useState } from 'react';
import { Button, Chip, Glass, Icon } from '../../ui/ui.tsx';
import { Callout, Figures, MarkCell, OptionRow } from '../../ui/Learning.tsx';
import { RichText } from '../../ui/RichText.tsx';
import { t } from '../../copy/index.ts';

function badge(label: string) {
  const c = label.codePointAt(0) ?? 0;
  if (label.length === 1 && c >= 0x2460 && c <= 0x2473) return String(c - 0x2460 + 1);
  return label === '⓪' ? '0' : label;
}

export function Stem({ item }: { item: Item }) {
  const [translated, setTranslated] = useState(false);
  return <Glass kind="read" className="stem selectable">
    <RichText text={item.stem} lang="ja" />
    <Figures figures={item.figures} />
    {item.written?.parts.map(part => part.prompt && !item.stem.includes(part.prompt) &&
      <div key={part.id} className="written-prompt"><Chip sm>{part.label} {t.session.writtenPartPoints(part.points)}</Chip><RichText text={part.prompt} lang="ja" /></div>)}
    {(item.stemZh || item.source.pdf) && <div className="hstack question-sources">
      {item.stemZh && <Button variant="ghost" size="sm" aria-expanded={translated} onClick={() => setTranslated(value => !value)}>{translated ? t.common.collapseBtn : t.session.translation}</Button>}
      {item.source.pdf && <a href={item.source.pdf + (item.source.page ? '#page=' + item.source.page : '')} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
        <Icon name="file" size={15} />{t.session.openSourcePdfBtn}
      </a>}
    </div>}
    {translated && item.stemZh && <RichText text={item.stemZh} lang="zh" />}
  </Glass>;
}

export function Choices({ item, response, reveal, disabled, choose }: {
  item: Item; response: Response; reveal?: boolean; disabled?: boolean; choose: (index: number) => void;
}) {
  return <div className="opts" role="radiogroup" aria-label={t.session.choiceKeyHint}>
    {item.options?.map((option, i) => {
      const label = item.optionLabels?.[i] ?? String(i + 1);
      const marker = badge(label);
      const result = reveal && item.answer === i ? 'right' : reveal && response === i ? 'wrong' : undefined;
      return <OptionRow key={i} marker={marker} selected={response === i} result={result} disabled={disabled} onClick={() => choose(i)}>
        {[label, marker].includes(option.trim()) ? t.session.seeOptionsTable : <RichText text={option} lang="ja" inline />}
      </OptionRow>;
    })}
  </div>;
}

export function Marks({ item, response, reveal, disabled, onChange, onEnter }: {
  item: Item; response: Response; reveal?: boolean; disabled?: boolean; onChange: (response: Record<string, string>) => void; onEnter?: () => void;
}) {
  const groups = blankGroups(item);
  const letters = [...new Set(groups.join('').split(''))];
  const values = (response ?? {}) as Record<string, string>;
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const set = (key: string, text: string) => {
    const digits = text.normalize('NFKC').replace(/[−–]/g, '-').replace(/[^0-9+±-]/g, '');
    const index = letters.indexOf(key);
    const next = { ...values };
    if (!text) delete next[key];
    else if (!digits) return;
    else for (const [offset, char] of [...digits].entries()) {
      const label = letters[index + offset];
      if (label) next[label] = char;
    }
    onChange(next);
    if (digits) {
      inputs.current[letters[index + digits.length]]?.focus();
      inputs.current[letters[index + digits.length]]?.select();
    }
  };
  return <Glass kind="card" className="marks">
    <h3>{t.session.mathSheetTitle}</h3>
    {!disabled && <p className="t-3">{t.session.mathSheetHint}</p>}
    <div className="marks-rows">
      {groups.map((group, i) => <div className="marks-group" key={group + i}>
        <span className="marks-tag num" aria-label={t.session.mathBoxGroupLabel(group)}>{group}</span>
        <div className="hstack">
          {[...group].map((letter, j) => <MarkCell key={letter + j} marker={letter}
            label={t.session.blankLabel(letter)} value={values[letter] ?? ''} expected={reveal ? item.blanks?.[letter] : undefined}
            disabled={disabled} inputRef={el => { inputs.current[letter] = el; }}
            onFocus={event => event.currentTarget.select()}
            onPaste={event => { event.preventDefault(); set(letter, event.clipboardData.getData('text')); }}
            onChange={event => set(letter, event.currentTarget.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); onEnter?.(); }
              const index = letters.indexOf(letter);
              if (event.key === 'ArrowLeft' || (event.key === 'Backspace' && !values[letter])) inputs.current[letters[index - 1]]?.focus();
              if (event.key === 'ArrowRight') inputs.current[letters[index + 1]]?.focus();
            }} />)}
        </div>
      </div>)}
    </div>
    {!disabled && <Button variant="ghost" size="sm" onClick={() => { onChange({}); inputs.current[letters[0]]?.focus(); }}>{t.session.mathClearAllBtn}</Button>}
  </Glass>;
}

const splitLabel = /^\s*(?:#{1,4}\s*)?\*{0,2}(思路|破题思路|解题思路|解答|解析|步骤|推导|完整推导步骤|结论|答案|最终答案|最终结论)\*{0,2}(?:[ \t　]*[：:][ \t　]*|[ \t　]+(?=\S)|\s*$)/;
function explanationParts(text: string) {
  const parts = { idea: '', steps: '', conclusion: '' };
  let active: keyof typeof parts = 'steps';
  for (const line of text.split('\n')) {
    const heading = line.match(splitLabel);
    if (!heading) { parts[active] += line + '\n'; continue; }
    active = /思路/.test(heading[1]) ? 'idea' : /答案|结论/.test(heading[1]) ? 'conclusion' : 'steps';
    parts[active] += line.slice(heading[0].length) + '\n';
  }
  return parts;
}

export function Solution({ item, answer }: { item: Item; answer?: SessionAnswer | Attempt }) {
  const { explanation: e } = item;
  const parts = explanationParts(e.zh);
  const conclusion = parts.conclusion.trim() || (item.format === 'choice' ? item.options?.[item.answer ?? -1]
    : item.format === 'blanks' ? blankGroups(item).map(group => `${group} = ${[...group].map(key => item.blanks?.[key] ?? '').join('')}`).join(' · ')
    : item.written?.parts.map(part => part.final).filter(Boolean).join(' · '));
  const idea = parts.idea.trim() || e.keyPoints?.[0];
  const facts = e.keyPoints ?? [];
  const traps = e.traps ?? [];
  return <Glass className="explain selectable" kind="read">
    {answer && <Chip tone={answer.correct ? 'ok' : 'bad'}>
      {answer.gaveUp ? t.session.feedbackRevealed : answer.correct
        ? answer.seconds > item.targetSec * 1.8 ? t.session.feedbackCorrectSlow(answer.seconds, item.targetSec)
          : answer.confidence && answer.confidence !== 'sure' ? t.session.feedbackCorrectUnsure : t.session.feedbackCorrect
        : t.session.feedbackWrong}
    </Chip>}
    {idea && <><h4>{t.session.explainIdeaHeading}</h4><RichText text={idea} lang="zh" /></>}
    {parts.steps.trim() && <><h4>{t.session.explainStepsHeading}</h4><RichText text={parts.steps} lang="zh" /></>}
    {conclusion && <><h4>{t.session.explainConclusionHeading}</h4><RichText text={conclusion} lang={parts.conclusion.trim() ? 'zh' : 'ja'} /></>}
    {(!!facts.length || !!traps.length || e.shortcut) && <div className="callouts">
      {!!facts.length && <Callout tone="primary" icon="target" label={t.session.explainKeyPointsHeading}><RichText text={facts.join('\n\n')} lang="zh" /></Callout>}
      {!!traps.length && <Callout tone="warn" icon="alert" label={t.session.explainTrapsHeading}><RichText text={traps.join('\n\n')} lang="zh" /></Callout>}
      {e.shortcut && <Callout tone="ok" icon="bolt" label={t.session.explainShortcutHeading}><RichText text={e.shortcut} lang="zh" /></Callout>}
    </div>}
    {!!e.terms?.length && <details className="session-terms"><summary>{t.session.explainTermsHeading}</summary>
      <ul>{e.terms.map((term, i) => <li key={i}><b lang="ja">{term.ja} {term.kana}</b> · {term.zh}</li>)}</ul>
    </details>}
  </Glass>;
}
