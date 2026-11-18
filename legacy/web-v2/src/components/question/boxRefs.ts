// Stem pre-processing for the player: answer boxes that are only *named* in the instructions, and
// the （　　） blank of grammar items. Both are encoded as \bx labels the markup parser accepts
// ([A-Z0-9]+) but that can never be real answer boxes (those are letters only).

/** "\bx{C} 〜 \bx{G}" in an instruction names a range of boxes; it is not two boxes to fill. */
const RANGE = /\\bx\{([A-Z]+)\}(\s*[〜～~]\s*)\\bx\{([A-Z]+)\}/g;
/** Prefix of an encoded range-reference label ("0C"). */
const REF_PREFIX = '0';
/** Label of the grammar blank slot. */
export const SLOT_LABEL = '00';
/** The grammar blank: full-width parentheses around ideographic spaces. */
const SLOT = /（[　 ]{1,6}）/;

/** Mark range references so the renderer draws them as static label chips. */
export function markRangeRefs(text: string): string {
  return text.replace(RANGE, (_m, a: string, sep: string, b: string) => `\\bx{${REF_PREFIX}${a}}${sep}\\bx{${REF_PREFIX}${b}}`);
}

/** The real box label of an encoded range reference, or null for an ordinary box. */
export function rangeRefLabel(label: string): string | null {
  return label.length > 1 && label.startsWith(REF_PREFIX) && /^[A-Z]+$/.test(label.slice(1)) ? label.slice(1) : null;
}

/** Replace the first （　　） blank with the slot marker (later ones, e.g. in the question line, stay text). */
export function markSlot(text: string): string {
  return SLOT.test(text) ? text.replace(SLOT, `\\bx{${SLOT_LABEL}}`) : text;
}

export function hasSlot(text: string): boolean {
  return SLOT.test(text);
}
