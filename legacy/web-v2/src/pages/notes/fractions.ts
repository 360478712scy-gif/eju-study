// Inline fractions in Chinese notes render text-size (RichText turns \dfrac into \frac there), so a
// stacked ΔΦ/Δt or vB²L²/R shrinks to ~70% and its superscripts become unreadable at night.
// Following DESIGN §1, inline fractions are rewritten in slash form (ΔΦ/Δt, mgR sinθ/(B²L²)).
// Plain numeric coefficients (½mv²) and fractions directly followed by a factor stay stacked;
// anything in \displaystyle is left alone.

const FRAC = /\\[dt]?frac(?![a-zA-Z])/y;
const NUMBER = /^-?\d+(\.\d+)?$/;
// After a fraction, these start another factor ("\frac{2m_1}{m_1+m_2}v_1"), so a slash would be ambiguous.
const FACTOR_AFTER = /^(?:[A-Za-z0-9({]|\\(?:left[([|]|sqrt|sin|cos|tan|log|ln|exp|sum|prod|int|lim|alpha|beta|gamma|delta|Delta|varepsilon|epsilon|zeta|eta|theta|Theta|kappa|lambda|Lambda|mu|nu|xi|pi|Pi|rho|sigma|Sigma|tau|phi|Phi|varphi|chi|psi|Psi|omega|Omega|vec|overline|overrightarrow|bar|hat|mathrm|text|ce)(?![a-zA-Z]))/;
// "\log_a \frac{M}{N}": a slash right after an operator would read as (log M)/N.
const OPERATOR_BEFORE = /\\(?:log|ln|sin|cos|tan|arg)(?:_(?:\{[^{}]*\}|[A-Za-z0-9]))?\s*$/;
const FUNCS = new Set(['sin', 'cos', 'tan', 'log', 'ln']);
const WRAPS = new Set(['text', 'mathrm', 'mathbf', 'ce', 'vec', 'bar', 'overline', 'hat', 'operatorname']);

function readArg(s: string, p: number): { body: string; end: number } | null {
  while (s[p] === ' ') p++;
  if (p >= s.length) return null;
  if (s[p] === '{') {
    let depth = 0;
    for (let j = p; j < s.length; j++) {
      if (s[j] === '\\') {
        j++;
        continue;
      }
      if (s[j] === '{') depth++;
      else if (s[j] === '}' && --depth === 0) return { body: s.slice(p + 1, j), end: j + 1 };
    }
    return null;
  }
  if (s[p] === '\\') {
    const m = /^\\(?:[A-Za-z]+|.)/.exec(s.slice(p));
    return m ? { body: m[0], end: p + m[0].length } : null;
  }
  return { body: s[p], end: p + 1 };
}

/** + or − at the top level (not a leading sign): "b^2-4ac" needs parentheses, "-b" does not. */
function hasTopLevelSum(s: string): boolean {
  let depth = 0;
  const t = s.trim();
  for (let j = 0; j < t.length; j++) {
    const c = t[j];
    if (c === '\\') {
      const m = /^\\([A-Za-z]+)/.exec(t.slice(j));
      if (m) {
        if (depth === 0 && j > 0 && (m[1] === 'pm' || m[1] === 'mp')) return true;
        if (m[1] === 'left') depth++;
        else if (m[1] === 'right') depth--;
        j += m[0].length - 1;
      } else j++;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if ((c === '+' || c === '-') && depth === 0 && j > 0) return true;
  }
  return false;
}

/** End of a balanced group opened at p (( [ | or \\left), or -1. */
function groupEnd(s: string, p: number): number {
  if (s.startsWith('\\left', p)) {
    let depth = 0;
    for (let j = p; j < s.length; j++) {
      if (s.startsWith('\\left', j)) depth++;
      else if (s.startsWith('\\right', j) && --depth === 0) return j + 7 < s.length ? j + 7 : s.length;
    }
    return -1;
  }
  const open = s[p];
  if (open === '|') {
    const j = s.indexOf('|', p + 1);
    return j < 0 ? -1 : j + 1;
  }
  const close = open === '(' ? ')' : open === '[' ? ']' : '';
  if (!close) return -1;
  let depth = 0;
  for (let j = p; j < s.length; j++) {
    if (s[j] === open) depth++;
    else if (s[j] === close && --depth === 0) return j + 1;
  }
  return -1;
}

/** One symbol, number, function value, command group or bracketed group, with scripts / primes / "!". */
function unitEnd(s: string, p: number, allowFunc = true): number {
  while (s[p] === ' ') p++;
  if (s.startsWith('\\Delta', p) && !/[a-zA-Z]/.test(s[p + 6] || '')) {
    p += 6;
    while (s[p] === ' ') p++;
  }
  let q = -1;
  const num = /^\d+(\.\d+)?/.exec(s.slice(p));
  if (num) q = p + num[0].length;
  else if (/[A-Za-z]/.test(s[p] || '')) q = p + 1;
  else if (s[p] === '(' || s[p] === '[' || s[p] === '|' || s.startsWith('\\left', p)) q = groupEnd(s, p);
  else if (s[p] === '\\') {
    const m = /^\\([A-Za-z]+)/.exec(s.slice(p));
    if (!m) return -1;
    q = p + m[0].length;
    if (WRAPS.has(m[1]) || m[1] === 'sqrt') {
      if (m[1] === 'sqrt' && s[q] === '[') q = groupEnd(s, q);
      const a = q < 0 ? null : readArg(s, q);
      if (!a) return -1;
      q = a.end;
    } else if (FUNCS.has(m[1])) {
      // \sin A, \cos^2\theta: a function of one unit is still one unit.
      if (!allowFunc) return -1;
      while (s[q] === '^' || s[q] === '_') {
        const a = readArg(s, q + 1);
        if (!a) return -1;
        q = a.end;
      }
      return unitEnd(s, q, false);
    }
  }
  if (q < 0) return -1;
  for (;;) {
    if (s[q] === "'" || s[q] === '!') q++;
    else if (s[q] === '^' || s[q] === '_') {
      const a = readArg(s, q + 1);
      if (!a) return -1;
      q = a.end;
    } else break;
  }
  // f(x), P(A), n(U): a symbol applied to a plain argument (not a product such as k(k+1)).
  if (s[q] === '(' && /^[A-Za-z]/.test(s.slice(p))) {
    const e = groupEnd(s, q);
    if (e > 0 && !/[+\-]/.test(s.slice(q, e))) q = e;
  }
  return q;
}

function isAtomic(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  // Differentials: dx, dt.
  if (/^d[a-z]$/.test(s)) return true;
  const e = unitEnd(s, 0);
  return e === s.length;
}

function convert(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    FRAC.lastIndex = i;
    const m = FRAC.exec(s);
    if (!m) {
      out += s[i];
      i += 1;
      continue;
    }
    const a = readArg(s, i + m[0].length);
    const b = a && readArg(s, a.end);
    if (!a || !b) {
      out += m[0];
      i += m[0].length;
      continue;
    }
    const num = convert(a.body).trim();
    const den = convert(b.body).trim();
    // Thin spaces do not separate factors: "\\frac{a}{b}\\,\\vec b" is still a product.
    const after = s.slice(b.end).replace(/^(?:\s|\\[,!:;])+/, '');
    const inExponent = /[\^_]\s*\{\s*$/.test(out);
    const numeric = NUMBER.test(num) && NUMBER.test(den);
    const nested = num.includes('/') || den.includes('/');
    if (!inExponent && (numeric || nested || FACTOR_AFTER.test(after) || OPERATOR_BEFORE.test(out))) {
      out += `\\frac{${num}}{${den}}`;
    } else {
      const n = !isAtomic(num) && hasTopLevelSum(num) ? `(${num})` : num;
      const d = isAtomic(den) ? den : `(${den})`;
      // A space after a trailing command keeps "\theta/" from gluing to the next token.
      if (/\\[A-Za-z]+$/.test(out) && /^[A-Za-z]/.test(n)) out += ' ';
      out += `${n}/${d}`;
      if (/\\[A-Za-z]+$/.test(d) && /^[A-Za-z]/.test(after)) out += ' ';
    }
    i = b.end;
  }
  return out;
}

export function slashTex(tex: string): string {
  if (!tex.includes('frac') || tex.includes('\\displaystyle')) return tex;
  return convert(tex);
}

/** Rewrites every inline $…$ of a markup string; $$display$$ math is untouched. */
export function slashFractions(markup: string): string {
  if (!markup.includes('frac')) return markup;
  let out = '';
  let i = 0;
  while (i < markup.length) {
    const c = markup[i];
    if (c === '\\' && markup[i + 1] === '$') {
      out += '\\$';
      i += 2;
      continue;
    }
    if (c !== '$') {
      out += c;
      i += 1;
      continue;
    }
    if (markup[i + 1] === '$') {
      const end = markup.indexOf('$$', i + 2);
      if (end < 0) return out + markup.slice(i);
      out += markup.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    let j = i + 1;
    let found = -1;
    while (j < markup.length) {
      if (markup[j] === '\\') {
        j += 2;
        continue;
      }
      if (markup[j] === '$') {
        found = j;
        break;
      }
      j += 1;
    }
    if (found < 0) return out + markup.slice(i);
    out += '$' + slashTex(markup.slice(i + 1, found)) + '$';
    i = found + 1;
  }
  return out;
}
