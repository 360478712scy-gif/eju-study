// Renders bank markup (shared/markup.ts) with KaTeX. Answer boxes \bx{A} render as EJU-style boxes.
import { memo, useMemo, type ReactNode } from 'react';
import katex from 'katex';
import 'katex/contrib/mhchem';
import 'katex/dist/katex.min.css';
import { parseBlocks, parseInline, KATEX_MACROS, type Block, type Inline } from '@shared/markup.ts';
import { cx } from '../lib/format.ts';
import './rich-text.css';

const cache = new Map<string, string>();

// KaTeX logs a metrics warning for circled digits (①…) inside math; they still render.
const warn = console.warn.bind(console);
console.warn = (...a: unknown[]) => {
  if (typeof a[0] === 'string' && a[0].startsWith('No character metrics')) return;
  warn(...a);
};

function tex(src: string, display: boolean): string {
  const key = (display ? 'D' : 'I') + src;
  const hit = cache.get(key);
  if (hit) return hit;
  let html: string;
  try {
    html = katex.renderToString(src, { displayMode: display, throwOnError: false, macros: { ...KATEX_MACROS }, strict: 'ignore', output: 'html' });
  } catch {
    html = `<code>${src.replace(/</g, '&lt;')}</code>`;
  }
  if (cache.size > 4000) cache.clear();
  cache.set(key, html);
  return html;
}

export interface BoxRenderer {
  (label: string): ReactNode;
}

function renderInlines(xs: Inline[], key: string, box?: BoxRenderer): ReactNode[] {
  return xs.map((x, i) => {
    const k = `${key}.${i}`;
    switch (x.type) {
      case 'text':
        return x.text;
      case 'br':
        return <br key={k} />;
      case 'strong':
        return <strong key={k}>{renderInlines(x.children, k, box)}</strong>;
      case 'u':
        return (
          <u key={k} className="rt-u">
            {renderInlines(x.children, k, box)}
          </u>
        );
      case 'box':
        return box ? <span key={k}>{box(x.label)}</span> : <span key={k} className="rt-box">{x.label}</span>;
      case 'math':
        return <span key={k} className={x.display ? 'rt-math-display' : 'rt-math'} dangerouslySetInnerHTML={{ __html: tex(x.tex, x.display) }} />;
    }
  });
}

function renderBlock(b: Block, i: number, box?: BoxRenderer): ReactNode {
  const k = String(i);
  switch (b.type) {
    case 'p':
      return <p key={k}>{renderInlines(b.children, k, box)}</p>;
    case 'math':
      return <div key={k} className="rt-math-display" dangerouslySetInnerHTML={{ __html: tex(b.tex, true) }} />;
    case 'list': {
      const Tag = b.ordered ? 'ol' : 'ul';
      return (
        <Tag key={k}>
          {b.items.map((it, j) => (
            <li key={j}>{renderInlines(it, `${k}.${j}`, box)}</li>
          ))}
        </Tag>
      );
    }
    case 'table':
      return (
        <div key={k} className="rt-table-wrap">
          <table className="rt-table">
            <thead>
              <tr>
                {b.header.map((c, j) => (
                  <th key={j}>{renderInlines(c, `${k}.h${j}`, box)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((c, m) => (
                    <td key={m}>{renderInlines(c, `${k}.${j}.${m}`, box)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

interface Props {
  text: string;
  lang?: 'ja' | 'zh';
  className?: string;
  /** Render inline instead of block paragraphs (option labels etc.). */
  inline?: boolean;
  box?: BoxRenderer;
}

export const RichText = memo(function RichText({ text, lang, className, inline, box }: Props) {
  const nodes = useMemo(() => {
    if (inline) return renderInlines(parseInline(text || ''), 'i', box);
    return parseBlocks(text || '').map((b, i) => renderBlock(b, i, box));
  }, [text, inline, box]);
  if (inline) {
    return (
      <span className={cx('rt rt-inline', className)} lang={lang === 'ja' ? 'ja' : lang === 'zh' ? 'zh-CN' : undefined}>
        {nodes}
      </span>
    );
  }
  return (
    <div className={cx('rt', className)} lang={lang === 'ja' ? 'ja' : lang === 'zh' ? 'zh-CN' : undefined}>
      {nodes}
    </div>
  );
});
