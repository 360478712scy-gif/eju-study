import type { CoachBlock, CoachMode, CoachReply } from '../shared/coach-ui.ts';
import { blankGroups } from '../shared/grading.ts';
import type { Item } from '../shared/types.ts';
import { decode, invalid, replySchema } from './coach-schema.ts';
import { cleanWidget } from './coach-widget.ts';

const functions = new Set('sin cos tan asin acos atan exp ln log sqrt abs'.split(' '));
const constants = new Set(['x', 'pi', 'e']);

function checkPlot(plot: Extract<CoachBlock, { type: 'plot' }>) {
  if (plot.x[0] >= plot.x[1] || (plot.y && plot.y[0] >= plot.y[1])) invalid();
  const names = new Set(constants);
  for (const p of plot.params ?? []) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(p.name) ||
      names.has(p.name) ||
      functions.has(p.name) ||
      Object.hasOwn(Object.prototype, p.name) ||
      !(p.min < p.max && p.step > 0 && p.value >= p.min && p.value <= p.max)
    )
      invalid();
    names.add(p.name);
  }
  for (const { expr } of plot.fns) {
    const tokens = expr.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z][a-zA-Z0-9_]*|\S/g) ?? [];
    let operand = true,
      depth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (operand) {
        if (t === '-') continue;
        if (t === '(') {
          depth++;
          continue;
        }
        if (functions.has(t) && tokens[i + 1] === '(') continue;
        if (!names.has(t) && !(/^\d/.test(t) && !t.includes('E') && Number.isFinite(Number(t)))) invalid();
        operand = false;
      } else if (t === ')' && depth > 0) depth--;
      else if (/^[+*/^-]$/.test(t)) operand = true;
      else invalid();
    }
    if (depth || operand) invalid();
  }
}

export function cleanReply(raw: unknown, modes: CoachMode[]): CoachReply {
  const r = decode(replySchema(modes), raw) as CoachReply;
  r.summary = r.summary.replace(/\s+/g, ' ');
  for (const b of r.blocks) {
    switch (b.type) {
      case 'choice':
        if (b.answer < 0 || b.answer >= b.options.length || b.feedback.length !== b.options.length) invalid();
        break;
      case 'table':
        if (b.rows.some((row) => row.length !== b.head.length)) invalid();
        break;
      case 'plot':
        checkPlot(b);
        break;
      case 'widget':
        b.html = cleanWidget(b.html);
        b.height = Math.min(640, Math.max(120, Math.round(b.height)));
        break;
      case 'actions':
        if (
          b.items.some((a) => (a.do === 'ask' && !a.prompt) || ((a.do === 'note' || a.do === 'practice') && !a.topic))
        )
          invalid();
        break;
      case 'steps':
        if (r.mode !== 'reveal') invalid();
    }
  }
  const has = (type: CoachBlock['type']) => r.blocks.some((b) => b.type === type);
  const last = r.blocks.at(-1)!;
  if (r.mode === 'hint') {
    if (!has('question') || r.blocks.filter((b) => b.type === 'hints').length !== 1 || last.type !== 'actions')
      invalid();
    const reveal = last.items.filter((a) => a.do === 'reveal');
    const followups = last.items.filter((a) => a.do === 'ask');
    if (reveal.length !== 1 || followups.length < 1 || followups.length > 2) invalid();
    reveal[0].label = '我想看答案';
  }
  if (
    r.mode === 'reveal' &&
    (!has('steps') || !r.blocks.some((b) => b.type === 'callout' && b.tone === 'trap') || last.type !== 'question')
  )
    invalid();
  if (r.mode === 'concept') {
    const lesson = r.blocks.filter((b) => b.type !== 'actions');
    if (lesson.length < 2 || !['choice', 'question'].includes(lesson.at(-1)!.type)) invalid();
  }
  return r;
}

// Include hidden hints, follow-up prompts, widget source and notification text, but
// never mistake machine fields (choice.answer, height, etc.) for prose option numbers.
function stringsIn(value: unknown, out: string[]) {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) if (!['type', 'do', 'tone'].includes(k)) stringsIn(v, out);
}
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/[−–]/g, '-')
    .replace(/\\(?:,|;|!|quad)|\$|\*\*/g, '');
function numbers(s: string) {
  // Recognize equivalent decimal, fraction and scientific notation, including bank LaTeX.
  const n = normalize(s)
    .replace(/\\(?:[dt]?frac)\s*\{(-?[\d.]+)\}\s*\{(-?[\d.]+)\}/g, '$1/$2')
    .replace(/\s*(?:\\times|\\cdot|[×·*])\s*10\s*\^\s*\{?([+-]?\d+)\}?/g, 'e$1');
  return [
    ...n.matchAll(/(?<![\d.])[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?:\s*\/\s*-?\d+(?:\.\d+)?)?(?!\d|\.\d)/gi),
  ]
    .map(([value]) => {
      const [a, b] = value.split('/');
      return Number(a) / (b ? Number(b) : 1);
    })
    .filter(Number.isFinite);
}

export function leaksAnswer(reply: CoachReply, it: Item): boolean {
  const copy: string[] = [reply.summary];
  stringsIn(reply.blocks, copy);
  for (const b of reply.blocks)
    if (b.type === 'plot') {
      copy.push(...b.x.map(String), ...(b.y ?? []).map(String));
      for (const p of b.params ?? []) copy.push(...[p.min, p.max, p.step, p.value].map(String));
    }
  const prose = normalize(copy.join('\n'));
  const finals: string[] = [];
  if (it.format === 'choice' && it.answer !== undefined) {
    const index = it.answer + 1;
    const label = it.optionLabels?.[it.answer];
    const letter = String.fromCharCode(65 + it.answer);
    const ordinal = [String(index), '一二三四五六七八九十'[index - 1], letter, label && normalize(label)]
      .filter((s): s is string => !!s)
      .map(escapeRegex)
      .join('|');
    if (
      copy.some((s) => s.includes(String.fromCodePoint(0x245f + index))) ||
      new RegExp(
        '(?:第|选(?:项|择)?|答案|正解|正确的|option|answer)\\s*(?:应该|应当|应|就)?(?:是|为|is)?\\s*[:：=]?\\s*(?:' +
          ordinal +
          ')(?![a-z\\d])|(?:' +
          ordinal +
          ')\\s*(?:项|号选项|是(?:对的|正确)|is correct)',
        'i',
      ).test(prose) ||
      copy.some((s) =>
        [String(index), letter, label].includes(
          normalize(s)
            .trim()
            .replace(/^[([]|[)\].。!！]+$/g, ''),
        ),
      )
    )
      return true;
    // A bare displayed number, even without "选项", may identify the answer.
    finals.push(String(index));
    const selected = it.options?.[it.answer];
    if (selected) finals.push(selected);
  }
  if (it.blanks) {
    finals.push(...Object.values(it.blanks));
    for (const group of blankGroups(it)) finals.push([...group].map((k) => it.blanks![k] ?? '').join(''));
  }
  for (const part of it.written?.parts ?? []) finals.push(part.final || part.modelAnswer);
  const shown = new Set(numbers(prose));
  return finals.some((raw) => {
    if (numbers(raw).some((n) => shown.has(n))) return true;
    const exact = normalize(raw).trim();
    return exact.length > 1 && !/^[\d.+-]+$/.test(exact) && prose.includes(exact);
  });
}
