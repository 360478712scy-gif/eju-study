import { zh } from './zh.ts';
import { pending } from './zh.pending.ts';

function merge<A extends Record<string, object>, B extends Record<string, object>>(base: A, extra: B) {
  const result = { ...base, ...extra };
  for (const key of Object.keys(extra) as (keyof B & string)[]) {
    Object.assign(result, { [key]: { ...extra[key], ...base[key] } });
  }
  return result;
}

export const t = merge(zh, pending);
