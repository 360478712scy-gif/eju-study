// The same bounded schema goes to Codex and validates its untrusted last message.
import { COACH_MAX_BLOCKS, WIDGET_MAX_HTML, type CoachBlock, type CoachMode } from '../shared/coach-ui.ts';

interface Rule {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'null';
  enum?: readonly string[];
  anyOf?: Rule[];
  items?: Rule;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  properties?: Record<string, Rule>;
  additionalProperties?: false;
  required?: string[];
}
const str = (maxLength: number): Rule => ({ type: 'string', minLength: 1, maxLength });
const num: Rule = { type: 'number' };
const int: Rule = { type: 'integer' };
const one = (...values: string[]): Rule => ({ type: 'string', enum: values });
const arr = (items: Rule, minItems: number, maxItems: number): Rule => ({ type: 'array', items, minItems, maxItems });
const obj = (properties: Record<string, Rule>): Rule => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
// Structured outputs requires every property to be required. Null means absent on the wire.
const opt = (rule: Rule): Rule => ({ anyOf: [rule, { type: 'null' }] });
const md = str(4000),
  label = str(120),
  axis = arr(num, 2, 2);
const fields = {
  text: { md },
  hints: { intro: opt(md), hints: arr(obj({ label, md }), 2, 4) },
  question: { md },
  choice: { md, options: arr(str(600), 2, 8), answer: int, feedback: arr(str(1200), 2, 8) },
  steps: { title: opt(label), steps: arr(obj({ title: label, md }), 1, 12) },
  formula: { tex: str(1200), note: opt(md) },
  callout: { tone: one('key', 'trap', 'tip'), md },
  table: { head: arr(label, 1, 8), rows: arr(arr(str(600), 1, 8), 1, 24), caption: opt(label) },
  plot: {
    title: opt(label),
    x: axis,
    y: opt(axis),
    xLabel: opt(label),
    yLabel: opt(label),
    fns: arr(obj({ label, expr: str(200) }), 1, 6),
    params: opt(arr(obj({ name: str(16), label: opt(label), min: num, max: num, step: num, value: num }), 0, 6)),
  },
  widget: { title: label, height: num, html: str(WIDGET_MAX_HTML) },
  actions: {
    items: arr(
      obj({ label, do: one('ask', 'reveal', 'practice', 'note', 'variant'), prompt: opt(str(600)), topic: opt(label) }),
      1,
      5,
    ),
  },
} satisfies Record<CoachBlock['type'], Record<string, Rule>>;
const blocks = Object.fromEntries(
  Object.entries(fields).map(([type, props]) => [type, obj({ type: one(type), ...props })]),
);
export function replySchema(modes: readonly CoachMode[]) {
  return obj({
    mode: one(...modes),
    blocks: arr({ anyOf: Object.values(blocks) }, 1, COACH_MAX_BLOCKS),
    summary: str(240),
  });
}

export function invalid(): never {
  throw new Error('invalid_output');
}
export function decode(rule: Rule, value: unknown): unknown {
  if (rule.anyOf) {
    if (rule.anyOf[1]?.type === 'null') return value == null ? undefined : decode(rule.anyOf[0], value);
    // All alternatives here are block objects with unique type discriminators.
    const type = (value as { type?: unknown } | null)?.type;
    if (typeof type !== 'string' || !Object.hasOwn(blocks, type)) invalid();
    return decode(blocks[type], value);
  }
  switch (rule.type) {
    case 'string':
      if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.length > (rule.maxLength ?? Infinity) ||
        (rule.enum && !rule.enum.includes(value))
      )
        invalid();
      return value.trim();
    case 'integer':
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || (rule.type === 'integer' && !Number.isInteger(value)))
        invalid();
      return value;
    case 'array':
      if (!Array.isArray(value) || value.length < rule.minItems! || value.length > rule.maxItems!) invalid();
      return value.map((entry) => decode(rule.items!, entry));
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
      const data = value as Record<string, unknown>,
        props = rule.properties!;
      if (Object.keys(data).some((key) => !Object.hasOwn(props, key))) invalid();
      const clean: Record<string, unknown> = {};
      for (const [key, spec] of Object.entries(props)) {
        const field = decode(spec, data[key]);
        if (field !== undefined) clean[key] = field;
      }
      return clean;
    }
    default:
      return invalid();
  }
}
