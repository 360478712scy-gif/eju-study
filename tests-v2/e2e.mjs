#!/usr/bin/env node
// End-to-end test of the daily flow (real server + built web app + system Chrome).
//
//   node tests-v2/e2e.mjs                   builds the web app into a temp dir, then runs
//   E2E_DIST=<dir>   reuse an existing web build
//   E2E_BANK=<file>  serve this content bundle instead of content/dist/bank.json
//   E2E_DAY1=<date>  first study day to simulate (default: today while ≥12 days before the exam, else 2026-10-20)
//   E2E_TMP=<dir>  E2E_PORT=18829  E2E_HEADFUL=1  E2E_KEEP=1 (keep temp dir)  E2E_SHOTS=1 (milestone screenshots)
//   E2E_FAST=1       skip the one-minute wait that checks timing and the "slow but correct" flag
//
// The server runs on its own port with a temp data dir seeded from a COPY of data/state.json
// (the learner's v1.4 record), so it starts like a first launch:
//   day 1   onboarding (one target changed, 7 h) → Today's plan fits the budget → one block of every
//           kind from Today: 考点速测 (slow-but-right flag), science drill (right/wrong/没把握/猜的/
//           不会/double-click, E, Enter), resume a left block, timed science set (exam mode, 答题卡,
//           交卷) and one that runs out of time (fast-forwarded clock), math mark sheet (keyboard,
//           partial credit, redo with locked groups), reading, listening (audio plays, options hidden),
//           文型, vocab (#/vocab?start=1) → Today reflects it → 预测 agrees across pages → skip/restore →
//           调整时长 → 重新生成 → reload → server restart → leave a block half-done
//   later   the browser clock moves on: 04:00 rollover with the app open, mistakes due after 2 days and
//           cleared after 4 more, yesterday's half-done block, a padded Japanese mock, the final days
//           (no new words, 考前一页纸, 考点速记), all blocks resolved → 加练
// The real data/ folder is never written. Prints PASS/FAIL per step (WARN for non-fatal UX issues)
// and exits 1 on any failure; the browser console must stay free of errors.
import { chromium } from '~/Projects/eju-study/node_modules/playwright/index.mjs';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { studyDate, addDays, daysBetween } from '../shared/dates.ts';
import { indexBank, mockItems } from '../shared/bank.ts';
import { budgetFor, daysLeftOn, phaseFor, JA_FULL, mockLimitFor, vocabNewLimit, vocabSkills } from '../shared/planner.ts';
import { blankGroups } from '../shared/grading.ts';
import { lockedGroups, vocabQueue } from '../shared/actions.ts';
import { isDue, MISTAKE_INTERVALS, SLOW_FACTOR } from '../shared/srs.ts';
import { estimateAll, totalEstimate } from '../shared/stats.ts';
import { fmtDateShort, fmtMinutes, pct } from '../web/src/lib/format.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_PORT || 18829);
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = process.env.E2E_TMP ? path.resolve(process.env.E2E_TMP) : fs.mkdtempSync(path.join(os.tmpdir(), 'eju-e2e-'));
const DATA = path.join(TMP, 'data');
const SHOTS = path.join(TMP, 'shots');
const V1_SOURCE = path.join(ROOT, 'data', 'state.json');
const BANK_FILE = path.join(TMP, 'bank.json');
const T = { short: 6000, long: 15000 };
const FAST = !!process.env.E2E_FAST;

// ─────────────────────────── tiny harness ───────────────────────────

const results = [];
let failed = 0;
let page;
let context;
let dayLabel = '';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function step(name, fn, { critical = false } = {}) {
  const t0 = Date.now();
  const full = dayLabel ? `[${dayLabel}] ${name}` : name;
  try {
    const note = await fn();
    results.push({ name: full, ok: true });
    console.log(`PASS  ${full}${note ? ` — ${note}` : ''}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    return true;
  } catch (e) {
    failed++;
    results.push({ name: full, ok: false });
    const file = path.join(SHOTS, `${String(results.length).padStart(2, '0')}-${full.replace(/[^\w一-鿿-]+/g, '_').slice(0, 60)}.png`);
    try {
      if (page) await page.screenshot({ path: file, fullPage: false });
    } catch {
      /* page may be gone */
    }
    console.log(`FAIL  ${full}\n      ${String(e && e.message ? e.message : e).split('\n').slice(0, 12).join('\n      ')}\n      screenshot: ${file}`);
    if (critical) throw new Error(`critical step failed: ${full}`);
    // Back to Today so the next step starts from a known place.
    try {
      if (page && server) {
        await page.goto(`${BASE}/?recover=${Date.now()}`, { waitUntil: 'networkidle' });
        await page.locator('.td-plan').waitFor({ timeout: T.long });
      }
    } catch {
      /* the next step will report its own failure */
    }
    return false;
  }
}

const warnings = [];
/** Non-fatal finding (a UX issue the flow can work around). */
function warn(msg) {
  const full = dayLabel ? `[${dayLabel}] ${msg}` : msg;
  if (warnings.includes(full)) return;
  warnings.push(full);
  console.log(`WARN  ${full}`);
}

function skip(name, why) {
  const full = dayLabel ? `[${dayLabel}] ${name}` : name;
  results.push({ name: full, ok: true, skipped: true });
  console.log(`SKIP  ${full} — ${why}`);
}

async function poll(fn, msg, timeout = T.short, every = 100) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    if (Date.now() > end) throw new Error(`timed out: ${msg}${last instanceof Error ? ` (${last.message})` : ''}`);
    await new Promise((r) => setTimeout(r, every));
  }
}

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const clone = (x) => JSON.parse(JSON.stringify(x));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─────────────────────────── server ───────────────────────────

let server = null;
let serverLog = '';

async function health() {
  try {
    const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch {
    return false;
  }
}

async function startServer(dist) {
  server = spawn(process.execPath, ['server-v2.mjs'], {
    cwd: ROOT,
    env: { ...process.env, EJU_DATA_DIR: DATA, EJU_WEB_DIST: dist, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => (serverLog += d));
  server.stderr.on('data', (d) => (serverLog += d));
  await poll(health, `server on :${PORT} (log: ${serverLog.trim()})`, 10000, 150);
}

async function stopServer() {
  if (!server) return;
  const s = server;
  server = null;
  if (s.exitCode !== null) return;
  await new Promise((resolve) => {
    s.once('exit', resolve);
    s.kill('SIGTERM');
    setTimeout(() => {
      try {
        s.kill('SIGKILL');
      } catch {
        /* gone */
      }
    }, 3000);
  });
}

async function getState() {
  const r = await fetch(`${BASE}/api/state`);
  assert(r.ok, `GET /api/state → ${r.status}`);
  return (await r.json()).state;
}

/** Poll the saved state until `pred` holds (the client saves with a short debounce). */
async function waitState(pred, msg, timeout = T.short) {
  let last;
  await poll(
    async () => {
      last = await getState();
      return pred(last);
    },
    msg,
    timeout,
    150,
  );
  return last;
}

// ─────────────────────────── browser ───────────────────────────

let browser;
const consoleErrors = [];
const httpErrors = [];
const consoleWarnings = [];

/**
 * A fresh browser context whose clock starts at 10:00 on `date` and then runs in real time, as if
 * the learner opened the app that morning. Every context gets the same content bundle snapshot.
 */
async function openDay(when) {
  if (context) {
    await page.waitForTimeout(700); // let the last debounced save land
    await context.close();
  }
  const date = when.slice(0, 10);
  dayLabel = date;
  context = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
  await context.clock.install({ time: new Date(when.length > 10 ? when : `${date}T10:00:00`) });
  await context.route('**/content/bank.json', (r) => r.fulfill({ path: BANK_FILE, contentType: 'application/json' }));
  // Record every media play() so the listening step can check the clip really plays.
  await context.addInitScript(() => {
    const w = window;
    w.__plays = [];
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const rec = { src: this.currentSrc || this.src, el: this, ok: false, err: null };
      w.__plays.push(rec);
      const p = orig.call(this);
      p.then(
        () => (rec.ok = true),
        (e) => (rec.err = String(e)),
      );
      return p;
    };
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  const tag = date;
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${tag}] console.error: ${m.text()}`);
    else if (m.type() === 'warning') consoleWarnings.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(BASE)) httpErrors.push(`[${tag}] ${r.status()} ${r.request().method()} ${r.url().slice(BASE.length)}`);
  });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
}

// ─────────────────────────── page helpers ───────────────────────────

async function text(sel) {
  return (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
}

async function waitText(sel, re, timeout = T.short) {
  const loc = page.locator(sel).filter({ hasText: re }).first();
  await loc.waitFor({ state: 'visible', timeout });
  return loc;
}

let snapN = 0;
async function snap(name) {
  if (!process.env.E2E_SHOTS) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, `m${String(++snapN).padStart(2, '0')}-${name}.png`) });
}

async function key(k) {
  await page.keyboard.press(k);
}

async function confirmModal(title, okLabel) {
  const modal = page.locator('.modal').filter({ hasText: title });
  await modal.waitFor({ state: 'visible', timeout: T.short });
  await modal.locator('.modal-foot').getByRole('button', { name: okLabel, exact: true }).click();
  await modal.waitFor({ state: 'detached', timeout: T.short });
}

async function toastSeen(re) {
  await page.locator('.toast').filter({ hasText: re }).first().waitFor({ state: 'visible', timeout: T.short });
}

function sessionIdFromUrl() {
  const m = /#\/session\/([^?/]+)/.exec(page.url());
  return m ? decodeURIComponent(m[1]) : null;
}

/** Click "开始" (or another label) on the i-th plan row of Today. */
async function startRow(i, label = '开始') {
  const row = page.locator('.td-row').nth(i);
  await row.getByRole('button', { name: label, exact: true }).click();
}

async function waitPlayer() {
  await page.waitForURL(/#\/session\//, { timeout: T.short });
  await page.locator('.pl-count').waitFor({ state: 'visible', timeout: T.short });
  return sessionIdFromUrl();
}

async function atItem(i, n) {
  await waitText('.pl-count', new RegExp(`第\\s*${i + 1}\\s*/\\s*${n}\\s*题`));
}

async function choose(i) {
  if (i < 9) await key(String(i + 1));
  else await page.locator('.pl-opt').nth(i).click();
  await page.locator('.pl-opt.is-chosen').first().waitFor({ timeout: T.short });
}

async function submitAndWaitResult() {
  await key('Enter');
  await page.locator('.pl-res').waitFor({ state: 'visible', timeout: T.short });
  return text('.pl-res');
}

async function finishEarly() {
  await page.locator('.pl-top').getByRole('button', { name: '结束' }).click();
  await confirmModal('结束这一组', '结束');
  await page.locator('.pl-fin').waitFor({ state: 'visible', timeout: T.short });
}

async function backToToday() {
  await page.locator('.pl-fin-cta').getByRole('button', { name: '下一项任务' }).click();
  await page.locator('.td-plan').waitFor({ state: 'visible', timeout: T.short });
}

async function gotoToday() {
  await page.locator('.sidebar a', { hasText: '今日' }).first().click();
  await page.locator('.td-plan').waitFor({ state: 'visible', timeout: T.short });
}

async function exitPlayer() {
  await page.locator('.pl-top').getByRole('button', { name: '退出（进度会保存）' }).click();
  await page.locator('.td-plan').waitFor({ state: 'visible', timeout: T.short });
}

function HMtext(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h > 0 ? `${h}小时` : ''}${r > 0 || h === 0 ? `${r}分` : ''}`;
}

/** "14:10" / "1:02:03" → seconds. */
function clockSecs(s) {
  return s
    .trim()
    .split(':')
    .map(Number)
    .reduce((a, b) => a * 60 + b, 0);
}

const wrongOf = (it) => (it.answer + 1) % it.options.length;

// ─────────────────────────── main ───────────────────────────

const ctx = {}; // values handed from step to step

async function main() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });

  const realToday = studyDate();
  const EXAM = '2026-11-08';
  const DAY1 = process.env.E2E_DAY1 || (daysBetween(realToday, EXAM) >= 12 ? realToday : '2026-10-20');
  const today = DAY1;
  console.log(`e2e: ${BASE}  temp ${TMP}  simulated day 1 ${DAY1} (real study date ${realToday})`);

  if (await health()) throw new Error(`port ${PORT} is already in use — stop that server or set E2E_PORT`);

  let dist = process.env.E2E_DIST ? path.resolve(process.env.E2E_DIST) : '';
  if (!dist) {
    dist = path.join(TMP, 'dist');
    const vite = path.join(ROOT, 'node_modules', '.bin', 'vite');
    const r = spawnSync(vite, ['build', '--config', 'web/vite.config.ts', '--outDir', dist, '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`web build failed:\n${r.stdout}\n${r.stderr}`);
  }
  assert(fs.existsSync(path.join(dist, 'index.html')), `no index.html in ${dist}`);

  // One snapshot of the content bundle for the whole run (the browser is served this copy).
  const bankSrc = process.env.E2E_BANK ? path.resolve(process.env.E2E_BANK) : path.join(ROOT, 'content', 'dist', 'bank.json');
  assert(fs.existsSync(bankSrc), `${bankSrc} missing — run npm run build:content`);
  fs.copyFileSync(bankSrc, BANK_FILE);
  const bankJson = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));
  const bank = indexBank(bankJson);
  const byId = bank.byId;
  const vocabByWord = new Map(bankJson.vocab.map((v) => [v.word, v]));
  console.log(`bank: ${bankJson.items.length} items (${bankJson.items.filter((i) => i.id.startsWith('recall-')).length} recall), ${bankJson.vocab.length} words, built ${bankJson.builtAt}`);

  // First launch: a copy of the v1.4 record in an empty data dir; the server migrates it.
  const v1Copy = path.join(DATA, 'state.json');
  const hasV1 = fs.existsSync(V1_SOURCE);
  if (hasV1) fs.copyFileSync(V1_SOURCE, v1Copy);
  const v1Hash = hasV1 ? sha(v1Copy) : null;

  await startServer(dist);
  browser = await chromium.launch({ channel: 'chrome', headless: !process.env.E2E_HEADFUL });

  // ── 1. Migration on first start ──
  await step(
    'server imports the v1.4 record on first start',
    async () => {
      const st = await getState();
      eq(st.version, 2, 'state version');
      eq(st.profile.onboarded, false, 'profile.onboarded before onboarding');
      eq(st.profile.examDate, EXAM, 'exam date (the simulated days are counted from it)');
      assert(fs.existsSync(path.join(DATA, 'state-v2.json')), 'state-v2.json not written');
      if (hasV1) eq(sha(v1Copy), v1Hash, 'v1 state.json must stay untouched');
      const r = await fetch(`${BASE}/content/bank.json`);
      assert(r.ok && /json/.test(r.headers.get('content-type') || ''), `server /content/bank.json → ${r.status}`);
      ctx.targets = clone(st.profile.targets);
      ctx.vocabAttempts0 = st.vocabAttempts.length;
      return hasV1 ? `${st.attempts.length} attempts, ${st.vocabAttempts.length} vocab attempts kept` : 'no v1 record, fresh start';
    },
    { critical: true },
  );

  await openDay(DAY1);

  // ── 2. Onboarding ──
  await step(
    'onboarding: change the math target, choose 7 h, start',
    async () => {
      await waitText('.ob-title', /先确认起点和目标/);
      const mathTarget = page.locator('.ob-row').filter({ hasText: '数学' }).locator('.ob-input').nth(1);
      const oldTotal = Object.values(ctx.targets).reduce((a, b) => a + b, 0);
      ctx.mathTarget = Math.min(200, ctx.targets.math + 5);
      ctx.targetTotal = oldTotal - ctx.targets.math + ctx.mathTarget;

      // Out-of-range input blocks the next step.
      await mathTarget.fill('999');
      await page.locator('.ob-error').waitFor({ state: 'visible', timeout: T.short });
      assert(await page.getByRole('button', { name: '下一步' }).isDisabled(), '下一步 should be disabled for 999');

      await mathTarget.fill(String(ctx.mathTarget));
      await waitText('.ob-total-target', new RegExp(`^${ctx.targetTotal}$`));
      await waitText('.ob-count-sub', new RegExp(`目标 ${ctx.targetTotal} 分`));
      await snap('onboarding-scores');
      await page.getByRole('button', { name: '下一步' }).click();

      await waitText('.ob-title', /每天学多久/);
      const seven = page.locator('.ob-hour').filter({ has: page.locator('.ob-hour-num', { hasText: /^7$/ }) });
      await seven.click();
      eq(await seven.getAttribute('aria-checked'), 'true', '7 h radio checked');
      // "到考试前总计" follows the planner's budgets (with the taper before the exam).
      const st = await getState();
      const p = { ...st, profile: { ...st.profile, dailyMinutes: 420 } };
      let total = 0;
      for (let d = today; d < st.profile.examDate; d = addDays(d, 1)) total += budgetFor(p, d);
      await waitText('.ob-sum-item .num', new RegExp(`^${Math.round(total / 60)}$`));
      await snap('onboarding-hours');

      await page.getByRole('button', { name: '开始冲刺' }).click();
      await page.locator('.td-plan').waitFor({ state: 'visible', timeout: T.long });
      const saved = await waitState(
        (s) => s.profile.onboarded && s.profile.dailyMinutes === 420 && s.profile.targets.math === ctx.mathTarget && s.plans[today]?.budgetMinutes === budgetFor(s, today),
        'onboarding saved (onboarded, 420 min, new math target, plan)',
      );
      eq(saved.profile.targetTotal, ctx.targetTotal, 'targetTotal');
      eq(saved.profile.startDate, today, 'startDate');
      return `target ${ctx.targetTotal}, ${Math.round(total / 60)} h until the exam`;
    },
    { critical: true },
  );

  // ── 3. Today's plan fits the budget ──
  await step(
    "Today: a plan whose minutes match the 7 h budget",
    async () => {
      const st = await getState();
      const plan = st.plans[today];
      const budget = budgetFor(st, today);
      eq(plan.budgetMinutes, budget, 'plan.budgetMinutes');
      eq(plan.phase, phaseFor(daysLeftOn(st, today)), 'plan.phase');
      if (daysLeftOn(st, today) > 3) eq(budget, 420, 'budget for a normal day');
      const sum = plan.blocks.reduce((s, b) => s + b.minutes, 0);
      assert(Math.abs(sum - budget) <= 15, `planned ${sum} min vs budget ${budget} min`);
      await waitText('.td-plan-sub', new RegExp(`${plan.blocks.length} 块 · 约 ${fmtMinutes(sum)} · 已完成 0`));
      await waitText('.td-pg-budget', new RegExp(`计划 ${fmtMinutes(budget)}`));
      eq(await page.locator('.td-row').count(), plan.blocks.length, 'rows on Today');
      eq(await text('.td-hero-title'), plan.blocks[0].title, 'hero shows the first block');
      await waitText('.td-mini', new RegExp(`0/${plan.blocks.length}`));
      // Every row shows its planned minutes and the count of questions/words.
      for (const [i, b] of plan.blocks.entries()) {
        const meta = await page.locator('.td-row').nth(i).locator('.td-row-meta').innerText();
        assert(meta.includes(fmtMinutes(b.minutes)), `row ${i + 1} minutes: "${meta}"`);
        if (b.itemIds.length) assert(meta.includes(`${b.itemIds.length} 题`), `row ${i + 1} count: "${meta}"`);
      }
      ctx.plan = plan;
      await snap('today-start');
      const kinds = plan.blocks.map((b) => `${b.kind}${b.timed ? '(限时)' : ''}:${b.subject}`);
      return `${plan.blocks.length} blocks, ${sum}/${budget} min: ${kinds.join(', ')}`;
    },
    { critical: true },
  );

  const blocks = ctx.plan.blocks;
  const idxOf = (f) => blocks.findIndex(f);
  const expect = { done: 0, answered: 0 };
  const isRecall = (b) => b.title.includes('考点速测');
  const isGrammar = (b) => b.title.includes('文型');
  const isSci = (b) => b.subject === 'physics' || b.subject === 'chemistry';
  // One real-time wait checks the item clock and the "slow but correct" flag (1.8 × target).
  let slowDone = false;

  /** Answer the current item slowly (real time) and right; checks seconds, banner and progress.slow. */
  async function slowRight(sid, it) {
    const linger = Math.ceil(SLOW_FACTOR * it.targetSec) + 3;
    await page.waitForTimeout(linger * 1000);
    await choose(it.answer);
    const r = await submitAndWaitResult();
    assert(/回答正确/.test(r), `expected 回答正确, got "${r}"`);
    assert(/用时偏长/.test(r), `slow right answer: expected the 用时偏长 note, got "${r}"`);
    const st = await waitState((s) => s.sessions[sid].answers[it.id]?.submitted, 'answer saved');
    const secs = st.sessions[sid].answers[it.id].seconds;
    assert(Math.abs(secs - linger) <= 3, `item time ${secs}s after ${linger}s`);
    assert(r.includes(`用时 ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`), `banner time for ${secs}s: "${r}"`);
    eq(st.progress[it.id].slow, true, 'progress.slow');
    eq(st.progress[it.id].inMistakes, false, 'slow but right stays out of the mistake book');
    slowDone = true;
    ctx.linger = linger;
    return linger;
  }

  // ── 4. 考点速测 (recall checks) ──
  const recallIdx = idxOf(isRecall);
  if (recallIdx < 0) skip('考点速测 block', `no recall items planned (bank has ${bankJson.items.filter((i) => i.id.startsWith('recall-')).length} recall-… items)`);
  else
    await step(`考点速测 (${blocks[recallIdx].title}): compact card, slow-but-right flag, wrong → back in 2 days`, async () => {
      eq(blocks[recallIdx].subject, 'mixed', 'recall block subject');
      await startRow(recallIdx);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      const ids = st0.sessions[sid].itemIds;
      assert(ids.every((id) => id.startsWith('recall-')), 'only recall-… items');
      await page.locator('.pl-col.is-short').waitFor({ timeout: T.short });
      const it0 = byId.get(ids[0]);
      let note = '';
      if (!FAST) note = `slow answer after ${await slowRight(sid, it0)}s`;
      else {
        await choose(it0.answer);
        assert(/回答正确/.test(await submitAndWaitResult()), 'recall item 1 right');
      }
      await snap('recall-slow');
      await key('Enter');
      await atItem(1, ids.length);
      const it1 = byId.get(ids[1]);
      await choose(wrongOf(it1));
      const r1 = await submitAndWaitResult();
      assert(/答错了/.test(r1), `expected 答错了, got "${r1}"`);
      assert(new RegExp(`已记入错题本 · ${MISTAKE_INTERVALS[0]} 天后再练`).test(r1), `expected the 2-day note, got "${r1}"`);
      await finishEarly();
      await waitText('.pl-fin-stat', /1\s*\/\s*2/);
      const st = await waitState((s) => s.plans[today].blocks[recallIdx].status === 'done', 'block marked done');
      eq(st.progress[it1.id].due, addDays(today, MISTAKE_INTERVALS[0]), 'wrong recall item due');
      expect.done++;
      expect.answered += 2;
      await backToToday();
      return note;
    });

  // ── 5. Science choice drill, all the way through ──
  const sciIdx = idxOf((b) => b.kind === 'drill' && isSci(b) && !b.timed);
  if (sciIdx < 0) skip('science drill', 'no untimed physics/chemistry drill today');
  else
    await step(`science drill (${blocks[sciIdx].title}): answer, result, E, Enter, finish`, async () => {
      await startRow(sciIdx);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      const s0 = st0.sessions[sid];
      eq(s0.exam, false, 'practice drill is not exam mode');
      const ids = s0.itemIds;
      const N = ids.length;
      assert(N >= 5, `need ≥5 items, block has ${N}`);
      let correct = 0;
      for (let i = 0; i < N; i++) {
        const it = byId.get(ids[i]);
        await atItem(i, N);
        assert(it.format === 'choice', `${it.id} is not a choice item`);
        if (i === 0) {
          // Right answer → explanation folded; E opens it; Enter goes on.
          await choose(it.answer);
          assert(await page.locator('.pl-submit').isEnabled(), 'submit enabled after choosing');
          const r = await submitAndWaitResult();
          assert(/回答正确/.test(r), `expected 回答正确, got "${r}"`);
          assert(!(await page.locator('.pl-excard').getAttribute('class')).includes('is-open'), 'explanation should start folded after a sure, right answer');
          await key('e');
          await page.locator('.pl-excard.is-open .pl-excard-body').waitFor({ state: 'visible', timeout: T.short });
          const ex = await text('.pl-excard-body');
          assert(ex.length > 30, `explanation too short: "${ex}"`);
          await snap('drill-right-explanation');
          correct++;
        } else if (i === 1) {
          // Wrong answer → explanation opens by itself, correct key shown, back in 2 days.
          await choose(wrongOf(it));
          const r = await submitAndWaitResult();
          assert(/答错了/.test(r) && /正确答案/.test(r), `expected 答错了 + 正确答案, got "${r}"`);
          await page.locator('.pl-excard.is-open').waitFor({ timeout: T.short });
          await page.locator('.pl-opt.is-right').waitFor({ timeout: T.short });
          await page.locator('.pl-opt.is-wrong').waitFor({ timeout: T.short });
          assert(new RegExp(`已记入错题本 · ${MISTAKE_INTERVALS[0]} 天后再练`).test(r), `expected the 2-day mistake-book note, got "${r}"`);
          await snap('drill-wrong');
        } else if (i === 2) {
          // F = 没把握: still graded right, explanation opens, comes back in 4 days.
          await key('f');
          await page.locator('.pl-conf-btn.is-unsure.is-on').waitFor({ timeout: T.short });
          await choose(it.answer);
          const r = await submitAndWaitResult();
          assert(/回答正确/.test(r) && /没把握/.test(r), `expected 回答正确 + 没把握, got "${r}"`);
          assert(new RegExp(`没把握的题会再出现 · ${MISTAKE_INTERVALS[1]} 天后再练`).test(r), `expected the 4-day note, got "${r}"`);
          await page.locator('.pl-excard.is-open').waitFor({ timeout: T.short });
          correct++;
        } else if (i === 4 && N > 5) {
          // F F = 猜的: a lucky guess still goes to the mistake book.
          await key('f');
          await key('f');
          await page.locator('.pl-conf-btn.is-guess.is-on').waitFor({ timeout: T.short });
          await choose(it.answer);
          const r = await submitAndWaitResult();
          assert(/回答正确/.test(r) && new RegExp(`猜对的也记入错题本 · ${MISTAKE_INTERVALS[0]} 天后再练`).test(r), `guessed right: "${r}"`);
          correct++;
        } else if (i === 5 && N > 6) {
          // Double-click an option: choose and submit at once.
          await page.locator('.pl-opt').nth(it.answer).dblclick();
          await page.locator('.pl-res').waitFor({ state: 'visible', timeout: T.short });
          const r = await text('.pl-res');
          assert(/回答正确/.test(r), `double-click submit: "${r}"`);
          correct++;
        } else if (i === 3) {
          // "不会，看解析" without choosing.
          await page.getByRole('button', { name: '不会，看解析' }).click();
          await page.locator('.pl-res').waitFor({ timeout: T.short });
          const r = await text('.pl-res');
          assert(/看懂解析/.test(r), `gave-up banner: "${r}"`);
          assert(/已记入错题本/.test(r), `gave-up goes to the mistake book: "${r}"`);
          await snap('drill-gave-up');
        } else {
          await choose(it.answer);
          const r = await submitAndWaitResult();
          assert(/回答正确/.test(r), `item ${i + 1}: expected 回答正确, got "${r}"`);
          correct++;
        }
        if (i === N - 1) await waitText('.pl-next', /完成，看小结/);
        await key('Enter');
      }
      await page.locator('.pl-fin').waitFor({ state: 'visible', timeout: T.short });
      await waitText('.pl-fin-eyebrow', /本组完成/);
      await waitText('.pl-fin-sub', new RegExp(`错的 2 题已经进了错题本，${MISTAKE_INTERVALS[0]} 天后再练`));
      await snap('drill-summary');
      const stat = await text('.pl-fin-stat');
      assert(stat.includes(`${correct} / ${N}`), `答对 stat "${stat}" should be ${correct} / ${N}`);
      eq(await page.locator('.pl-fin-list:not(.pl-fin-right) .pl-fin-row').count(), 2, 'items to look at again (wrong + gave up)');
      const st = await waitState((s) => s.plans[today].blocks[sciIdx].status === 'done', 'block marked done');
      const b = st.plans[today].blocks[sciIdx];
      eq(b.result.correct, correct, 'block.result.correct');
      eq(b.result.answered, N - 1, 'block.result.answered (gave-up excluded)');
      assert(st.sessions[sid].finishedAt, 'session finished');
      const p1 = st.progress[ids[1]];
      const p2 = st.progress[ids[2]];
      const p3 = st.progress[ids[3]];
      assert(p1?.inMistakes && p1.box === 0 && p1.due === addDays(today, MISTAKE_INTERVALS[0]), `wrong item progress ${JSON.stringify(p1)}`);
      assert(p2?.inMistakes && p2.box === 1 && p2.due === addDays(today, MISTAKE_INTERVALS[1]), `unsure item progress ${JSON.stringify(p2)}`);
      assert(p3?.inMistakes && p3.box === 0 && p3.due === addDays(today, MISTAKE_INTERVALS[0]), `gave-up item progress ${JSON.stringify(p3)}`);
      assert(!st.progress[ids[0]].inMistakes, 'sure right item stays out of the mistake book');
      if (N > 5) assert(st.progress[ids[4]].inMistakes && st.progress[ids[4]].due === addDays(today, MISTAKE_INTERVALS[0]), `guessed item progress ${JSON.stringify(st.progress[ids[4]])}`);
      expect.done++;
      expect.answered += N;
      await backToToday();
      return `${correct}/${N} right`;
    });

  // ── 6. Leave a block mid-way and resume it from Today ──
  const sci2Idx = idxOf((b, i) => i !== sciIdx && b.kind === 'drill' && isSci(b) && !b.timed);
  if (sci2Idx < 0) skip('resume a block', 'only one untimed science drill today');
  else
    await step('leave a drill mid-way, Today offers 继续, resume, finish', async () => {
      await startRow(sci2Idx);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      const ids = st0.sessions[sid].itemIds;
      const it = byId.get(ids[0]);
      await choose(it.answer);
      await submitAndWaitResult();
      await key('Enter');
      await atItem(1, ids.length);
      await exitPlayer();
      await toastSeen(/进度已保存/);
      await waitText('.td-hero-eyebrow', /继续上次/);
      await waitText('.td-hero-reason', new RegExp(`已做\\s*1\\s*/\\s*${ids.length}\\s*题`));
      await waitText('.td-row.is-active', /已做\s*1\s*\/\s*\d+/);
      await snap('today-resume');
      await page.locator('.td-hero').getByRole('button', { name: '继续' }).click();
      eq(await waitPlayer(), sid, 'resumed the same session');
      await atItem(1, ids.length);
      await finishEarly();
      await waitState((s) => s.plans[today].blocks[sci2Idx].status === 'done', 'block marked done');
      expect.done++;
      expect.answered += 1;
      await backToToday();
    });

  // ── 7. Timed science set: exam mode until 交卷 ──
  const timedIdx = idxOf((b) => b.kind === 'drill' && isSci(b) && b.timed);
  if (timedIdx < 0) skip('timed science set', 'no timed physics/chemistry set today');
  else
    await step(`timed science set (${blocks[timedIdx].title}): no feedback until 交卷, answer sheet, blanks count`, async () => {
      await startRow(timedIdx);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      const s0 = st0.sessions[sid];
      const ids = s0.itemIds;
      const N = ids.length;
      assert(N >= 5, `need ≥5 items, set has ${N}`);
      eq(s0.exam, true, 'session.exam');
      const limit = ids.reduce((s, id) => s + byId.get(id).targetSec, 0);
      eq(s0.timeLimitSec, limit, 'timeLimitSec = Σ targetSec');
      await waitText('.pl-exam-tag', /限时/);
      const left0 = clockSecs(await text('.pl-countdown .num'));
      assert(left0 <= limit && left0 >= limit - 15, `countdown ${left0}s at the start of a ${limit}s set`);
      eq(await page.locator('.pl-top').getByRole('button', { name: '结束', exact: true }).count(), 0, '结束 button in exam mode');
      const blanks = new Set([2, N - 1]);
      for (let i = 0; i < N; i++) {
        const it = byId.get(ids[i]);
        await atItem(i, N);
        if (i === 1) {
          await choose(wrongOf(it));
          await key('f');
          await page.locator('.pl-conf-btn.is-unsure.is-on').waitFor({ timeout: T.short });
        } else if (!blanks.has(i)) await choose(it.answer);
        // Exam mode: nothing gives the answer away.
        eq(await page.locator('.pl-res').count(), 0, `result banner on item ${i + 1}`);
        eq(await page.locator('.pl-excard').count(), 0, `explanation on item ${i + 1}`);
        eq(await page.locator('.pl-opt.is-right, .pl-opt.is-wrong').count(), 0, `right/wrong marks on item ${i + 1}`);
        if (i === 1) await snap('timed-answered');
        if (i < N - 1) await key('Enter');
      }
      // Enter on the last question asks to hand in; cancel for now.
      await key('Enter');
      const confirm = page.locator('.modal').filter({ hasText: '现在交卷' });
      await confirm.waitFor({ timeout: T.short });
      assert(/还有 2 题没作答/.test(await confirm.innerText()), `交卷 dialog: "${(await confirm.innerText()).replace(/\s+/g, ' ')}"`);
      await confirm.locator('.modal-foot').getByRole('button', { name: '取消', exact: true }).click();
      await confirm.waitFor({ state: 'detached', timeout: T.short });
      // The answer sheet: answered / unsure / empty.
      const sheetBtn = page.locator('.pl-top').getByRole('button', { name: '答题卡' });
      await sheetBtn.click();
      const sheet = page.locator('.modal').filter({ hasText: '继续作答' });
      await sheet.waitFor({ timeout: T.short });
      const legend = (await sheet.locator('.pl-xs-legend').innerText()).replace(/\s+/g, '');
      assert(legend.includes(`已作答${N - 2}`) && legend.includes('没把握1') && legend.includes('未作答2'), `answer sheet legend "${legend}"`);
      eq(await sheet.locator('.pl-xs-cell.is-todo').count(), 2, 'empty cells on the answer sheet');
      await snap('timed-sheet');
      await sheet.getByRole('button', { name: '继续作答' }).click();
      await sheet.waitFor({ state: 'detached', timeout: T.short });
      const focused = await page.evaluate(() => (document.activeElement?.textContent || '').trim());
      if (/答题卡/.test(focused))
        warn('after 答题卡 → 继续作答, focus returns to the 答题卡 button, so the next Enter re-opens the sheet instead of 下一题/交卷 (Chrome; WKWebView does not focus clicked buttons)');
      // Hand in from the answer sheet.
      await sheetBtn.click();
      await sheet.waitFor({ timeout: T.short });
      await sheet.locator('.modal-foot').getByRole('button', { name: '交卷', exact: true }).click();
      await confirm.waitFor({ timeout: T.short });
      await confirm.locator('.modal-foot').getByRole('button', { name: '交卷', exact: true }).click();
      await page.locator('.pl-fin').waitFor({ state: 'visible', timeout: T.short });
      await waitText('.pl-fin-eyebrow', /已交卷/);
      const correct = N - 3;
      const stat = await text('.pl-fin-stat');
      assert(stat.includes(`${correct} / ${N}`), `答对 stat "${stat}" should be ${correct} / ${N}`);
      eq(await page.locator('.pl-fin-list:not(.pl-fin-right) .pl-fin-row').count(), 3, 'items to look at again (1 wrong + 2 blank)');
      eq(await page.locator('.pl-fin-verdict.is-blank').count(), 2, 'blank verdicts');
      await snap('timed-summary');
      const st = await waitState((s) => s.plans[today].blocks[timedIdx].status === 'done', 'block marked done');
      const b = st.plans[today].blocks[timedIdx];
      eq(b.result.answered, N - 2, 'block.result.answered (blanks excluded)');
      eq(b.result.correct, correct, 'block.result.correct');
      const atts = st.attempts.filter((a) => a.sessionId === sid);
      eq(atts.length, N, 'one attempt per question at 交卷');
      for (const i of blanks) {
        const a = atts.find((x) => x.itemId === ids[i]);
        assert(a && a.gaveUp && a.response === null && !a.correct, `blank item ${i + 1} attempt ${JSON.stringify(a)}`);
        assert(st.progress[ids[i]].inMistakes, `blank item ${i + 1} in the mistake book`);
      }
      const w = st.progress[ids[1]];
      assert(w.inMistakes && w.due === addDays(today, MISTAKE_INTERVALS[0]), `wrong item progress ${JSON.stringify(w)}`);
      expect.done++;
      expect.answered += N;
      await backToToday();
      return `${correct}/${N} right, ${limit}s limit`;
    });

  // ── 7b. A timed set that runs out of time (the browser clock is fast-forwarded) ──
  const timed2Idx = idxOf((b, i) => i !== timedIdx && b.kind === 'drill' && isSci(b) && b.timed);
  if (timed2Idx < 0) skip('timed set time-up', 'no second timed science set today');
  else
    await step(`timed set runs out (${blocks[timed2Idx].title}): skip nudge after 2× target, auto 交卷 at 0:00`, async () => {
      await startRow(timed2Idx);
      const sid = await waitPlayer();
      const s0 = (await waitState((s) => s.sessions[sid], 'session saved')).sessions[sid];
      const ids = s0.itemIds;
      const N = ids.length;
      const limit = s0.timeLimitSec;
      const it0 = byId.get(ids[0]);
      // The first question eats the clock: past 2× its target the player suggests leaving it.
      eq(await page.locator('.pl-nudge').count(), 0, 'nudge before 2× target');
      for (let k = 0; k < Math.ceil((2 * it0.targetSec) / 3) + 6 && !(await page.locator('.pl-nudge').isVisible()); k++) await page.clock.fastForward(3000);
      await page.locator('.pl-nudge').waitFor({ timeout: T.short });
      await snap('timed-nudge');
      await page.locator('.pl-nudge-btn').click();
      await atItem(1, N);
      await choose(byId.get(ids[1]).answer);
      // Run the clock out.
      for (let k = 0; k < Math.ceil(limit / 3) + 20 && !(await page.locator('.pl-fin').isVisible()); k++) await page.clock.fastForward(3000);
      await page.locator('.pl-fin').waitFor({ state: 'visible', timeout: T.short });
      await toastSeen(/时间到，已自动交卷/);
      await waitText('.pl-fin-eyebrow', /已交卷/);
      const st = await waitState((s) => s.plans[today].blocks[timed2Idx].status === 'done', 'block marked done');
      const s1 = st.sessions[sid];
      assert(s1.finishedAt, 'session finished');
      assert(s1.elapsedSec >= limit && s1.elapsedSec <= limit + 6, `elapsed ${s1.elapsedSec}s for a ${limit}s limit`);
      const b = st.plans[today].blocks[timed2Idx];
      eq(b.result.answered, 1, 'answered before time ran out');
      eq(b.result.correct, 1, 'right before time ran out');
      eq(st.attempts.filter((a) => a.sessionId === sid).length, N, 'attempts at auto 交卷');
      assert(st.sessions[sid].answers[ids[0]].seconds >= 2 * it0.targetSec, 'time on the skipped question is kept');
      expect.done++;
      expect.answered += N;
      ctx.fastForwarded = limit;
      await backToToday();
      return `${limit}s limit, 1/${N} answered`;
    });

  // ── 8. Math: the EJU mark sheet by keyboard, partial credit, then redo only the wrong groups ──
  const mathIdx = idxOf((b) => b.kind === 'drill' && b.subject === 'math' && !b.timed);
  if (mathIdx < 0) skip('math mark sheet', 'no math drill today');
  else
    await step('math block: mark sheet by keyboard, partial credit, redo locks the right groups', async () => {
      await startRow(mathIdx);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      const it = byId.get(st0.sessions[sid].itemIds[0]);
      eq(it.format, 'blanks', 'first math item format');
      const groups = blankGroups(it);
      const letters = groups.flatMap((g) => [...g]);
      assert(groups.length >= 2, `need ≥2 answer groups, got ${groups.length}`);
      await waitText('.pl-sheet-count', new RegExp(`已填 0 / ${letters.length}`));

      // Typo + ⌫, then ↓ / ↑ move the cursor.
      await key('7');
      await waitText('.pl-sheet-count', new RegExp(`已填 1 / ${letters.length}`));
      await key('Backspace');
      await waitText('.pl-sheet-count', new RegExp(`已填 0 / ${letters.length}`));
      await key('ArrowDown');
      eq(await page.locator('.pl-cell.is-active').getAttribute('aria-label'), `格子 ${letters[1]}`, 'cursor after ↓');
      await key('ArrowUp');
      eq(await page.locator('.pl-cell.is-active').getAttribute('aria-label'), `格子 ${letters[0]}`, 'cursor after ↑');

      // First half of the groups right, the rest wrong (first cell off by one).
      const half = Math.ceil(groups.length / 2);
      const typed = {};
      groups.forEach((g, gi) => {
        [...g].forEach((l, li) => {
          const exp = it.blanks[l];
          typed[l] = gi >= half && li === 0 ? (exp === '-' ? '1' : String((Number(exp) + 1) % 10)) : exp;
        });
      });
      for (const l of letters) await key(typed[l] === '-' ? 'Minus' : typed[l]);
      await waitText('.pl-sheet-count', new RegExp(`已填 ${letters.length} / ${letters.length}`));
      await snap('math-sheet-filled');
      for (const l of letters) {
        const label = await page.locator('.pl-cell').filter({ has: page.locator('.pl-cell-letter', { hasText: new RegExp(`^${l}$`) }) }).getAttribute('aria-label');
        eq(label, `格子 ${l}：${typed[l]}`, `cell ${l}`);
      }
      // The draft is saved before submitting (survives closing the window).
      await waitState((s) => JSON.stringify(s.sessions[sid].answers[it.id]?.response) === JSON.stringify(typed), 'mark-sheet draft saved', 6000);

      const r = await submitAndWaitResult();
      assert(new RegExp(`对了 ${half} / ${groups.length} 组`).test(r), `expected 对了 ${half} / ${groups.length} 组, got "${r}"`);
      assert((await page.locator('.pl-res').getAttribute('class')).includes('tone-warning'), 'partial credit uses the warning tone');
      await waitText('.pl-sheet-count', new RegExp(`对 ${half} / ${groups.length} 组`));
      eq(await page.locator('.pl-grp.is-wrong').count(), groups.length - half, 'wrong groups on the sheet');
      const fixes = (await page.locator('.pl-grp-fix').allInnerTexts()).map((s) => s.trim());
      const wantFix = groups.slice(half).map((g) => [...g].map((l) => it.blanks[l]).join('').replace(/-/g, '−'));
      eq(JSON.stringify(fixes), JSON.stringify(wantFix), 'correct answers shown for wrong groups');
      await snap('math-partial');
      const st1 = await waitState((s) => s.sessions[sid].answers[it.id]?.submitted, 'answer graded');
      const a = st1.sessions[sid].answers[it.id];
      assert(Math.abs(a.score - half / groups.length) < 1e-9 && a.correct === false, `score ${a.score}, correct ${a.correct}`);

      await finishEarly();
      await waitText('.pl-fin-pct-label', /得分率/);
      await waitText('.pl-fin-pct', new RegExp(`^${Math.round((half / groups.length) * 100)}`));
      await snap('math-summary');
      await waitState((s) => s.plans[today].blocks[mathIdx].status === 'done', 'block marked done');
      expect.done++;
      expect.answered += 1;

      // 重做错题: the groups that were right stay filled and locked; only the rest is redone.
      await page.locator('.pl-fin-cta').getByRole('button', { name: /重做错题/ }).click();
      const rid = await waitPlayer();
      assert(rid !== sid, 'redo opens a new session');
      const st2 = await waitState((s) => s.sessions[rid], 'redo session saved');
      eq(st2.sessions[rid].kind, 'review', 'redo session kind');
      eq(JSON.stringify(st2.sessions[rid].itemIds), JSON.stringify([it.id]), 'redo items');
      const locks = lockedGroups(st2, bank, it.id);
      const lockedLetters = groups.slice(0, half).flatMap((g) => [...g]);
      eq(JSON.stringify(Object.keys(locks).sort()), JSON.stringify([...lockedLetters].sort()), 'lockedGroups = the groups before the first wrong one');
      await waitText('.pl-sheet-lock', /已答对·锁定/);
      eq(await page.locator('.pl-cell.is-locked').count(), lockedLetters.length, 'locked cells');
      const open = letters.filter((l) => !lockedLetters.includes(l));
      await waitText('.pl-sheet-count', new RegExp(`已填 0 / ${open.length}`));
      for (const l of open) await key(it.blanks[l] === '-' ? 'Minus' : it.blanks[l]);
      await waitText('.pl-sheet-count', new RegExp(`已填 ${open.length} / ${open.length}`));
      await snap('math-redo-locked');
      const r2 = await submitAndWaitResult();
      assert(/全部正确/.test(r2), `redo: expected 全部正确, got "${r2}"`);
      // Same-day re-test: right, but the item stays in the book until it is due.
      assert(/错题本复习中/.test(r2), `redo before due: expected 错题本复习中, got "${r2}"`);
      await key('Enter');
      await page.locator('.pl-fin').waitFor({ state: 'visible', timeout: T.short });
      const st3 = await waitState((s) => s.sessions[rid].finishedAt, 'redo finished');
      const p = st3.progress[it.id];
      assert(p.inMistakes && p.box === 0 && p.due === addDays(today, MISTAKE_INTERVALS[0]), `a right answer before the due date changes nothing: ${JSON.stringify(p)}`);
      expect.answered += 1;
      await backToToday();
      return `${half}/${groups.length} groups, then ${open.length} cells redone`;
    });

  // ── 9. Japanese reading ──
  const readIdx = idxOf((b) => b.kind === 'reading' && !isGrammar(b) && !b.timed);
  if (readIdx < 0) skip('reading block', 'no reading block today');
  else
    await step('Japanese reading block: passage + question, right and wrong answers', async () => {
      await startRow(readIdx);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      const ids = st0.sessions[sid].itemIds;
      const it0 = byId.get(ids[0]);
      eq(await page.locator('.pl-opt-text').count(), it0.options.length, 'reading options show their text');
      const paper = await text('.pl-paper');
      assert(paper.length > 40, 'passage text rendered');
      if (await page.locator('.pl-paper-label').count()) await page.locator('.pl-ask').waitFor({ timeout: T.short });
      await snap('reading-item');
      await choose(it0.answer);
      assert(/回答正确/.test(await submitAndWaitResult()), 'reading item 1 right');
      await key('Enter');
      await atItem(1, ids.length);
      const it1 = byId.get(ids[1]);
      await choose(wrongOf(it1));
      assert(/答错了/.test(await submitAndWaitResult()), 'reading item 2 wrong');
      await finishEarly();
      await waitText('.pl-fin-stat', /1\s*\/\s*2/);
      await waitState((s) => s.plans[today].blocks[readIdx].status === 'done', 'block marked done');
      expect.done++;
      expect.answered += 2;
      await backToToday();
    });

  // ── 10. Listening ──
  const listenIdx = idxOf((b) => b.kind === 'listening');
  if (listenIdx < 0) skip('listening block', 'no listening block today');
  else
    await step('listening block: audio plays, option texts hidden until submitted', async () => {
      await startRow(listenIdx);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      const ids = st0.sessions[sid].itemIds;
      // A pure listening question (options only in the recording) — 聴読解 shows them in the figure.
      let k = ids.findIndex((id) => byId.get(id).section === 'listening');
      assert(k >= 0, 'no pure listening item in the block');
      for (let i = 0; i < k; i++) {
        const x = byId.get(ids[i]);
        await choose(x.answer);
        await submitAndWaitResult();
        await key('Enter');
      }
      const it = byId.get(ids[k]);
      await atItem(k, ids.length);
      assert(it.audio?.src, `${it.id} has no audio`);
      await page.locator('.pl-audio').waitFor({ timeout: T.short });
      eq(await page.locator('.pl-opt').count(), it.options.length, 'option buttons');
      eq(await page.locator('.pl-opt-text').count(), 0, 'option texts before submitting');
      const html = await page.content();
      const leaked = it.options.filter((o) => o.length >= 4 && html.includes(o));
      eq(leaked.length, 0, `option texts leaked into the page before submitting: ${leaked.join(' / ')}`);
      if (it.transcript) assert(!html.includes(it.transcript.slice(0, 30)), 'transcript leaked before submitting');
      await snap('listening-before');

      await page.locator('.pl-audio-btn').click();
      const play = await poll(
        () =>
          page.evaluate((src) => {
            const r = window.__plays.filter((p) => p.src.endsWith(src)).pop();
            return r && r.ok && r.el.currentTime > 0.5 && !r.el.paused ? { t: r.el.currentTime } : r?.err ? { err: r.err } : null;
          }, it.audio.src),
        `audio ${it.audio.src} playing`,
        T.long,
        200,
      );
      assert(!play.err, `audio play() failed: ${play.err}`);
      await waitText('.pl-audio-status', /正在播放/);
      await key(' ');
      await waitText('.pl-audio-status', /已暂停/);
      const paused = await page.evaluate((src) => window.__plays.filter((p) => p.src.endsWith(src)).pop().el.paused, it.audio.src);
      assert(paused, 'Space pauses the clip');

      await choose(it.answer);
      assert(/回答正确/.test(await submitAndWaitResult()), 'listening item right');
      eq(await page.locator('.pl-opt-text').count(), it.options.length, 'option texts after submitting');
      await waitText('.pl-opts', new RegExp(reEsc(it.options[it.answer].replace(/\$[^$]*\$/g, '').slice(0, 6))));
      await snap('listening-after');
      await finishEarly();
      await waitState((s) => s.plans[today].blocks[listenIdx].status === 'done', 'block marked done');
      expect.done++;
      expect.answered += k + 1;
      await backToToday();
      return `played to ${play.t.toFixed(1)}s`;
    });

  // ── 11. 文型 (grammar) ──
  const gramIdx = idxOf(isGrammar);
  if (gramIdx < 0) skip('文型 block', 'no grammar block today');
  else
    await step(`文型 block (${blocks[gramIdx].title}): sentence + question on one card, right and wrong`, async () => {
      eq(blocks[gramIdx].kind, 'reading', 'grammar block kind');
      await startRow(gramIdx);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      const ids = st0.sessions[sid].itemIds;
      assert(ids.every((id) => byId.get(id).topic.startsWith('ja.vocab')), 'only ja.vocab items');
      await page.locator('.pl-col.is-short').waitFor({ timeout: T.short });
      eq(await page.locator('.pl-ask').count(), 0, 'grammar keeps its question with the sentence (no side 设问)');
      const it0 = byId.get(ids[0]);
      let note = '';
      if (!FAST && !slowDone) note = `slow answer after ${await slowRight(sid, it0)}s`;
      else {
        await choose(it0.answer);
        assert(/回答正确/.test(await submitAndWaitResult()), 'grammar item 1 right');
      }
      await snap('grammar');
      await key('Enter');
      await atItem(1, ids.length);
      const it1 = byId.get(ids[1]);
      await choose(wrongOf(it1));
      assert(/答错了/.test(await submitAndWaitResult()), 'grammar item 2 wrong');
      await finishEarly();
      await waitText('.pl-fin-stat', /1\s*\/\s*2/);
      await waitState((s) => s.plans[today].blocks[gramIdx].status === 'done', 'block marked done');
      expect.done++;
      expect.answered += 2;
      await backToToday();
      return note;
    });

  // ── 12. Vocabulary ──
  const vocabIdx = idxOf((b) => b.kind === 'vocab');
  if (vocabIdx < 0) skip('vocab block', 'no vocab block today');
  else
    await step('vocab block (#/vocab?start=1): type kana readings, choose meanings, finish the run', async () => {
      const st0 = await getState();
      const engine = vocabQueue(st0, bank, today, vocabNewLimit(st0, bank, today));
      await startRow(vocabIdx);
      await page.locator('.vc-session').waitFor({ state: 'visible', timeout: T.short });
      await poll(async () => !page.url().includes('start=1'), '?start=1 removed from the URL');
      const total0 = Number((await text('.vc-count')).split('/')[1]);
      eq(total0, engine.length, 'cards in the run = vocabQueue(…, vocabNewLimit)');
      let cards = 0;
      let firsts = 0;
      let firstOk = 0;
      let wrongRead = null;
      let wrongMeaning = null;
      let retries = 0;
      for (let guard = 0; guard < 600; guard++) {
        if (await page.locator('.vc-summary').isVisible()) break;
        await page.locator('.vc-stage').waitFor({ timeout: T.short });
        const tags = await text('.vc-stage-tags');
        const word = (await page.locator('.vc-word').innerText()).trim();
        const v = vocabByWord.get(word);
        assert(v, `unknown word on the card: ${word}`);
        const retry = /再练一次/.test(tags);
        let ok = true;
        if (/看字写读音/.test(tags)) {
          const input = page.locator('.vc-input');
          await input.waitFor({ timeout: T.short });
          await poll(() => page.evaluate(() => document.activeElement?.classList.contains('vc-input')), 'reading input focused');
          if (!wrongRead && !retry) {
            wrongRead = v.word;
            ok = false;
            await page.keyboard.type('ああ');
          } else {
            await page.keyboard.type(v.reading);
          }
          await key('Enter');
        } else {
          const opts = (await page.locator('.vc-option-text').allInnerTexts()).map((s) => s.trim());
          const right = opts.indexOf(v.meaningZh.trim());
          assert(right >= 0, `meaning of ${word} not among the options`);
          if (!wrongMeaning && !retry) {
            wrongMeaning = v.word;
            ok = false;
            await key('0');
          } else await key(String(right + 1));
        }
        const verdict = await text('.vc-verdict');
        if (cards < 2 || (!ok && !retry)) await snap(`vocab-card-${cards + 1}`);
        if (ok) assert(/答对了|这次对了/.test(verdict), `card ${cards + 1} (${word}) expected right, got "${verdict}"`);
        else assert(/记一下/.test(verdict), `card ${cards + 1} (${word}) expected wrong, got "${verdict}"`);
        if (retry) retries++;
        else {
          firsts++;
          if (ok) firstOk++;
        }
        cards++;
        // After answering, the card itself takes focus (so Enter / Space / E work); wait for it like a person would.
        await poll(() => page.evaluate(() => document.activeElement?.classList.contains('vc-stage')), 'answered card focused');
        await key('Enter');
        await poll(async () => (await page.locator('.vc-summary').isVisible()) || !(await page.locator('.vc-verdict').isVisible()), 'next card');
      }
      await page.locator('.vc-summary').waitFor({ state: 'visible', timeout: T.short });
      await waitText('.vc-summary-done', /今日计划里的词汇已完成/);
      await snap('vocab-summary');
      assert(wrongRead && wrongMeaning, 'the run had both kinds of cards');
      eq(retries, 2, 'wrong cards come back once in the same run');
      eq(firsts, engine.length, 'first tries = engine queue');
      const st = await waitState((s) => s.plans[today].blocks[vocabIdx].status === 'done', 'vocab block marked done');
      const b = st.plans[today].blocks[vocabIdx];
      eq(b.result.answered, firsts, 'vocab block result.answered (first tries)');
      eq(b.result.correct, firstOk, 'vocab block result.correct');
      eq(st.vocabAttempts.length - ctx.vocabAttempts0, cards, 'vocab attempts recorded');
      eq(st.days[today].vocab, cards, 'days[today].vocab');
      const est = Math.round((engine.length * 9) / 60);
      if (b.vocabCount !== engine.length || Math.abs(b.minutes - est) > 2)
        warn(`vocab block says "${b.title}" (${b.vocabCount} 个词, ${b.minutes} 分钟) but the run has ${engine.length} cards (~${est} min at 9 s/card)`);
      expect.done++;
      await gotoToday();
      return `${cards} cards (${firsts} first tries, ${firstOk} right); plan said ${b.vocabCount} 个词 / ${b.minutes} min`;
    });

  // ── 13. Today reflects the work ──
  await step('Today reflects progress: blocks, answered count, minutes', async () => {
    if (!/#\/?$/.test(page.url()) && !/\/$/.test(page.url())) await gotoToday();
    await page.locator('.td-plan').waitFor({ timeout: T.short });
    await page.waitForTimeout(600);
    const st = await getState();
    const plan = st.plans[today];
    const day = st.days[today];
    const doneN = plan.blocks.filter((b) => b.status === 'done').length;
    const countable = plan.blocks.filter((b) => b.status !== 'skipped').length;
    eq(doneN, expect.done, 'done blocks in the saved plan');
    eq(day.answered, expect.answered, 'days[today].answered');
    assert(day.seconds > 0, `study seconds should be > 0, got ${day.seconds}`);
    if (ctx.linger) assert(day.seconds >= ctx.linger, `study seconds ${day.seconds} < ${ctx.linger} spent on one item`);
    eq(await page.locator('.td-row.is-done').count(), doneN, 'done rows');
    await waitText('.td-mini', new RegExp(`^\\s*${doneN}/${countable}`));
    await waitText('.td-mini', new RegExp(`^\\s*${day.answered}\\s*正确率 ${pct(day.correct / day.answered)}`));
    eq((await text('.td-hm')).replace(/\s/g, ''), HMtext(day.seconds / 60), 'minutes studied');
    eq(await text('.td-pg-pct'), `${Math.min(999, Math.round((day.seconds / 60 / plan.budgetMinutes) * 100))}%`, 'progress ring');
    await waitText('.td-plan-sub', new RegExp(`已完成 ${doneN}`));
    if (doneN < countable) await waitText('.td-title', new RegExp(`已完成 ${doneN} / ${countable} 块`));
    for (const [i, b] of plan.blocks.entries()) {
      if (b.status !== 'done' || !b.result || !(b.result.answered > 0)) continue;
      const row = await page.locator('.td-row').nth(i).locator('.td-row-result').innerText();
      assert(row.replace(/\s/g, '').includes(`${b.result.correct}/${b.result.answered}`), `row ${i + 1} result "${row}"`);
    }
    const next = plan.blocks.find((b) => b.status === 'todo');
    if (next) eq(await text('.td-hero-title'), next.title, 'hero moves on to the next todo block');
    // Due cards: today's mistakes come back later, not today.
    await waitText('.td-due-row', /没有到期的错题/);
    await snap('today-progress');
    return `${doneN}/${countable} blocks, ${day.answered} answered, ${day.seconds}s`;
  });

  if (vocabIdx >= 0)
    await step('Today: 待复习词汇 counts only the cards the vocab engine schedules', async () => {
      const st = await getState();
      let words = 0;
      for (const v of bank.bundle.vocab) {
        const p = st.vocab[v.id];
        if (p && vocabSkills(v).some((k) => p[k] && p[k].due <= today)) words++;
      }
      const row = page.locator('.td-due-row.tone-japanese');
      const shown = (await row.innerText()).replace(/\s+/g, ' ');
      const m = /待复习词汇 (\d+) 个/.exec(shown);
      const n = m ? Number(m[1]) : /词汇都复习完了/.test(shown) ? 0 : NaN;
      const stray = bank.bundle.vocab
        .filter((v) => st.vocab[v.id])
        .flatMap((v) => ['read', 'meaning'].filter((k) => !vocabSkills(v).includes(k) && st.vocab[v.id][k] && st.vocab[v.id][k].due <= today).map((k) => `${v.word}/${k}`));
      eq(n, words, `"${shown}" after finishing the run (skills the engine no longer trains: ${stray.join(', ') || 'none'})`);
    });

  await step('预测 on Today, 冲刺计划 and 数据 agree with estimateAll(state, bank)', async () => {
    const st = await getState();
    const est = estimateAll(st, bank);
    const bankless = estimateAll(st);
    const SUBJ = ['japanese', 'math', 'physics', 'chemistry'];
    const want = Object.fromEntries(SUBJ.map((s) => [s, est[s].estimate]));
    const read = async (sel) => Number(((await page.locator(sel).first().innerText()).match(/\d+/) || ['NaN'])[0]);
    const seen = { today: {}, plan: {}, stats: {} };
    for (const s of SUBJ) seen.today[s] = await read(`.td-subj-row.tone-${s} .td-subj-val`);
    seen.today.total = await read('.td-score-num');
    await page.locator('.sidebar a', { hasText: '冲刺计划' }).first().click();
    await page.locator('.plan-tg-row.is-total').waitFor({ timeout: T.short });
    for (const s of SUBJ) seen.plan[s] = await read(`.plan-tg-row.tone-${s} .plan-tg-cur`);
    seen.plan.total = await read('.plan-tg-row.is-total .plan-tg-cur');
    await page.locator('.sidebar a', { hasText: '数据' }).first().click();
    await page.locator('.st-big').waitFor({ timeout: T.short });
    for (const s of SUBJ) seen.stats[s] = await read(`.st-subj.tone-${s} .st-num-lg`);
    seen.stats.total = await read('.st-big');
    await gotoToday();
    want.total = totalEstimate(est);
    const bad = [];
    for (const where of ['today', 'plan', 'stats'])
      for (const k of [...SUBJ, 'total']) if (seen[where][k] !== want[k]) bad.push(`${where}.${k} ${seen[where][k]} ≠ ${want[k]}`);
    const noBank = Object.fromEntries([...SUBJ.map((s) => [s, bankless[s].estimate]), ['total', totalEstimate(bankless)]]);
    assert(!bad.length, `${bad.join(', ')} (estimateAll without the bank gives ${JSON.stringify(noBank)})`);
    return `total ${want.total}`;
  });

  await step('skip a block and restore it; leaving a block untouched puts it back', async () => {
    const st = await getState();
    const plan = st.plans[today];
    const i = plan.blocks.findIndex((b) => b.status === 'todo' && b.kind !== 'vocab' && b.kind !== 'notes' && b.kind !== 'mock' && b.kind !== 'traps');
    if (i < 0) return 'no todo block left';
    const n = plan.blocks.filter((b) => b.status !== 'skipped').length;
    const row = page.locator('.td-row').nth(i);
    await row.getByRole('button', { name: '跳过这一块' }).click();
    await toastSeen(/已跳过/);
    await page.locator('.td-row.is-skipped').nth(0).waitFor({ timeout: T.short });
    await waitText('.td-plan-sub', new RegExp(`^${n - 1} 块`));
    await waitState((s) => s.plans[today].blocks[i].status === 'skipped', 'block skipped');
    await row.getByRole('button', { name: '恢复' }).click();
    await waitText('.td-plan-sub', new RegExp(`^${n} 块`));
    await waitState((s) => s.plans[today].blocks[i].status === 'todo', 'block restored');

    await startRow(i);
    const sid = await waitPlayer();
    await exitPlayer();
    const after = await waitState((s) => s.plans[today].blocks[i].status === 'todo' && !s.sessions[sid] && !s.activeSessionId, 'untouched block back to todo, empty session dropped');
    eq(after.plans[today].blocks[i].status, 'todo', 'block status');
    assert(!(await text('.td-hero-eyebrow')).includes('继续上次'), 'Today should not offer to resume an empty session');
    eq(await page.locator('.td-row').nth(i).getAttribute('class').then((c) => c.includes('is-todo')), true, 'row back to todo');
  });

  const keptOf = (s) => s.plans[today].blocks.filter((b) => b.status !== 'todo').map((b) => JSON.stringify([b.id, b.status, b.result ?? null, b.itemIds]));
  const usedItems = (s) => new Set(s.plans[today].blocks.filter((b) => b.status !== 'todo').flatMap((b) => b.itemIds));

  // ── 14. 调整时长 ──
  await step('调整时长: 8 h re-plans the rest of today, finished blocks kept', async () => {
    const before = await getState();
    await page.locator('.td-plan-actions').getByRole('button', { name: '调整时长' }).click();
    const modal = page.locator('.modal').filter({ hasText: '调整今天的学习时长' });
    await modal.waitFor({ timeout: T.short });
    await modal.locator('.du-opt').filter({ has: page.locator('.du-h', { hasText: /^8$/ }) }).click();
    await waitText('.du-note', /实际安排 8 小时/);
    await waitText('.du-note', /已完成和进行中的块保留/);
    await snap('duration-dialog');
    await modal.getByRole('button', { name: '保存并更新计划' }).click();
    await toastSeen(/今天改为 8 小时，计划已更新/);
    const st = await waitState((s) => s.profile.dayMinutes[today] === 480 && s.plans[today].budgetMinutes === 480, 'dayMinutes saved and plan rebuilt');
    eq(JSON.stringify(keptOf(st)), JSON.stringify(keptOf(before)), 'finished blocks unchanged');
    const blocksNow = st.plans[today].blocks;
    const sum = blocksNow.reduce((s, b) => s + b.minutes, 0);
    const kept = blocksNow.filter((b) => b.status !== 'todo').reduce((s, b) => s + b.minutes, 0);
    assert(kept > 480 ? sum === kept : Math.abs(sum - 480) <= 15, `planned ${sum} min (kept ${kept}) for a 480 min day`);
    eq(blocksNow.filter((b) => b.kind === 'vocab').length, 1, 'still one vocab block');
    assert(blocksNow.filter(isRecall).length <= 1 && blocksNow.filter(isGrammar).length <= 1, 'no second 考点速测 / 文型 block');
    const used = usedItems(before);
    const reused = blocksNow.filter((b) => b.status === 'todo').flatMap((b) => b.itemIds).filter((id) => used.has(id));
    eq(reused.length, 0, `new blocks repeat items finished today (${reused.slice(0, 3).join(', ')})`);
    await waitText('.td-pg-budget', /计划 8 小时/);
    await waitText('.td-plan-sub', new RegExp(`约 ${fmtMinutes(blocksNow.filter((b) => b.status !== 'skipped').reduce((s, b) => s + b.minutes, 0))}`));
    eq(await page.locator('.td-row').count(), blocksNow.length, 'rows after re-plan');
    await snap('today-8h');
    return `${blocksNow.length} blocks, ${sum} min (${kept} kept)`;
  });

  // ── 15. 重新生成 ──
  await step('重新生成 keeps finished blocks and renews the rest', async () => {
    const before = await getState();
    const oldTodo = before.plans[today].blocks.filter((b) => b.status === 'todo').map((b) => b.id);
    await page.locator('.td-plan-actions').getByRole('button', { name: '重新生成' }).click();
    await confirmModal('重新生成今天的计划', '重新生成');
    await toastSeen(/计划已更新/);
    const st = await waitState((s) => s.plans[today].generatedAt !== before.plans[today].generatedAt, 'plan regenerated');
    eq(JSON.stringify(keptOf(st)), JSON.stringify(keptOf(before)), 'finished blocks unchanged');
    eq(st.plans[today].budgetMinutes, 480, 'budget kept');
    const todo = st.plans[today].blocks.filter((b) => b.status === 'todo');
    assert(todo.every((b) => !oldTodo.includes(b.id)), 'todo blocks are new');
    const kinds = st.plans[today].blocks.map((b) => b.kind);
    eq(kinds.filter((k) => k === 'vocab').length, 1, 'no duplicate vocab block');
    const used = usedItems(before);
    const reused = todo.flatMap((b) => b.itemIds).filter((id) => used.has(id));
    eq(reused.length, 0, `new blocks repeat items finished today (${reused.slice(0, 3).join(', ')})`);
    assert(st.plans[today].blocks.filter(isRecall).length <= 1 && st.plans[today].blocks.filter(isGrammar).length <= 1, 'no second 考点速测 / 文型 block');
    eq(await page.locator('.td-row.is-done').count(), expect.done, 'done rows after regenerating');
    eq(await page.locator('.td-row').count(), st.plans[today].blocks.length, 'rows after regenerating');
    await snap('today-regenerated');
    return `${todo.length} new todo blocks`;
  });

  // ── 16. Reload & restart: everything persisted ──
  await step('reload: Today and GET /api/state unchanged', async () => {
    await page.waitForTimeout(800); // let the last debounced save land
    const before = await getState();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.td-plan').waitFor({ timeout: T.long });
    await page.waitForTimeout(800);
    const after = await getState();
    for (const k of ['profile', 'days', 'vocab', 'progress', 'mocks', 'sessions']) eq(JSON.stringify(after[k]), JSON.stringify(before[k]), `state.${k} after reload`);
    eq(JSON.stringify(after.plans[today]), JSON.stringify(before.plans[today]), "today's plan after reload");
    eq(after.attempts.length, before.attempts.length, 'attempts after reload');
    eq(after.vocabAttempts.length, before.vocabAttempts.length, 'vocab attempts after reload');
    eq(await page.locator('.td-row.is-done').count(), expect.done, 'done rows after reload');
    eq(await page.locator('.td-row').count(), after.plans[today].blocks.length, 'rows after reload');
    await waitText('.td-mini', new RegExp(`^\\s*${after.days[today].answered}\\s*正确率`));
    ctx.beforeRestart = after;
  });

  await step('server restart: the record on disk is the same', async () => {
    await stopServer();
    await startServer(dist);
    const st = await getState();
    const a = { ...ctx.beforeRestart, savedAt: 0 };
    const b = { ...st, savedAt: 0 };
    eq(JSON.stringify(b), JSON.stringify(a), 'state after restart');
    if (hasV1) eq(sha(v1Copy), v1Hash, 'v1 state.json still untouched');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.td-plan').waitFor({ timeout: T.long });
    eq(await page.locator('.td-row.is-done').count(), expect.done, 'done rows after restart');
  });

  await step('end of the day: leave a block half-done', async () => {
    const st = await getState();
    const i = st.plans[today].blocks.findIndex((b) => b.status === 'todo' && (b.kind === 'drill' || b.kind === 'reading') && !b.timed);
    assert(i >= 0, 'no todo practice block left');
    await startRow(i);
    const sid = await waitPlayer();
    const s0 = (await waitState((x) => x.sessions[sid], 'session saved')).sessions[sid];
    const it = byId.get(s0.itemIds[0]);
    if (it.format === 'choice') await choose(it.answer);
    else for (const l of blankGroups(it).flatMap((g) => [...g])) await key(it.blanks[l] === '-' ? 'Minus' : it.blanks[l]);
    await submitAndWaitResult();
    await exitPlayer();
    await waitState((x) => x.activeSessionId === sid && x.sessions[sid].answers[it.id]?.submitted, 'left mid-way');
    ctx.stale = { sid, title: s0.title, n: s0.itemIds.length, blockId: s0.blockId };
    return s0.title;
  });

  // ── 04:00 rollover with the app left open ──
  const d2 = addDays(DAY1, 1);
  await openDay(`${d2}T03:58:30`);
  dayLabel = `${d2} 03:58`;
  await step('after midnight the study day is still yesterday; at 04:00 Today rolls over to a new plan', async () => {
    await page.locator('.td-plan').waitFor({ timeout: T.long });
    await waitText('.td-late', /凌晨 4 点前仍算作今天/);
    assert((await text('.td-date')).includes(fmtDateShort(DAY1)), `date before 04:00: "${await text('.td-date')}"`);
    await waitText('.td-hero-eyebrow', /继续上次/);
    eq(await text('.td-hero-title'), ctx.stale.title, 'yesterday-evening session leads Today before 04:00');
    const before = await getState();
    assert(!before.plans[d2], `no plan for ${d2} before 04:00`);
    await page.clock.fastForward(150_000);
    await poll(async () => (await text('.td-date')).includes(fmtDateShort(d2)), `Today switches to ${d2}`, T.long);
    eq(await page.locator('.td-late').count(), 0, 'late-night note after 04:00');
    const st = await waitState((x) => x.plans[d2]?.blocks.length > 0, `plan for ${d2} saved after the rollover`);
    await page.locator('.td-row').first().waitFor({ timeout: T.short });
    eq(await page.locator('.td-row').count(), st.plans[d2].blocks.length, 'rows of the new day');
    await page.locator('.td-stale').waitFor({ timeout: T.short });
    return `${st.plans[d2].blocks.length} blocks for ${d2}`;
  });

  // ───────────── Later days of the sprint (the browser clock moves on) ─────────────

  /** Locks the player will apply on a review item (same rule as the player's initialLocks). */
  function expectedLocks(st, kind, it) {
    if (kind !== 'review' || it.format !== 'blanks') return {};
    const last = [...st.attempts].reverse().find((a) => a.itemId === it.id);
    if (!last || last.gaveUp) return {};
    const l = lockedGroups(st, bank, it.id);
    const n = Object.keys(l).length;
    return n > 0 && n < blankGroups(it).join('').length ? l : {};
  }

  /** Answer the current item right and submit; returns the banner text. */
  async function answerRight(st, session, it) {
    if (it.format === 'choice') await choose(it.answer);
    else {
      const locks = expectedLocks(st, session.kind, it);
      const open = blankGroups(it)
        .flatMap((g) => [...g])
        .filter((l) => !(l in locks));
      for (const l of open) await key(it.blanks[l] === '-' ? 'Minus' : it.blanks[l]);
      await waitText('.pl-sheet-count', new RegExp(`已填 ${open.length} / ${open.length}`));
    }
    const r = await submitAndWaitResult();
    assert(/回答正确|全部正确/.test(r), `${it.id}: expected a right answer, got "${r}"`);
    return r;
  }

  async function dayPlan(date) {
    const st = await waitState((s) => s.plans[date] && s.plans[date].blocks.length > 0, `plan for ${date} saved at boot`, T.long);
    await page.locator('.td-plan').waitFor({ timeout: T.long });
    const plan = st.plans[date];
    eq(plan.phase, phaseFor(daysLeftOn(st, date)), `${date} phase`);
    eq(plan.budgetMinutes, budgetFor(st, date), `${date} budget`);
    const sum = plan.blocks.reduce((n, b) => n + b.minutes, 0);
    assert(Math.abs(sum - plan.budgetMinutes) <= 15, `${date}: planned ${sum} min for a ${plan.budgetMinutes} min budget`);
    eq(await page.locator('.td-row').count(), plan.blocks.length, `${date} rows`);
    return st;
  }

  // ── Day +2: the first mistakes are due ──
  const d3 = addDays(DAY1, MISTAKE_INTERVALS[0]);
  await openDay(d3);
  if (ctx.stale)
    await step(`a block left half-done on ${DAY1} shows as a slim notice, not as today's hero; finish it from there`, async () => {
      await page.locator('.td-plan').waitFor({ timeout: T.long });
      const notice = page.locator('.td-stale');
      await notice.waitFor({ timeout: T.short });
      const t = (await notice.innerText()).replace(/\s+/g, ' ');
      assert(t.includes(ctx.stale.title) && t.includes(`已做 1/${ctx.stale.n}`), `notice "${t}"`);
      const st = await getState();
      eq(await text('.td-hero-title'), st.plans[d3].blocks[0].title, "hero shows today's first block");
      await notice.getByRole('button', { name: '继续' }).click();
      eq(await waitPlayer(), ctx.stale.sid, 'resumed the old session');
      // It reopens where it was left: the answered first question, then Enter moves on.
      await atItem(0, ctx.stale.n);
      await page.locator('.pl-res').waitFor({ timeout: T.short });
      await key('Enter');
      await atItem(1, ctx.stale.n);
      await finishEarly();
      await backToToday();
      eq(await page.locator('.td-stale').count(), 0, 'notice after finishing');
      const st2 = await waitState((x) => x.sessions[ctx.stale.sid].finishedAt && !x.activeSessionId, 'old session finished');
      const b = st2.plans[DAY1].blocks.find((x) => x.id === ctx.stale.blockId);
      eq(b?.status, 'done', `${DAY1} block status`);
    });
  await step(`mistakes from ${DAY1} are due after ${MISTAKE_INTERVALS[0]} days; a confident right answer moves them to the 4-day step`, async () => {
    const st = await dayPlan(d3);
    const plan = st.plans[d3];
    const due = Object.entries(st.progress)
      .filter(([, p]) => isDue(p, d3))
      .map(([id]) => id);
    assert(due.length > 0, 'no due mistakes');
    const ri = plan.blocks.findIndex((b) => b.kind === 'review' && !b.reviewOfMock);
    assert(ri >= 0, `no 错题重做 block: ${plan.blocks.map((b) => b.title).join(' | ')}`);
    const review = plan.blocks[ri];
    assert(review.itemIds.every((id) => due.includes(id)), 'review block holds only due mistakes');
    const missing = due.filter((id) => !plan.blocks.some((b) => b.itemIds.includes(id)));
    eq(missing.length, 0, `due mistakes left out of the plan (${missing.join(', ')})`);
    // Unsure-but-right items (4-day step) are not due yet.
    const notYet = Object.entries(st.progress).filter(([, p]) => p.inMistakes && p.due > d3);
    assert(notYet.every(([id]) => !review.itemIds.includes(id)), 'review block holds items not yet due');
    await waitText('.td-due-row', new RegExp(`到期错题\\s*${due.length}\\s*题`));
    await startRow(ri);
    const sid = await waitPlayer();
    const st1 = await waitState((s) => s.sessions[sid], 'session saved');
    const session = st1.sessions[sid];
    eq(session.kind, 'review', 'session kind');
    const it = byId.get(session.itemIds[0]);
    const r = await answerRight(st1, session, it);
    assert(new RegExp(`再答对 1 次就移出错题本 · ${MISTAKE_INTERVALS[1]} 天后再练`).test(r), `first spaced re-test: "${r}"`);
    await snap('day3-retest');
    const st2 = await waitState((s) => s.progress[it.id].box === 1, 'progress updated');
    const p = st2.progress[it.id];
    assert(p.inMistakes && p.due === addDays(d3, MISTAKE_INTERVALS[1]), `after the first re-test: ${JSON.stringify(p)}`);
    if (session.itemIds.length > 1) await finishEarly();
    else {
      await key('Enter');
      await page.locator('.pl-fin').waitFor({ timeout: T.short });
    }
    await waitState((s) => s.plans[d3].blocks[ri].status === 'done', 'review block done');
    await backToToday();
    ctx.retest = it.id;
    return `${due.length} due, ${review.itemIds.length} in 错题重做, re-tested ${it.id}`;
  });

  // ── Day +6: the second spaced re-test clears the item ──
  const d7 = addDays(d3, MISTAKE_INTERVALS[1]);
  if (!ctx.retest) skip('second re-test', 'no item re-tested on the first due day');
  else {
    await openDay(d7);
    await step(`a second spaced confident right answer (${d7}) takes the item out of the mistake book`, async () => {
      const st = await dayPlan(d7);
      const plan = st.plans[d7];
      const X = ctx.retest;
      assert(isDue(st.progress[X], d7), `${X} should be due on ${d7}: ${JSON.stringify(st.progress[X])}`);
      const bi = plan.blocks.findIndex((b) => b.status === 'todo' && b.itemIds.includes(X));
      assert(bi >= 0, `${X} is not in today's plan`);
      await startRow(bi);
      const sid = await waitPlayer();
      const st1 = await waitState((s) => s.sessions[sid], 'session saved');
      const session = st1.sessions[sid];
      const k = session.itemIds.indexOf(X);
      let r = '';
      for (let i = 0; i <= k; i++) {
        await atItem(i, session.itemIds.length);
        const cur = await getState();
        r = await answerRight(cur, session, byId.get(session.itemIds[i]));
        if (i < k) await key('Enter');
      }
      assert(/已移出错题本，这题拿下了/.test(r), `second spaced re-test: "${r}"`);
      await snap('day7-cleared');
      const st2 = await waitState((s) => s.progress[X].inMistakes === false, 'item left the mistake book');
      eq(st2.progress[X].due, undefined, 'no due date once cleared');
      if (k < session.itemIds.length - 1) await finishEarly();
      else {
        await key('Enter');
        await page.locator('.pl-fin').waitFor({ timeout: T.short });
      }
      await backToToday();
      return `${plan.blocks[bi].title}: ${k + 1} answered`;
    });
  }

  // ── A Japanese mock day: real paper padded with originals to exam length ──
  const dMock = addDays(EXAM, -9);
  if (dMock <= d7) skip('Japanese mock day', `${dMock} is not after ${d7}`);
  else {
    await openDay(dMock);
    await step('Japanese reading mock is padded to exam length and timed with mockLimitFor', async () => {
      const st = await dayPlan(dMock);
      const plan = st.plans[dMock];
      eq(plan.phase, 'practice', 'phase');
      const mi = plan.blocks.findIndex((b) => b.kind === 'mock' && b.mock?.kind === 'ja-reading');
      assert(mi >= 0, `no Japanese reading mock: ${plan.blocks.map((b) => b.title).join(' | ')}`);
      const b = plan.blocks[mi];
      const corrections = plan.blocks.filter((x) => x.reviewOfMock).length;
      eq(await page.locator('.td-row.is-locked').count(), corrections, 'correction rows locked until the mock is handed in');
      if (corrections) await waitText('.td-row.is-locked', /模考交卷后解锁/);
      const base = new Set(mockItems(bank, 'ja-reading', b.mock.session).map((x) => x.id));
      const want = JA_FULL['ja-reading'];
      assert(b.itemIds.length >= want && b.itemIds.length <= want + 1, `${b.itemIds.length} items, exam has ${want}`);
      const pads = b.itemIds.filter((id) => !base.has(id));
      const seen = new Set(st.attempts.map((a) => a.itemId));
      assert(pads.every((id) => byId.get(id).source.kind === 'original' && !seen.has(id)), 'padding is never-seen originals');
      assert(pads.length === 0 || b.reason.includes(`补 ${pads.length} 道原创题`), `reason mentions the padding: "${b.reason}"`);
      const meta = await page.locator('.td-row').nth(mi).locator('.td-row-meta').innerText();
      assert(meta.includes(`${b.itemIds.length} 题`), `row count "${meta}"`);
      const li = plan.blocks.findIndex((x) => x.kind === 'mock' && x.mock?.kind === 'ja-listening');
      if (li >= 0) {
        const lb = plan.blocks[li];
        const lbase = new Set(mockItems(bank, 'ja-listening', lb.mock.session).map((x) => x.id));
        const lwant = JA_FULL['ja-listening'];
        assert(lb.itemIds.length >= lwant && lb.itemIds.length <= lwant + 1, `listening mock: ${lb.itemIds.length} items, exam has ${lwant}`);
        const lpads = lb.itemIds.filter((id) => !lbase.has(id));
        assert(lpads.every((id) => byId.get(id).source.kind === 'original' && byId.get(id).section === 'listening' && !seen.has(id)), 'listening padding is never-seen original listening items');
        assert(lpads.every((id) => !b.itemIds.includes(id)), 'reading and listening padding overlap');
        eq(lb.minutes, Math.round(mockLimitFor('ja-listening', lb.itemIds.map((id) => byId.get(id))) / 60), 'listening mock minutes');
      }
      await startRow(mi, '开始模考');
      await confirmModal('模考？', '开始计时');
      const sid = await waitPlayer();
      const st1 = await waitState((s) => s.sessions[sid], 'mock session saved');
      const s = st1.sessions[sid];
      eq(s.kind, 'mock', 'session kind');
      eq(s.exam, true, 'exam mode');
      eq(JSON.stringify(s.itemIds), JSON.stringify(b.itemIds), 'mock items = planned (padded) items');
      const limit = mockLimitFor('ja-reading', s.itemIds.map((id) => byId.get(id)));
      eq(s.timeLimitSec, limit, 'timeLimitSec');
      await atItem(0, b.itemIds.length);
      const left = clockSecs(await text('.pl-countdown .num'));
      assert(left <= limit && left >= limit - 15, `countdown ${left}s for a ${limit}s mock`);
      await snap('mock-start');
      await exitPlayer();
      const st2 = await waitState((x) => x.plans[dMock].blocks[mi].status === 'todo' && !x.sessions[sid], 'untouched mock back to todo');
      eq(st2.mocks.length, 0, 'no mock result recorded');
      return `${b.itemIds.length} items (${pads.length} originals), ${Math.round(limit / 60)} min`;
    });
  }

  // ── The final days: trap sheet and notes ──
  const dFinal = addDays(EXAM, -2);
  await openDay(dFinal);
  await step('final days: no new words, 考前一页纸 lists my traps, 考点速记 walks the notes', async () => {
    const st = await dayPlan(dFinal);
    const plan = st.plans[dFinal];
    eq(plan.phase, 'final', 'phase');
    eq(plan.budgetMinutes, budgetFor(st, dFinal), 'tapered budget');
    const vb = plan.blocks.find((b) => b.kind === 'vocab');
    if (vb) assert(!vb.title.includes('新词'), `no new words in the final days: "${vb.title}"`);
    const ti = plan.blocks.findIndex((b) => b.kind === 'traps');
    const ni = plan.blocks.findIndex((b) => b.kind === 'notes');
    assert(ti >= 0, `no 考前一页纸 block: ${plan.blocks.map((b) => b.title).join(' | ')}`);
    assert(ni >= 0, `no 考点速记 block: ${plan.blocks.map((b) => b.title).join(' | ')}`);

    // Trap sheet: entries come from items answered wrong.
    await startRow(ti);
    await page.waitForURL(/#\/traps\?block=/, { timeout: T.short });
    await page.locator('.tp-entry').first().waitFor({ timeout: T.short });
    const wrongIds = new Set(st.attempts.filter((a) => !a.correct).map((a) => a.itemId));
    const entries = await page.locator('.tp-entry').count();
    const expected = Math.min(25, [...wrongIds].filter((id) => (byId.get(id).explanation.traps?.length || byId.get(id).explanation.keyPoints?.length)).length);
    eq(entries, expected, 'trap entries (one per wrong item with traps/key points, max 25)');
    await snap('final-traps');
    await page.getByRole('button', { name: '看完了' }).click();
    await page.locator('.td-plan').waitFor({ timeout: T.short });
    await waitState((s) => s.plans[dFinal].blocks[ti].status === 'done', 'trap block done');

    // Notes: walk the topics with 下一个考点, finish with 看完了.
    const topics = plan.blocks[ni].noteTopics || [];
    assert(topics.length > 0, 'notes block has topics');
    await startRow(ni);
    await page.waitForURL(/#\/notes\/[^?]+\?block=/, { timeout: T.short });
    await page.locator('.nt-blockbar').waitFor({ timeout: T.short });
    for (let i = 0; i < topics.length - 1; i++) {
      await waitText('.nt-blockbar-title', new RegExp(`${i + 1} / ${topics.length}`));
      await page.locator('.nt-blockbar').getByRole('button', { name: '下一个考点' }).click();
    }
    await waitText('.nt-blockbar-title', new RegExp(`${topics.length} / ${topics.length}`));
    await snap('final-notes');
    await page.locator('.nt-blockbar').getByRole('button', { name: '看完了' }).click();
    await page.locator('.td-plan').waitFor({ timeout: T.short });
    await waitState((s) => s.plans[dFinal].blocks[ni].status === 'done', 'notes block done');
    eq(await page.locator('.td-row.is-done').count(), 2, 'done rows on the final day');

    await page.locator('.sidebar a', { hasText: '词汇' }).first().click();
    await waitText('.vc-hero', /考前最后几天只复习，不加新词/);
    await gotoToday();
    return `${entries} trap entries, ${topics.length} note topics`;
  });

  await step('all blocks resolved → 今天的计划全部完成, 加练 adds one more block', async () => {
    for (let guard = 0; guard < 40; guard++) {
      const skipBtn = page.locator('.td-row.is-todo').first().getByRole('button', { name: '跳过这一块' });
      if (!(await skipBtn.count())) break;
      await skipBtn.click();
    }
    await waitText('.td-hero-done', /今天的计划全部完成/);
    await snap('final-done');
    const before = await getState();
    const n0 = before.plans[dFinal].blocks.length;
    const btn = page.locator('.td-extra-btn:not([disabled])').first();
    await btn.waitFor({ timeout: T.short });
    const name = (await btn.locator('.td-extra-name').innerText()).trim();
    const sub = (await btn.locator('.td-extra-sub').innerText()).trim();
    await btn.click();
    await toastSeen(/已加入/);
    const st = await waitState((x) => x.plans[dFinal].blocks.length === n0 + 1, 'extra block saved');
    const x = st.plans[dFinal].blocks[n0];
    assert(x.extra && x.status === 'todo', `extra block ${JSON.stringify({ extra: x.extra, status: x.status })}`);
    eq(`${x.itemIds.length} 题 · ${x.minutes} 分钟`, sub, 'the picker previewed this block');
    const used = new Set(st.plans[dFinal].blocks.slice(0, n0).flatMap((b) => b.itemIds));
    assert(x.itemIds.every((id) => !used.has(id)), 'extra block repeats items planned today');
    const row = page.locator('.td-row').nth(n0);
    await waitText('.td-row', /加练/);
    await row.getByRole('button', { name: '开始', exact: true }).click();
    const sid = await waitPlayer();
    eq((await waitState((y) => y.sessions[sid], 'extra session saved')).sessions[sid].blockId, x.id, 'extra block opens the player');
    await exitPlayer();
    return `${name}: ${x.title}`;
  });

  // ── Console ──
  dayLabel = '';
  await step('browser console has no errors (all days)', async () => {
    await page.waitForTimeout(500);
    const real = httpErrors.filter((e) => !/\/api\/coach\//.test(e));
    assert(consoleErrors.length === 0 && real.length === 0, [...consoleErrors, ...real].join('\n') || 'errors');
    if (consoleWarnings.length) return `${consoleWarnings.length} warnings, e.g. ${consoleWarnings[0].slice(0, 120)}`;
  });

}

let crashed = null;
try {
  await main();
} catch (e) {
  crashed = e;
  failed++;
  console.log(`FAIL  ${e && e.message ? e.message : e}`);
} finally {
  try {
    await browser?.close();
  } catch {
    /* ignore */
  }
  await stopServer();
}
const passed = results.filter((r) => r.ok && !r.skipped).length;
const skipped = results.filter((r) => r.skipped).length;
console.log(`\n${failed ? 'FAILED' : 'OK'}: ${passed} passed, ${results.filter((r) => !r.ok).length} failed, ${skipped} skipped, ${warnings.length} warnings${crashed ? ' (aborted)' : ''}`);
for (const w of warnings) console.log(`  warn: ${w}`);
if (failed && serverLog.trim()) console.log(`server log:\n${serverLog.trim().split('\n').slice(-15).join('\n')}`);
if (!process.env.E2E_KEEP && !process.env.E2E_TMP && !failed) fs.rmSync(TMP, { recursive: true, force: true });
else console.log(`artifacts: ${TMP}`);
process.exit(failed ? 1 : 0);
