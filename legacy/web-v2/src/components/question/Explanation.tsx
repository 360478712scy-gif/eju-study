// The worked explanation: key points, traps and the exam shortcut on one quiet surface, then the
// solution, Japanese terms and the transcript.
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Item } from '@shared/types.ts';
import { RichText } from '../RichText.tsx';
import { Icon, type IconName } from '../Icon.tsx';
import { cx } from '../../lib/format.ts';

const UL = /^\s*-\s+/;
const OL = /^\s*(\d+)[.)]\s+/;
/** A label line on its own: "**解答**" / "**其余选项**：". */
const LABEL = /^\s*\*\*([^*\n]{1,14})\*\*\s*[：:]?\s*$/;

/**
 * Bank explanations write a label line right above its body ("**解答**\n1. …\n2. …"), which the
 * markup parser reads as one paragraph with line breaks, so lists showed literal "1." / "- " lines.
 * Give the label and each run of list lines their own block. A chunk is only split when the result
 * stays faithful: one run per list kind, and an ordered run that starts at 1.
 */
export function normalizeExplanation(md: string): string {
  return md
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((chunk) => {
      const lines = chunk.split('\n');
      const out: string[] = [];
      let rest = lines;
      const label = rest[0]?.match(LABEL);
      if (label && rest.length > 1) {
        out.push(`**${label[1].trim()}**`);
        rest = rest.slice(1);
      }
      const kind = (l: string) => (UL.test(l) ? 'ul' : OL.test(l) ? 'ol' : 't');
      const runs: { kind: string; lines: string[] }[] = [];
      for (const l of rest) {
        const k = kind(l);
        const last = runs[runs.length - 1];
        if (last && last.kind === k) last.lines.push(l);
        else runs.push({ kind: k, lines: [l] });
      }
      const lists = runs.filter((r) => r.kind !== 't');
      const faithful =
        lists.length > 0 &&
        new Set(lists.map((r) => r.kind)).size === lists.length &&
        lists.every((r) => r.kind !== 'ol' || r.lines[0].match(OL)?.[1] === '1');
      if (faithful) for (const r of runs) out.push(r.lines.join('\n'));
      else out.push(rest.join('\n'));
      return out.join('\n\n');
    })
    .join('\n\n');
}

/** Paragraphs that are only a bold label become the small headings of the explanation. */
function decorateHeadings(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(':scope > p').forEach((p) => {
    const only = p.childNodes.length === 1 && p.firstElementChild?.tagName === 'STRONG';
    p.classList.toggle('q-ex-h', only && (p.textContent || '').trim().length <= 14);
  });
}

export interface ExNote {
  tone: 'primary' | 'warning' | 'success';
  icon: IconName;
  title: string;
  body: ReactNode;
  /** Takes the full width under the two-column pair. */
  wide?: boolean;
}

/** 考点 / 易错 / 考场速解 on one quiet surface: the tone lives in the icon and the label only. */
export function ExNotes({ notes, className }: { notes: ExNote[]; className?: string }) {
  if (!notes.length) return null;
  return (
    <div className={cx('q-notes-box', className)}>
      <div className="q-notes">
        {notes.map((n) => (
          <section key={n.title} className={cx('q-note', `tone-${n.tone}`, n.wide && 'is-wide')}>
            <div className="q-note-head">
              <Icon name={n.icon} size={14} />
              {n.title}
            </div>
            <div className="q-note-body">{n.body}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

function bullets(xs: string[]) {
  return xs.length === 1 ? (
    <RichText text={xs[0]} lang="zh" inline />
  ) : (
    <ul>
      {xs.map((k, i) => (
        <li key={i}>
          <RichText text={k} lang="zh" inline />
        </li>
      ))}
    </ul>
  );
}

export function Explanation({ item, showTranscript = true }: { item: Item; showTranscript?: boolean }) {
  const ex = item.explanation;
  const main = useMemo(() => normalizeExplanation(ex.zh || ''), [ex.zh]);
  const mainRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = mainRef.current?.querySelector<HTMLElement>('.q-ex-main');
    if (el) decorateHeadings(el);
  }, [main]);

  const notes: ExNote[] = [];
  if (ex.keyPoints?.length) notes.push({ tone: 'primary', icon: 'target', title: '考点', body: bullets(ex.keyPoints) });
  if (ex.traps?.length) notes.push({ tone: 'warning', icon: 'alert', title: '易错', body: bullets(ex.traps) });
  if (ex.shortcut) notes.push({ tone: 'success', icon: 'zap', title: '考场速解', body: <RichText text={ex.shortcut} lang="zh" className="q-note-text" />, wide: true });

  return (
    <div className="q-ex">
      <ExNotes notes={notes} />
      <div ref={mainRef}>
        <RichText text={main} lang="zh" className="q-ex-main" />
      </div>
      {ex.terms && ex.terms.length > 0 && (
        <div className="q-terms-wrap">
          <div className="q-ex-sub">
            <Icon name="languages" size={14} />
            题中词汇
          </div>
          <div className="q-terms">
            {ex.terms.map((t) => (
              <span key={t.ja} className="q-term">
                <span className="q-term-ja" lang="ja">
                  <b>{t.ja}</b>
                  {t.kana && t.kana !== t.ja && <span className="q-term-kana">{t.kana}</span>}
                </span>
                <span className="q-term-zh" lang="zh-CN">
                  {t.zh}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
      {showTranscript && item.transcript && (
        <details className="q-transcript">
          <summary>
            <Icon name="file" size={14} /> 听力原文
            <Icon name="down" size={14} className="q-transcript-chev" />
          </summary>
          <RichText text={item.transcript} lang="ja" className="q-transcript-text" />
        </details>
      )}
    </div>
  );
}
