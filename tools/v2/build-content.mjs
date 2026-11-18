#!/usr/bin/env node
// Merge science and mathematics items, content/notes and the taxonomy into content/dist/bank.json.
// Items failing validation are skipped (and listed) so a broken file never breaks the app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateItem } from './validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.json') ? [path.join(dir, d.name)] : []))
    : [];

const taxonomy = read(path.join(ROOT, 'content/taxonomy.json'));
const items = [];
const skipped = [];
const seen = new Set();
for (const f of walk(path.join(ROOT, 'content/bank')).sort()) {
  let data;
  try {
    data = read(f);
  } catch (e) {
    skipped.push(`${path.relative(ROOT, f)}: invalid JSON`);
    continue;
  }
  for (const it of data.items || []) {
    if (it.subject === 'japanese') continue;
    const errors = [];
    validateItem(it, errors, []);
    if (seen.has(it.id)) errors.push('duplicate id');
    if (errors.length) {
      skipped.push(`${it.id}: ${errors[0]}`);
      continue;
    }
    seen.add(it.id);
    items.push(it);
  }
}

const vocab = [];
const notes = [];
for (const f of walk(path.join(ROOT, 'content/notes')).sort()) for (const n of read(f).notes || []) if (n.topic && n.body) notes.push(n);

// Which mock sections each paper can provide.
const bySession = new Map();
for (const it of items) {
  const s = it.source.session;
  if (!s) continue;
  if (!bySession.has(s)) bySession.set(s, []);
  bySession.get(s).push(it);
}
const papers = [...bySession.entries()]
  .sort((a, b) => b[0].localeCompare(a[0]))
  .map(([session, list]) => {
    const n = (f) => list.filter(f).length;
    const mocks = [];
    if (n((i) => i.subject === 'math') >= 4) mocks.push('math');
    if (n((i) => i.subject === 'physics') + n((i) => i.subject === 'chemistry') >= 30) mocks.push('science');
    const [y, k] = session.split('_');
    return { session, label: `${y}年第${k}回`, mocks };
  });

const bundle = { version: '2', builtAt: new Date().toISOString(), items, vocab, taxonomy, papers, notes };
fs.mkdirSync(path.join(ROOT, 'content/dist'), { recursive: true });
const tmp = path.join(ROOT, 'content/dist/bank.json.tmp');
fs.writeFileSync(tmp, JSON.stringify(bundle));
fs.renameSync(tmp, path.join(ROOT, 'content/dist/bank.json'));
const count = (s) => items.filter((i) => i.subject === s).length;
console.log(`bank.json: ${items.length} items (math ${count('math')}, physics ${count('physics')}, chemistry ${count('chemistry')}, japanese ${count('japanese')}), vocab ${vocab.length}, notes ${notes.length}, papers ${papers.length}`);
if (skipped.length) {
  console.log(`skipped ${skipped.length}:`);
  for (const s of skipped.slice(0, 30)) console.log('  ' + s);
}
