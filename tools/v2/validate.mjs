#!/usr/bin/env node
// Validate bank files against content/AUTHORING.md.
// usage: node tools/v2/validate.mjs [file-or-dir ...]   (default: content/bank)
// Exit code 1 when any error is found. Warnings do not fail.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import katex from 'katex';
import 'katex/contrib/mhchem';
import { collectMath, KATEX_MACROS } from '../../shared/markup.ts';
import { blankGroups } from '../../shared/grading.ts';

// KaTeX logs a metrics warning for circled digits (①…) inside math; they still render.
const _warn = console.warn;
console.warn = (...a) => {
  if (typeof a[0] === 'string' && a[0].startsWith('No character metrics')) return;
  _warn(...a);
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const taxonomy = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/taxonomy.json'), 'utf8'));
const TOPICS = new Set();
for (const s of Object.values(taxonomy.subjects)) for (const u of s.units) for (const t of u.topics) TOPICS.add(t.id);

const SUBJECT_PREFIX = { math: 'math.', physics: 'phys.', chemistry: 'chem.', japanese: 'ja.' };

function listFiles(target) {
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(target, d.name);
    if (d.isDirectory()) return listFiles(p);
    return d.name.endsWith('.json') ? [p] : [];
  });
}

function checkTex(tex, display, where, errors) {
  try {
    katex.renderToString(tex, { throwOnError: true, displayMode: display, macros: { ...KATEX_MACROS }, strict: 'ignore' });
  } catch (e) {
    errors.push(`${where}: KaTeX error in $${tex}$ → ${String(e.message).split('\n')[0]}`);
  }
}

function checkMarkup(text, where, errors) {
  if (typeof text !== 'string') return;
  for (const m of collectMath(text)) checkTex(m.tex, m.display, where, errors);
  const stray = text.replace(/\\\$/g, '').split('$').length - 1;
  if (stray % 2 === 1) errors.push(`${where}: odd number of $ signs (unclosed math?)`);
}

function assetExists(src) {
  if (typeof src !== 'string' || !src.startsWith('/assets/')) return false;
  return fs.existsSync(path.join(ROOT, 'public', src));
}

export function validateItem(it, errors, warnings) {
  const w = `[${it.id ?? '?'}]`;
  const need = (cond, msg) => {
    if (!cond) errors.push(`${w} ${msg}`);
  };
  need(typeof it.id === 'string' && /^[0-9a-z_]+(-[0-9A-Za-z_.]+)+$/.test(it.id), 'id missing or malformed');
  need(['math', 'physics', 'chemistry', 'japanese'].includes(it.subject), 'bad subject');
  need(typeof it.topic === 'string' && TOPICS.has(it.topic), `topic "${it.topic}" not in taxonomy`);
  if (it.topic && SUBJECT_PREFIX[it.subject]) need(it.topic.startsWith(SUBJECT_PREFIX[it.subject]), 'topic does not belong to subject');
  for (const t of it.tags || []) need(TOPICS.has(t), `tag "${t}" not in taxonomy`);
  need([1, 2, 3].includes(it.difficulty), 'difficulty must be 1, 2 or 3');
  need(typeof it.targetSec === 'number' && it.targetSec >= 20 && it.targetSec <= 2400, 'targetSec out of range');
  need(it.source && ['official', 'original'].includes(it.source.kind) && typeof it.source.label === 'string', 'source missing');
  need(typeof it.stem === 'string' && it.stem.trim().length > 0, 'stem empty');
  checkMarkup(it.stem, `${w} stem`, errors);
  if (it.subject === 'japanese') {
    need(['reading', 'listening-reading', 'listening'].includes(it.section), 'japanese item needs section');
  } else if (!it.stemZh) {
    warnings.push(`${w} stemZh missing`);
  }
  if (it.stemZh) checkMarkup(it.stemZh, `${w} stemZh`, errors);
  for (const f of it.figures || []) need(assetExists(f.src), `figure missing: ${f.src}`);
  if (it.audio) need(assetExists(it.audio.src), `audio missing: ${it.audio.src}`);
  if (it.section === 'listening' || it.section === 'listening-reading') need(!!it.audio, 'listening item needs audio');
  if (it.section === 'listening') need(typeof it.transcript === 'string' && it.transcript.length > 20, 'listening item needs transcript');
  if (it.transcript) checkMarkup(it.transcript, `${w} transcript`, errors);

  if (it.format === 'choice') {
    need(Array.isArray(it.options) && it.options.length >= 2 && it.options.length <= 10, 'choice needs 2–10 options');
    need(Number.isInteger(it.answer) && it.answer >= 0 && it.answer < (it.options?.length ?? 0), 'answer index out of range');
    if (it.optionLabels) need(it.optionLabels.length === it.options?.length, 'optionLabels length ≠ options length');
    (it.options || []).forEach((o, i) => {
      need(typeof o === 'string' && o.trim().length > 0, `option ${i + 1} empty`);
      checkMarkup(o, `${w} option ${i + 1}`, errors);
    });
    need(!it.blanks, 'choice item must not have blanks');
    if ((it.options || []).some((o) => /原题选项|音频中的选项/.test(o))) errors.push(`${w} placeholder option text`);
  } else if (it.format === 'blanks') {
    const blanks = it.blanks || {};
    const letters = new Set(Object.keys(blanks));
    const groups = blankGroups(it);
    const inStem = new Set(groups.join('').split(''));
    need(groups.length > 0, 'blanks item has no \\bx{} boxes in stem');
    for (const l of inStem) need(letters.has(l), `box letter ${l} has no answer in blanks`);
    for (const l of letters) need(inStem.has(l), `blanks letter ${l} not used in any \\bx{} box`);
    for (const [k, v] of Object.entries(blanks)) {
      need(/^[A-Z]$/.test(k), `blanks key "${k}" must be one capital letter`);
      need(typeof v === 'string' && /^[0-9-]$/.test(v), `blanks ${k}="${v}" must be one digit or "-"`);
    }
    const seenLetters = new Set();
    for (const g of groups) for (const l of g) {
      if (seenLetters.has(l)) errors.push(`${w} letter ${l} appears in two different box groups`);
      seenLetters.add(l);
    }
    need(it.options === undefined && it.answer === undefined, 'blanks item must not have options/answer');
  } else {
    errors.push(`${w} format must be choice or blanks`);
  }

  const ex = it.explanation;
  need(ex && typeof ex.zh === 'string' && ex.zh.trim().length >= 40, 'explanation.zh missing or too short');
  if (ex) {
    checkMarkup(ex.zh, `${w} explanation.zh`, errors);
    for (const k of ['keyPoints', 'traps']) {
      if (ex[k] !== undefined) need(Array.isArray(ex[k]) && ex[k].every((s) => typeof s === 'string'), `explanation.${k} must be string[]`);
      for (const s of ex[k] || []) checkMarkup(s, `${w} explanation.${k}`, errors);
    }
    if (ex.shortcut) checkMarkup(ex.shortcut, `${w} explanation.shortcut`, errors);
    if (ex.terms !== undefined) {
      need(Array.isArray(ex.terms), 'explanation.terms must be an array');
      for (const t of ex.terms || []) need(t && typeof t.ja === 'string' && typeof t.zh === 'string', 'term needs ja and zh');
    }
    if (!ex.keyPoints || ex.keyPoints.length === 0) warnings.push(`${w} no keyPoints`);
  }
  need(it.verified && ['verified', 'disputed', 'unverified'].includes(it.verified.status), 'verified.status missing');
}

function main() {
  const targets = process.argv.slice(2);
  const files = (targets.length ? targets : [path.join(ROOT, 'content/bank')]).flatMap((t) => listFiles(path.resolve(t)));
  const errors = [];
  const warnings = [];
  const ids = new Map();
  let count = 0;
  for (const f of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      errors.push(`${f}: invalid JSON (${e.message})`);
      continue;
    }
    if (data && Array.isArray(data.notes)) {
      for (const n of data.notes) {
        count++;
        const w = `[note ${n.topic}]`;
        if (!TOPICS.has(n.topic)) errors.push(`${w} topic not in taxonomy`);
        if (typeof n.body !== 'string' || n.body.length < 150) errors.push(`${w} body missing or too short`);
        checkMarkup(n.body, `${w} body`, errors);
        for (const t of n.terms || []) if (!t.ja || !t.zh) errors.push(`${w} term needs ja and zh`);
      }
      continue;
    }
    if (data && Array.isArray(data.entries)) {
      const kana = /^[\u3041-\u309f\u30a0-\u30ffー・ ]+$/;
      for (const v of data.entries) {
        count++;
        const w = `[vocab ${v.id}]`;
        if (ids.has('v:' + v.id)) errors.push(`${w} duplicate id in vocab (also in ${ids.get('v:' + v.id)})`);
        ids.set('v:' + v.id, path.relative(ROOT, f));
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/i.test(v.id || '')) errors.push(`${w} bad id`);
        if (!v.word || !v.reading || !v.meaningZh) errors.push(`${w} needs word, reading, meaningZh`);
        if (v.reading && !kana.test(v.reading)) errors.push(`${w} reading must be kana only: ${v.reading}`);
        for (const a of v.altReadings || []) if (!kana.test(a)) errors.push(`${w} altReading must be kana: ${a}`);
        if (!['science', 'math', 'general', 'reading'].includes(v.category)) errors.push(`${w} bad category`);
        if (v.audio?.word && !assetExists(v.audio.word)) errors.push(`${w} audio missing`);
      }
      continue;
    }
    if (!data || !Array.isArray(data.items)) {
      errors.push(`${f}: expected {"title":..., "items":[...]} or {"notes":[...]} or {"entries":[...]}`);
      continue;
    }
    for (const it of data.items) {
      count++;
      if (ids.has(it.id)) errors.push(`[${it.id}] duplicate id (also in ${ids.get(it.id)})`);
      ids.set(it.id, path.relative(ROOT, f));
      validateItem(it, errors, warnings);
    }
  }
  for (const w of warnings) console.log('warn  ' + w);
  for (const e of errors) console.log('ERROR ' + e);
  console.log(`\n${count} items in ${files.length} file(s): ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
