// Kana helpers for the reading drill: romaji → hiragana (for learners typing without a
// Japanese IME) and "almost right" hints for the typical slips (濁点, っ, ゃゅょ, 長音).
import { normalizeKana } from '@shared/grading.ts';

const TABLE: Record<string, string> = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
  za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  la: 'ら', li: 'り', lu: 'る', le: 'れ', lo: 'ろ',
  wa: 'わ', wo: 'を', wi: 'うぃ', we: 'うぇ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
  xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtu: 'っ', xtsu: 'っ', xwa: 'ゎ',
};

// Contracted sounds: きゃ, しゅ, ちょ …
const YOON: [string, string][] = [
  ['ky', 'き'], ['gy', 'ぎ'], ['sy', 'し'], ['sh', 'し'], ['zy', 'じ'], ['jy', 'じ'], ['j', 'じ'],
  ['ty', 'ち'], ['cy', 'ち'], ['ch', 'ち'], ['dy', 'ぢ'], ['ny', 'に'], ['hy', 'ひ'], ['by', 'び'],
  ['py', 'ぴ'], ['my', 'み'], ['ry', 'り'], ['ly', 'り'],
];
for (const [p, k] of YOON) {
  TABLE[p + 'a'] = k + 'ゃ';
  TABLE[p + 'u'] = k + 'ゅ';
  TABLE[p + 'o'] = k + 'ょ';
  if (p === 'sh' || p === 'ch' || p === 'j') TABLE[p + 'e'] = k + 'ぇ';
}

const VOWELS = 'aeiou';

export function hasRomaji(s: string): boolean {
  return /[a-z]/i.test(s);
}

/**
 * IME-style conversion of a complete romaji string. Non-latin characters pass through.
 * "nn" before a vowel is ambiguous (konnichi → こんにち, kinnitsu → きんいつ in a strict IME);
 * `strictNN` always reads "nn" as ん.
 */
export function romajiToKana(input: string, strictNN = false): string {
  const s = input.toLowerCase().normalize('NFKC');
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1] ?? '';
    if (c === '-') {
      out += 'ー';
      i++;
      continue;
    }
    if (c === "'") {
      i++;
      continue;
    }
    if (!/[a-z]/.test(c)) {
      out += c;
      i++;
      continue;
    }
    if (c === 'n') {
      if (next === 'n') {
        // "nna" → んな, "nn" at a syllable end → ん
        const after = s[i + 2] ?? '';
        out += 'ん';
        i += !strictNN && after && (VOWELS.includes(after) || after === 'y') ? 1 : 2;
        continue;
      }
      if (!next || (!VOWELS.includes(next) && next !== 'y')) {
        out += 'ん';
        i++;
        continue;
      }
    }
    // Doubled consonant → っ (also "tch")
    if (!VOWELS.includes(c) && c !== 'n' && (c === next || (c === 't' && next === 'c' && s[i + 2] === 'h'))) {
      out += 'っ';
      i++;
      continue;
    }
    let matched = false;
    for (let len = 4; len >= 1; len--) {
      const k = TABLE[s.slice(i, i + len)];
      if (k) {
        out += k;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += c;
      i++;
    }
  }
  return out;
}

/** What the learner's answer means as kana (romaji converted). */
export function answerKana(raw: string): string {
  const t = raw.trim();
  return hasRomaji(t) ? romajiToKana(t) : t;
}

/** Every reasonable kana reading of the answer (romaji "nn" can mean ん or ん+な行). */
export function answerCandidates(raw: string): string[] {
  const t = raw.trim();
  if (!hasRomaji(t)) return [t];
  return [...new Set([romajiToKana(t), romajiToKana(t, true)])];
}

const DAKUTEN = /[゙゚]/g;
const stripDakuten = (s: string) => s.normalize('NFD').replace(DAKUTEN, '').normalize('NFC');
const stripSokuon = (s: string) => s.replace(/っ/g, '');
const bigYoon = (s: string) => s.replace(/[ゃゅょ]/g, (c) => ({ ゃ: 'や', ゅ: 'ゆ', ょ: 'よ' })[c] ?? c);
const stripLong = (s: string) =>
  s
    .replace(/ー/g, '')
    .replace(/([おこごそぞとどのほぼぽもよょろをくぐすずつづぬふぶぷむゆゅるう])う/g, '$1')
    .replace(/([えけげせぜてでねへべぺめれ])い/g, '$1');

/** A short hint when the answer is wrong only in a typical detail, else null. */
export function nearMissHint(given: string, reading: string, alts: string[] = []): string | null {
  const g = normalizeKana(given);
  if (!g) return null;
  for (const r of [reading, ...alts]) {
    const a = normalizeKana(r);
    if (stripDakuten(g) === stripDakuten(a)) return '差一点：注意浊音 / 半浊音（゛゜）';
    if (stripSokuon(g) === stripSokuon(a)) return '差一点：注意促音「っ」';
    if (bigYoon(g) === bigYoon(a)) return '差一点：注意拗音的小字（ゃ ゅ ょ）';
    if (stripLong(g) === stripLong(a)) return '差一点：注意长音（う・い）';
    const all = (s: string) => stripLong(bigYoon(stripSokuon(stripDakuten(s))));
    if (all(g) === all(a)) return '很接近：长音、促音、浊音这些细节再看一眼';
  }
  return null;
}
