// Markdown-lite parser shared by the renderer (web) and the validator (tools).
// Supported: paragraphs (blank line), line breaks, **bold**, __underline__,
// - / 1. lists, pipe tables, $inline$ and $$display$$ KaTeX, and \bx{AB} answer
// boxes outside math. See content/AUTHORING.md §2.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'u'; children: Inline[] }
  | { type: 'math'; tex: string; display: boolean }
  | { type: 'box'; label: string }
  | { type: 'br' };

export type Block =
  | { type: 'p'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { type: 'math'; tex: string };

/** KaTeX macros used by the bank. \bx{AB} draws an EJU answer box. */
export const KATEX_MACROS: Record<string, string> = {
  '\\bx': '\\boxed{\\textsf{\\footnotesize #1}}',
};

type Tok =
  | { k: 'text'; v: string }
  | { k: 'math'; v: string; display: boolean }
  | { k: 'box'; v: string }
  | { k: 'br' }
  | { k: 'strong' }
  | { k: 'u' };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ k: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && src[i + 1] === '$') {
      buf += '$';
      i += 2;
      continue;
    }
    if (c === '$') {
      const display = src[i + 1] === '$';
      const open = display ? 2 : 1;
      let j = i + open;
      let found = -1;
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === '$' && (!display || src[j + 1] === '$')) {
          found = j;
          break;
        }
        j++;
      }
      if (found >= 0) {
        flush();
        out.push({ k: 'math', v: src.slice(i + open, found).trim(), display });
        i = found + open;
        continue;
      }
    }
    if (c === '\\' && src.startsWith('\\bx{', i)) {
      const end = src.indexOf('}', i);
      const label = src.slice(i + 4, end);
      if (end > 0 && /^[A-Z]+$/.test(label)) {
        flush();
        out.push({ k: 'box', v: label });
        i = end + 1;
        continue;
      }
    }
    if (c === '*' && src[i + 1] === '*') {
      flush();
      out.push({ k: 'strong' });
      i += 2;
      continue;
    }
    if (c === '_' && src[i + 1] === '_') {
      flush();
      out.push({ k: 'u' });
      i += 2;
      continue;
    }
    if (c === '\n') {
      flush();
      out.push({ k: 'br' });
      i += 1;
      continue;
    }
    buf += c;
    i += 1;
  }
  flush();
  return out;
}

export function parseInline(src: string): Inline[] {
  const toks = tokenize(src);
  // Unmatched style markers are rendered literally.
  const counts = { strong: 0, u: 0 };
  for (const t of toks) if (t.k === 'strong' || t.k === 'u') counts[t.k]++;
  const root: Inline[] = [];
  const stack: { kind: 'strong' | 'u'; children: Inline[] }[] = [];
  const cur = () => (stack.length ? stack[stack.length - 1].children : root);
  const seen = { strong: 0, u: 0 };
  for (const t of toks) {
    if (t.k === 'strong' || t.k === 'u') {
      seen[t.k]++;
      const pairable = counts[t.k] % 2 === 0 || seen[t.k] < counts[t.k];
      if (!pairable) {
        cur().push({ type: 'text', text: t.k === 'strong' ? '**' : '__' });
        continue;
      }
      const top = stack[stack.length - 1];
      if (top && top.kind === t.k) {
        stack.pop();
        cur().push(t.k === 'strong' ? { type: 'strong', children: top.children } : { type: 'u', children: top.children });
      } else {
        stack.push({ kind: t.k, children: [] });
      }
      continue;
    }
    if (t.k === 'text') cur().push({ type: 'text', text: t.v });
    else if (t.k === 'math') cur().push({ type: 'math', tex: t.v, display: t.display });
    else if (t.k === 'box') cur().push({ type: 'box', label: t.v });
    else cur().push({ type: 'br' });
  }
  // Close anything left open (should not happen after pairing check).
  while (stack.length) {
    const top = stack.pop()!;
    cur().push(top.kind === 'strong' ? { type: 'strong', children: top.children } : { type: 'u', children: top.children });
  }
  return root;
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

export function parseBlocks(src: string): Block[] {
  const text = (src || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const chunks = text.split(/\n[ \t]*\n/);
  const blocks: Block[] = [];
  for (const raw of chunks) {
    const chunk = raw.replace(/^\n+|\n+$/g, '');
    const lines = chunk.split('\n');
    if (/^\$\$[\s\S]*\$\$$/.test(chunk.trim()) && chunk.trim().indexOf('$$', 2) === chunk.trim().length - 2) {
      blocks.push({ type: 'math', tex: chunk.trim().slice(2, -2).trim() });
      continue;
    }
    if (lines.length >= 2 && lines.every((l) => l.trim().startsWith('|')) && /^\s*\|?\s*:?-{2,}/.test(lines[1])) {
      const header = splitRow(lines[0]).map(parseInline);
      const rows = lines.slice(2).map((l) => splitRow(l).map(parseInline));
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    if (lines.every((l) => /^\s*-\s+/.test(l))) {
      blocks.push({ type: 'list', ordered: false, items: lines.map((l) => parseInline(l.replace(/^\s*-\s+/, ''))) });
      continue;
    }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      blocks.push({ type: 'list', ordered: true, items: lines.map((l) => parseInline(l.replace(/^\s*\d+[.)]\s+/, ''))) });
      continue;
    }
    blocks.push({ type: 'p', children: parseInline(chunk) });
  }
  return blocks;
}

/** Every TeX snippet in a markup string, for validation. */
export function collectMath(src: string): { tex: string; display: boolean }[] {
  const out: { tex: string; display: boolean }[] = [];
  const walk = (xs: Inline[]) => {
    for (const x of xs) {
      if (x.type === 'math') out.push({ tex: x.tex, display: x.display });
      else if (x.type === 'strong' || x.type === 'u') walk(x.children);
    }
  };
  for (const b of parseBlocks(src)) {
    if (b.type === 'math') out.push({ tex: b.tex, display: true });
    else if (b.type === 'p') walk(b.children);
    else if (b.type === 'list') b.items.forEach(walk);
    else if (b.type === 'table') {
      b.header.forEach(walk);
      b.rows.forEach((r) => r.forEach(walk));
    }
  }
  return out;
}
