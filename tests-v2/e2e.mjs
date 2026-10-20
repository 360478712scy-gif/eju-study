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
//   day 1   onboarding (one target changed, 7 h) → Today: the plan fits the budget, one hero task and the
//           rest listed in 跟学 order → 跟学模式 (开始跟学, warm-up notes with Enter, the first task 考点速测
//           with the slow-but-right flag, back on the flow page with the next step, 退出跟学) → one task of
//           every kind from Today: science drill (right/wrong/没把握/猜的/不会, E, Enter), resume a task
//           left mid-way, timed science set (exam mode, Enter on the last question goes back to the first
//           empty one, the 交卷 dialog focuses 继续作答, 答题卡, blanks stay fresh) and one that runs out of
//           time (fast-forwarded clock), math mark sheet (keyboard, partial credit, redo with locked
//           groups), reading, listening (audio plays, options hidden), 文型, vocab cards (#/vocab?start=1)
//           → Today reflects it → 预测 agrees across pages → skip (toast 撤销, restore from the folded
//           row) → 调整时长 → 换一套安排 → reload → server restart → leave a task half-done
//   later   the browser clock moves on: 04:00 rollover with the app open, yesterday's half-done task,
//           mistakes due after 2 days, every task skipped via 跟学 → 今天的任务都跳过了 → 全部恢复, a
//           mistake cleared 4 days later, missed mocks re-planned (数理 ① first and handed in blank, then
//           日语 ① padded to exam length on the next day without its own mock), 跟学 跳过复习 in the final
//           days, the last day (no new words, 考前一页纸, 考点速记, everything resolved → 加练)
// The real data/ folder is never written. Prints PASS/FAIL per step (WARN for non-fatal UX issues)
// and exits 1 on any failure; the browser console must stay free of errors.
import { chromium } from '~/Projects/eju-study/node_modules/playwright/index.mjs';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { studyDate, addDays, daysBetween } from '../shared/dates.ts';
import { indexBank, mockItems } from '../shared/bank.ts';
import {
  budgetFor,
  daysLeftOn,
  phaseFor,
  JA_FULL,
  mockDone,
  mockLimitFor,
  mockSchedule,
  shortTopic,
  vocabDueCount,
  vocabQueue,
  vocabSkills,
  vocabToday,
} from '../shared/planner.ts';
import { blankGroups } from '../shared/grading.ts';
import { lockedGroups } from '../shared/actions.ts';
import { isDue, MISTAKE_INTERVALS, SLOW_FACTOR } from '../shared/srs.ts';
import { estimateAll } from '../shared/stats.ts';
import { SUBJECT_NAME, fmtDateShort, fmtMinutes, pct } from '../web/src/lib/format.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A few presentation helpers of the web app (跟学 order, warm-up topics, shown scores, option glosses)
// import "@shared/…": resolve that alias the way Vite does, so the test can use them as its oracle.
registerHooks({
  resolve(spec, context, next) {
    if (spec.startsWith('@shared/')) return next(pathToFileURL(path.join(ROOT, 'shared', spec.slice('@shared/'.length))).href, context);
    return next(spec, context);
  },
});
const { flowOrder, warmupTopics } = await import('../web/src/pages/flow/flowState.ts');
const { shownScore, SCORE_ORDER } = await import('../web/src/pages/today/scores.ts');
const { gloss } = await import('../web/src/pages/vocab/run.ts');

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
/** The study day the browser is on (what the app calls `today`). */
let curDay = '';

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
    // Back to Today (not the 跟学 page) so the next step starts from a known place.
    try {
      if (page && server) {
        await page.evaluate(() => localStorage.removeItem('eju-flow')).catch(() => {});
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
  server = spawn(process.execPath, ['server.mjs'], {
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
  curDay = date;
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

// ── Today: the hero task and the list (rows follow the 跟学 order; the hero task is not a row) ──

const plainNumbers = (s) => s.replace(/\s*([①-⑳])/g, (_, c) => ` ${c.charCodeAt(0) - 0x2460 + 1}`);

/** A task's title as Today, 跟学 and the queue show it (blocks.ts displayTitle): no count, no 限时/加练 prefix. */
function shownTitle(b) {
  return plainNumbers(b.title)
    .replace(/^(加练|限时)\s*·\s*/, '')
    .replace(/^(加练|限时)\s*·\s*/, '')
    .replace(/\s*·\s*(复习|加练)?\s*\d+\s*(题|张卡)?(\s*\+\s*新词\s*\d+)?$/, '')
    .trim();
}

/** The block with this id in the saved state (ids are "<date>:<n>"). */
function B(st, b) {
  return st.plans[b.id.split(':')[0]]?.blocks.find((x) => x.id === b.id);
}

function openSession(st, blockId) {
  return Object.values(st.sessions).find((s) => s.blockId === blockId && !s.finishedAt);
}

/** Status as Today shows it: a mock's correction stays locked until the mock is handed in. */
function viewOf(st, b) {
  if (b.status === 'todo' && b.reviewOfMock && !mockDone(st, b.reviewOfMock.kind, b.reviewOfMock.session)) return 'locked';
  return b.status;
}

/** What Today should show (TodayPage): the hero task, the pending rows and the finished ones, in 跟学 order. */
function todayLayout(st, date) {
  const blocks = st.plans[date]?.blocks ?? [];
  const ordered = flowOrder(blocks);
  const views = ordered.map((b) => viewOf(st, b));
  const s = st.activeSessionId ? st.sessions[st.activeSessionId] : undefined;
  const open = s && !s.finishedAt ? s : undefined;
  const openIdx = open?.blockId ? ordered.findIndex((b) => b.id === open.blockId) : -1;
  const fresh = !!open && (openIdx >= 0 || studyDate(new Date(open.startedAt)) === date);
  const activeIdx = views.indexOf('active');
  const nextIdx = openIdx >= 0 && fresh ? openIdx : activeIdx >= 0 ? activeIdx : views.indexOf('todo');
  const heroIdx = fresh && openIdx < 0 ? -1 : nextIdx;
  const pick = (want) => ordered.filter((_, i) => i !== heroIdx && want.includes(views[i]));
  return {
    ordered,
    hero: heroIdx >= 0 ? ordered[heroIdx] : null,
    pending: pick(['todo', 'active', 'locked']),
    finished: pick(['done', 'skipped']),
    counted: ordered.filter((_, i) => views[i] !== 'skipped'),
  };
}

const pendingRows = () => page.locator('.td-plan .td-row:not(.is-done):not(.is-skipped)');

/** Row titles without their badges (加练 / 真题整卷). */
async function titlesOf(loc) {
  return loc.evaluateAll((els) =>
    els.map((el) => {
      const t = el.querySelector('.list-row-title');
      if (!t) return '';
      return [...t.childNodes]
        .filter((n) => !(n instanceof Element && n.classList.contains('td-row-badge')))
        .map((n) => n.textContent)
        .join('')
        .trim();
    }),
  );
}

/** Open the folded groups of Today's list (其余 N 项 / 明天继续 / 已完成 · 已跳过) whose title matches `re`. */
async function unfold(re = /./) {
  for (let g = 0; g < 6; g++) {
    const f = page.locator('.td-plan .td-fold:not(.is-open)').filter({ hasText: re });
    if (!(await f.count())) return;
    await f.first().click();
  }
}

/** Tasks on Today: the hero task plus every row, with all groups unfolded. */
async function todayCount() {
  await unfold();
  return (await page.locator('.td-hero .td-hero-step').count()) + (await page.locator('.td-plan .td-row').count());
}

/** The row of a pending task. */
async function rowOf(st, b, date = curDay) {
  const L = todayLayout(st, date);
  const k = L.pending.findIndex((x) => x.id === b.id);
  assert(k >= 0, `"${b.title}" is not a pending row on Today (status ${B(st, b)?.status}${L.hero?.id === b.id ? ', it is the hero task' : ''})`);
  await unfold(/其余|明天继续/);
  const row = pendingRows().nth(k);
  eq((await titlesOf(row))[0], shownTitle(b), `row ${k + 1} title`);
  return row;
}

/** Start (or continue) a task from Today the way the learner would: the hero's 只做这一项, or a click on its row. */
async function startTask(b, date = curDay) {
  await page.locator('.td-plan').waitFor({ timeout: T.short });
  const st = await getState();
  const cur = B(st, b);
  assert(cur, `no block ${b.id}`);
  const L = todayLayout(st, date);
  const resumed = !!openSession(st, b.id);
  if (L.hero?.id === b.id) {
    eq(await text('.td-hero-title'), shownTitle(cur), 'hero title');
    const hero = page.locator('.td-hero');
    const only = hero.getByRole('button', { name: /^只做这(一项|场模考)$/ });
    if (await only.count()) await only.click();
    else await hero.locator('.td-hero-actions .btn-primary').click();
  } else {
    await (await rowOf(st, cur, date)).click();
  }
  if (cur.kind === 'mock' && !resumed) await confirmModal('模考？', '开始计时');
}

/** Skip a pending task with its row's hover action. */
async function skipRow(b, date = curDay) {
  const row = await rowOf(await getState(), b, date);
  await row.hover();
  await row.locator('.td-row-skip').click();
}

async function gotoToday() {
  await page.locator('.sidebar a', { hasText: '今日' }).first().click();
  await page.locator('.td-plan').waitFor({ state: 'visible', timeout: T.short });
}

/** 跟学: skip the warm-up and every task until the finish card. */
async function skipAllWithFlow() {
  await page.locator('.td-hero').getByRole('button', { name: /^(开始跟学|跟学剩下的)$/ }).click();
  await page.locator('.fl').waitFor({ timeout: T.short });
  const skipReview = page.locator('.fl-card').getByRole('button', { name: '跳过复习' });
  if (await skipReview.count()) await skipReview.click();
  for (let guard = 0; guard < 40; guard++) {
    if (await page.locator('.fl-finish').isVisible()) break;
    const btn = page.locator('.fl-card').getByRole('button', { name: '跳过这一项' });
    await btn.waitFor({ timeout: T.short });
    const before = `${await text('.fl-card .fl-eyebrow')}|${await text('.fl-card .fl-title')}`;
    await btn.click();
    await poll(
      async () => (await page.locator('.fl-finish').isVisible()) || `${await text('.fl-card .fl-eyebrow')}|${await text('.fl-card .fl-title')}` !== before,
      'the next step after 跳过这一项',
    );
  }
  await page.locator('.fl-finish').waitFor({ timeout: T.short });
}

async function exitFlow() {
  await page.locator('.fl-top').getByRole('button', { name: '退出跟学' }).click();
  await page.locator('.td-plan').waitFor({ state: 'visible', timeout: T.short });
}

// ── Player ──

const WRONG = /这题记下了|答错了/;

async function waitPlayer() {
  await page.waitForURL(/#\/session\//, { timeout: T.short });
  await page.locator('.pl-top').waitFor({ state: 'visible', timeout: T.short });
  return sessionIdFromUrl();
}

/** The top bar's "3 / 14" (no counter on a one-question set). */
async function atItem(i, n) {
  if (n > 1) await waitText('.pl-count', new RegExp(`^\\s*${i + 1}\\s*/\\s*${n}\\s*$`));
  else await page.locator('.pl-top').waitFor({ timeout: T.short });
}

/** Choose option i with its digit key (options printed ⓪①… start at 0). */
async function choose(i) {
  const base = (await page.locator('.pl-opt-badge').first().innerText()).trim() === '0' ? 0 : 1;
  if (i + base <= 9) await key(String(i + base));
  else await page.locator('.pl-opt').nth(i).click();
  await page.locator('.pl-opt.is-chosen').first().waitFor({ timeout: T.short });
}

async function submitAndWaitResult() {
  await key('Enter');
  await page.locator('.pl-res').waitFor({ state: 'visible', timeout: T.short });
  return text('.pl-res');
}

async function finishEarly() {
  await page.locator('.pl-top').getByRole('button', { name: '结束', exact: true }).click();
  await confirmModal('结束这一组', '结束');
  await page.locator('.pl-fin').waitFor({ state: 'visible', timeout: T.short });
}

/** The summary's first stat tile, e.g. "答对12/14题". */
async function finStat() {
  return (await page.locator('.pl-fin-stats .stat-tile').first().innerText()).replace(/\s+/g, '');
}

async function backToToday() {
  await page.locator('.pl-fin-top').getByRole('button', { name: '回到今日' }).click();
  await page.locator('.td-plan').waitFor({ state: 'visible', timeout: T.short });
}

async function exitPlayer() {
  await page.locator('.pl-top').getByRole('button', { name: '退出（进度会保存）' }).click();
  await page.locator('.td-plan').waitFor({ state: 'visible', timeout: T.short });
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
const markShow = (c) => (c === '-' ? '−' : c);

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
      const mathTarget = page.getByLabel('数学目标', { exact: true });
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

  // ── 3. Today's plan fits the budget; one hero task, the rest in 跟学 order ──
  await step(
    'Today: a plan whose minutes match the 7 h budget; the first task leads, the rest are listed in 跟学 order',
    async () => {
      const st = await getState();
      const plan = st.plans[today];
      const budget = budgetFor(st, today);
      eq(plan.budgetMinutes, budget, 'plan.budgetMinutes');
      eq(plan.phase, phaseFor(daysLeftOn(st, today)), 'plan.phase');
      if (daysLeftOn(st, today) > 3) eq(budget, 420, 'budget for a normal day');
      const sum = plan.blocks.reduce((s, b) => s + b.minutes, 0);
      assert(Math.abs(sum - budget) <= 15, `planned ${sum} min vs budget ${budget} min`);
      const n = plan.blocks.length;
      const L = todayLayout(st, today);
      await waitText('.td-plan .card-sub', new RegExp(`今天共 ${n} 项 · 约 ${reEsc(fmtMinutes(sum))}`));
      await waitText('.td-pg-count', new RegExp(`0 / ${n} 项`));
      await waitText('.td-progress .td-pg-line', new RegExp(`计划 ${reEsc(fmtMinutes(sum))}`)); // the tasks' own total, as in the list and 跟学
      eq(await text('.td-title'), '从第 1 项开始吧', 'headline');
      eq(await text('.td-hero-title'), shownTitle(L.hero), 'the hero is the first task in 跟学 order');
      await waitText('.td-hero-step', new RegExp(`第 1 项 · 共 ${n} 项`));
      await page.locator('.td-hero').getByRole('button', { name: '开始跟学' }).waitFor({ timeout: T.short });
      await page.locator('.td-hero').getByRole('button', { name: '只做这一项' }).waitFor({ timeout: T.short });
      // Three rows, the rest folded under "其余 N 项".
      eq(await pendingRows().count(), Math.min(3, L.pending.length), 'rows before unfolding');
      if (L.pending.length > 3) await waitText('.td-plan .td-fold', new RegExp(`其余 ${L.pending.length - 3} 项`));
      await unfold(/其余/);
      eq(JSON.stringify(await titlesOf(pendingRows())), JSON.stringify(L.pending.map(shownTitle)), 'rows in 跟学 order');
      // Every row shows its size: questions (or cards) and minutes.
      const vocabCards = vocabQueue(st, bank, today, vocabToday(st, bank, today).newWords).length;
      for (const [i, b] of L.pending.entries()) {
        const size = await pendingRows().nth(i).locator('.td-row-size').innerText();
        const count = b.kind === 'vocab' ? `${vocabCards} 张卡` : `${b.itemIds.length} 题`;
        assert(size.includes(fmtMinutes(b.minutes)) && size.includes(count), `row ${i + 1} (${b.title}): "${size}", expected ${count} · ${fmtMinutes(b.minutes)}`);
      }
      const vb = plan.blocks.find((b) => b.kind === 'vocab');
      if (vb) eq(vb.vocabCount, vocabCards, 'vocab task = the cards the engine schedules today');
      ctx.plan = plan;
      await snap('today-start');
      const kinds = L.ordered.map((b) => `${b.kind}${b.timed ? '(限时)' : ''}:${b.subject}`);
      return `${n} tasks, ${sum}/${budget} min: ${kinds.join(', ')}`;
    },
    { critical: true },
  );

  const blocks = ctx.plan.blocks;
  const find = (f) => blocks.find(f);
  const expect = { done: 0, answered: 0 };
  const isRecall = (b) => b.title.includes('考点速测');
  const isGrammar = (b) => b.title.includes('文型');
  const isSci = (b) => b.subject === 'physics' || b.subject === 'chemistry';
  // One real-time wait checks the item clock and the "slow but correct" flag (1.8 × target).
  let slowDone = false;

  /** Answer the current item slowly (real time) and right; checks seconds, banner and progress.slow. */
  async function slowRight(sid, it) {
    const linger = Math.ceil(SLOW_FACTOR * it.targetSec) + 3;
    // Keep the mouse moving now and then, as a person thinking would.
    for (let t = 0; t < linger; t += 10) {
      await page.waitForTimeout(Math.min(10, linger - t) * 1000);
      await page.mouse.move(400 + (t % 50), 400);
    }
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

  // ── 4. 跟学模式: the first task of the day (考点速测) through the follow-along page ──
  {
    const L0 = todayLayout(await getState(), today);
    const first = L0.hero;
    await step(`跟学模式: 开始跟学 → warm-up notes (Enter) → first task ${first.title} (compact card, slow-but-right flag, wrong → back in 2 days) → the flow page shows the next step → 退出跟学`, async () => {
      const st0 = await getState();
      const L = todayLayout(st0, today);
      const n = L.counted.length;
      const topics = warmupTopics(st0, bank, st0.plans[today].blocks);
      await waitText('.td-hero-flow-desc', topics.length ? new RegExp(`先复习 ${topics.length} 个考点，再按顺序做完 ${n} 项`) : new RegExp(`按顺序做完这 ${n} 项`));
      await page.locator('.td-hero').getByRole('button', { name: '开始跟学' }).click();
      await page.locator('.fl').waitFor({ timeout: T.short });
      await waitText('.fl-top-count', new RegExp(`完成\\s*0\\s*/${n}\\s*项`));
      await snap('flow-warmup');
      // Warm-up: the weakest topics today's tasks practise; Enter moves on.
      for (let i = 0; i < topics.length; i++) {
        await waitText('.fl-dots-num', new RegExp(`^${i + 1}/${topics.length}$`));
        eq(await text('.fl-card .fl-title'), shortTopic(bank, topics[i]), `warm-up topic ${i + 1}`);
        if (i === topics.length - 1) await page.locator('.fl-go', { hasText: '复习完了，开始做题' }).waitFor({ timeout: T.short });
        await key('Enter');
      }
      await waitText('.fl-card .fl-eyebrow', new RegExp(`下一步\\s*第 1 项 · 共 ${n} 项`));
      eq(await text('.fl-card .fl-title'), shownTitle(first), 'first step = the first task in 跟学 order');
      const queue = (await page.locator('.fl-q .fl-q-text').allInnerTexts()).map((s) => s.trim());
      eq(JSON.stringify(queue), JSON.stringify([...(topics.length ? ['复习考点'] : []), ...L.ordered.map(shownTitle)]), '今天的顺序 (queue)');
      await snap('flow-next');
      await key('Enter');
      const sid = await waitPlayer();
      const st1 = await waitState((s) => s.sessions[sid], 'session saved');
      eq(st1.sessions[sid].blockId, first.id, 'Enter starts the first task');
      const ids = st1.sessions[sid].itemIds;
      let note = '';
      if (isRecall(first)) {
        eq(first.subject, 'mixed', 'recall block subject');
        assert(ids.every((id) => id.startsWith('recall-')), 'only recall-… items');
        await page.locator('.pl-col.is-single').waitFor({ timeout: T.short });
      }
      const it0 = byId.get(ids[0]);
      if (!FAST && it0.format === 'choice') note = `slow answer after ${await slowRight(sid, it0)}s`;
      else if (it0.format === 'choice') {
        await choose(it0.answer);
        assert(/回答正确/.test(await submitAndWaitResult()), 'item 1 right');
      } else throw new Error(`first task starts with a ${it0.format} item`);
      await snap('recall-slow');
      await key('Enter');
      await atItem(1, ids.length);
      const it1 = byId.get(ids[1]);
      await choose(wrongOf(it1));
      const r1 = await submitAndWaitResult();
      assert(WRONG.test(r1) && /正确答案/.test(r1), `expected a wrong-answer banner with 正确答案, got "${r1}"`);
      assert(r1.includes(`${MISTAKE_INTERVALS[0]} 天后再练`), `expected "${MISTAKE_INTERVALS[0]} 天后再练", got "${r1}"`);
      await finishEarly();
      assert((await finStat()).includes('1/2题'), `答对 stat "${await finStat()}" should be 1 / 2`);
      const st = await waitState((s) => B(s, first).status === 'done', 'task marked done');
      const p1 = st.progress[it1.id];
      assert(p1?.inMistakes && p1.due === addDays(today, MISTAKE_INTERVALS[0]), `wrong item progress ${JSON.stringify(p1)}`);
      expect.done++;
      expect.answered += 2;

      // Back on the flow page: what was just done, and the next step.
      await page.locator('.pl-fin-top').getByRole('button', { name: '回到今日' }).click();
      await page.locator('.fl').waitFor({ timeout: T.short });
      const L2 = todayLayout(st, today);
      await waitText('.fl-done-line', new RegExp(`完成了「${reEsc(shownTitle(first))}」\\s*·\\s*对 1/2`));
      await waitText('.fl-card .fl-eyebrow', new RegExp(`下一步\\s*第 2 项 · 共 ${n} 项`));
      eq(await text('.fl-card .fl-title'), shownTitle(L2.hero), 'the next step');
      await waitText('.fl-top-count', new RegExp(`完成\\s*1\\s*/${n}\\s*项`));
      await page.locator('.fl-card').getByRole('button', { name: '休息 5 分钟' }).waitFor({ timeout: T.short });
      await snap('flow-after');
      await exitFlow();
      eq(await page.evaluate(() => localStorage.getItem('eju-flow')), null, '跟学 memo after 退出跟学');
      eq(await text('.td-hero-title'), shownTitle(L2.hero), 'Today leads with the same next task');
      return note;
    });
  }

  // ── 5. Science choice drill, all the way through ──
  const sciB = find((b) => b.kind === 'drill' && isSci(b) && !b.timed);
  if (!sciB) skip('science drill', 'no untimed physics/chemistry drill today');
  else
    await step(`science drill (${sciB.title}): answer, result, E, Enter, finish`, async () => {
      await startTask(sciB);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      const s0 = st0.sessions[sid];
      eq(s0.exam, false, 'practice drill is not exam mode');
      eq(s0.blockId, sciB.id, 'session of the clicked task');
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
          assert(WRONG.test(r) && /正确答案/.test(r), `expected a wrong-answer banner with 正确答案, got "${r}"`);
          await page.locator('.pl-excard.is-open').waitFor({ timeout: T.short });
          await page.locator('.pl-opt.is-right').waitFor({ timeout: T.short });
          await page.locator('.pl-opt.is-wrong').waitFor({ timeout: T.short });
          assert(r.includes(`${MISTAKE_INTERVALS[0]} 天后再练`), `expected "${MISTAKE_INTERVALS[0]} 天后再练", got "${r}"`);
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
          // The mouse way: click an option, then 提交.
          await page.locator('.pl-opt').nth(it.answer).click();
          await page.locator('.pl-opt.is-chosen').waitFor({ timeout: T.short });
          await page.locator('.pl-submit').click();
          await page.locator('.pl-res').waitFor({ state: 'visible', timeout: T.short });
          const r = await text('.pl-res');
          assert(/回答正确/.test(r), `click + 提交: "${r}"`);
          correct++;
        } else if (i === 3) {
          // "不会，看解析" without choosing.
          await page.getByRole('button', { name: '不会，看解析' }).click();
          await page.locator('.pl-res').waitFor({ timeout: T.short });
          const r = await text('.pl-res');
          assert(/看懂解析/.test(r), `gave-up banner: "${r}"`);
          assert(new RegExp(`已记入错题本 · ${MISTAKE_INTERVALS[0]} 天后再练`).test(r), `gave-up goes to the mistake book: "${r}"`);
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
      const title = await text('.pl-fin-title');
      if (/错题本/.test(title)) assert(title.includes('错的 2 题已排进错题本'), `summary title "${title}"`);
      else await waitText('.pl-fin-sub', new RegExp(`错的 2 题已经进了错题本，${MISTAKE_INTERVALS[0]} 天后再练`));
      await snap('drill-summary');
      const stat = await finStat();
      assert(stat.includes(`${correct}/${N}题`), `答对 stat "${stat}" should be ${correct} / ${N}`);
      eq(await page.locator('.pl-fin-list:not(.pl-fin-right) .list-row').count(), 2, 'items to look at again (wrong + gave up)');
      const st = await waitState((s) => B(s, sciB).status === 'done', 'block marked done');
      const b = B(st, sciB);
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
  const sci2B = find((b) => b.id !== sciB?.id && b.kind === 'drill' && isSci(b) && !b.timed);
  if (!sci2B) skip('resume a task', 'only one untimed science drill today');
  else
    await step('leave a drill mid-way: Today leads with 继续上次, resume, finish', async () => {
      await startTask(sci2B);
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
      eq(await text('.td-hero-title'), shownTitle(sci2B), 'the task left mid-way leads Today');
      await waitText('.td-hero-progress', new RegExp(`已做\\s*1/${ids.length}`));
      eq(await text('.td-title'), `继续专项练习 · 还剩 ${ids.length - 1} 题`, 'headline');
      await snap('today-resume');
      await page.locator('.td-hero').getByRole('button', { name: '继续', exact: true }).click();
      eq(await waitPlayer(), sid, 'resumed the same session');
      await atItem(1, ids.length);
      await finishEarly();
      await waitState((s) => B(s, sci2B).status === 'done', 'block marked done');
      expect.done++;
      expect.answered += 1;
      await backToToday();
    });

  // ── 7. Timed science set: exam mode until 交卷 ──
  const timedB = find((b) => b.kind === 'drill' && isSci(b) && b.timed);
  if (!timedB) skip('timed science set', 'no timed physics/chemistry set today');
  else
    await step(`timed science set (${timedB.title}): silent until 交卷, Enter on the last question goes back to the first empty one, the 交卷 dialog focuses 继续作答, 答题卡, blanks stay fresh`, async () => {
      await startTask(timedB);
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
      const left0 = clockSecs(await text('.pl-countdown-value'));
      assert(left0 <= limit && left0 >= limit - 15, `countdown ${left0}s at the start of a ${limit}s set`);
      eq(await page.locator('.pl-top').getByRole('button', { name: '结束', exact: true }).count(), 0, '结束 button in exam mode');
      const blanks = new Set([2, N - 1]);
      for (let i = 0; i < N; i++) {
        const it = byId.get(ids[i]);
        await atItem(i, N);
        if (i === 1) {
          await choose(wrongOf(it));
          await key('f');
          await page.locator('.pl-flag.is-on').waitFor({ timeout: T.short });
        } else if (!blanks.has(i)) await choose(it.answer);
        // Exam mode: nothing gives the answer away.
        eq(await page.locator('.pl-res').count(), 0, `result banner on item ${i + 1}`);
        eq(await page.locator('.pl-excard').count(), 0, `explanation on item ${i + 1}`);
        eq(await page.locator('.pl-opt.is-right, .pl-opt.is-wrong').count(), 0, `right/wrong marks on item ${i + 1}`);
        if (i === 1) await snap('timed-answered');
        await key('Enter');
      }
      // Enter on the last question goes back to the first empty one instead of asking to hand in.
      await atItem(2, N);
      await toastSeen(/还有 2 题没作答，先回到第 3 题/);
      eq(await page.locator('.modal').count(), 0, 'no 交卷 dialog while questions are still empty');
      // 交卷 from the top bar: the dialog focuses 继续作答, so an extra Enter does not hand in.
      await page.locator('.pl-top').getByRole('button', { name: '交卷', exact: true }).click();
      const confirm = page.locator('.modal').filter({ hasText: '现在交卷' });
      await confirm.waitFor({ timeout: T.short });
      const body = (await confirm.innerText()).replace(/\s+/g, ' ');
      assert(/还有 2 题没作答，没做的不进错题本/.test(body), `交卷 dialog: "${body}"`);
      await poll(() => page.evaluate(() => (document.activeElement?.textContent || '').trim() === '继续作答'), 'the 交卷 dialog focuses 继续作答');
      await key('Enter');
      await confirm.waitFor({ state: 'detached', timeout: T.short });
      await page.waitForTimeout(300);
      assert(!(await getState()).sessions[sid].finishedAt, 'Enter in the 交卷 dialog must not hand in');
      // The answer sheet: answered / flagged / empty.
      const sheetBtn = page.locator('.pl-top').getByRole('button', { name: '答题卡' });
      const focusBefore = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 90) ?? 'none');
      await sheetBtn.click();
      const sheet = page.locator('.modal').filter({ has: page.locator('.pl-xs-grid') });
      await sheet.waitFor({ timeout: T.short });
      const legend = (await sheet.locator('.pl-xs-legend').innerText()).replace(/\s+/g, '');
      assert(legend.includes(`已作答${N - 2}`) && legend.includes('未作答2') && legend.includes('已标记1'), `answer sheet legend "${legend}"`);
      eq(await sheet.locator('.pl-xs-cell.is-todo').count(), 2, 'empty cells on the answer sheet');
      await snap('timed-sheet');
      await sheet.locator('.modal-foot').getByRole('button', { name: '继续作答' }).click();
      await sheet.waitFor({ state: 'detached', timeout: T.short });
      const focused = await page.evaluate(() => (document.activeElement?.tagName === 'BUTTON' ? (document.activeElement.textContent || '').trim() : ''));
      if (/答题卡/.test(focused))
        warn(`after 答题卡 → 继续作答, focus returns to the 答题卡 button, so the next Enter re-opens the sheet instead of 下一题/交卷 (focused before opening: ${focusBefore})`);
      // Hand in from the answer sheet.
      await sheetBtn.click();
      await sheet.waitFor({ timeout: T.short });
      await sheet.locator('.modal-foot').getByRole('button', { name: '交卷', exact: true }).click();
      await confirm.waitFor({ timeout: T.short });
      await confirm.locator('.modal-foot').getByRole('button', { name: '交卷', exact: true }).click();
      await page.locator('.pl-fin').waitFor({ state: 'visible', timeout: T.short });
      await waitText('.pl-fin-eyebrow', /已交卷/);
      const correct = N - 3;
      const stat = await finStat();
      assert(stat.includes(`${correct}/${N}题`), `答对 stat "${stat}" should be ${correct} / ${N} (the whole set)`);
      eq(await page.locator('.pl-fin-list:not(.pl-fin-right) .list-row').count(), 3, 'items to look at again (1 wrong + 2 blank)');
      eq(await page.locator('.pl-fin-verdict.is-blank').count(), 2, 'blank verdicts');
      await waitText('.pl-fin-sub', /没来得及做的 2 题不进错题本，之后还会出现/);
      await snap('timed-summary');
      const st = await waitState((s) => B(s, timedB).status === 'done', 'block marked done');
      const b = B(st, timedB);
      eq(b.result.answered, N, 'block.result.answered (a timed set counts the whole set)');
      eq(b.result.correct, correct, 'block.result.correct');
      const atts = st.attempts.filter((a) => a.sessionId === sid);
      eq(atts.length, N - 2, 'attempts at 交卷 (blanks are not attempts)');
      for (const i of blanks) {
        const a = st.sessions[sid].answers[ids[i]];
        assert(a && a.submitted && a.response === null && !a.correct, `blank item ${i + 1} answer ${JSON.stringify(a)}`);
        assert(!atts.some((x) => x.itemId === ids[i]), `blank item ${i + 1} has an attempt`);
        assert(!st.progress[ids[i]]?.inMistakes, `blank item ${i + 1} must stay fresh, not in the mistake book: ${JSON.stringify(st.progress[ids[i]])}`);
      }
      const w = st.progress[ids[1]];
      assert(w.inMistakes && w.due === addDays(today, MISTAKE_INTERVALS[0]), `wrong item progress ${JSON.stringify(w)}`);
      expect.done++;
      expect.answered += N - 2;
      await backToToday();
      return `${correct}/${N} right, ${limit}s limit`;
    });

  // ── 7b. A timed set that runs out of time (the browser clock is fast-forwarded) ──
  const timed2B = find((b) => b.id !== timedB?.id && b.kind === 'drill' && isSci(b) && b.timed);
  if (!timed2B) skip('timed set time-up', 'no second timed science set today');
  else
    await step(`timed set runs out (${timed2B.title}): skip nudge after 2× target, auto 交卷 at 0:00`, async () => {
      await startTask(timed2B);
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
      await page.locator('.pl-nudge').getByRole('button', { name: '跳过' }).click();
      await atItem(1, N);
      await choose(byId.get(ids[1]).answer);
      // Run the clock out.
      for (let k = 0; k < Math.ceil(limit / 3) + 20 && !(await page.locator('.pl-fin').isVisible()); k++) await page.clock.fastForward(3000);
      await page.locator('.pl-fin').waitFor({ state: 'visible', timeout: T.short });
      await toastSeen(/时间到，已自动交卷/);
      await waitText('.pl-fin-eyebrow', /已交卷/);
      const st = await waitState((s) => B(s, timed2B).status === 'done', 'block marked done');
      const s1 = st.sessions[sid];
      assert(s1.finishedAt, 'session finished');
      assert(s1.elapsedSec >= limit && s1.elapsedSec <= limit + 6, `elapsed ${s1.elapsedSec}s for a ${limit}s limit`);
      const b = B(st, timed2B);
      eq(b.result.answered, N, 'block.result.answered (the whole set)');
      eq(b.result.correct, 1, 'right before time ran out');
      const atts = st.attempts.filter((a) => a.sessionId === sid);
      eq(atts.length, 1, 'attempts at auto 交卷 (only the answered question)');
      assert(st.sessions[sid].answers[ids[0]].seconds >= 2 * it0.targetSec, 'time on the skipped question is kept');
      const inBook = ids.filter((id, i) => i !== 1 && st.progress[id]?.inMistakes);
      eq(inBook.length, 0, `questions left empty when time ran out are in the mistake book (${inBook.join(', ')})`);
      expect.done++;
      expect.answered += 1;
      await backToToday();
      return `${limit}s limit, 1/${N} answered`;
    });

  // ── 8. Math: the EJU mark sheet by keyboard, partial credit, then redo only the wrong groups ──
  const mathB = find((b) => b.kind === 'drill' && b.subject === 'math' && !b.timed);
  if (!mathB) skip('math mark sheet', 'no math drill today');
  else
    await step(`math task (${mathB.title}): mark sheet by keyboard, partial credit, redo locks the right groups`, async () => {
      await startTask(mathB);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      const it = byId.get(st0.sessions[sid].itemIds[0]);
      eq(it.format, 'blanks', 'first math item format');
      // The sheet lists the groups in letter order.
      const groups = [...blankGroups(it)].sort((a, b) => a.localeCompare(b));
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
      const cell = (l) => page.locator('.pl-cell').filter({ has: page.locator('.pl-cell-letter', { hasText: new RegExp(`^${l}$`) }) });
      for (const l of letters) eq(await cell(l).getAttribute('aria-label'), `格子 ${l}：${typed[l]}`, `cell ${l}`);
      // The draft is saved before submitting (survives closing the window).
      await waitState((s) => JSON.stringify(s.sessions[sid].answers[it.id]?.response) === JSON.stringify(typed), 'mark-sheet draft saved', 6000);

      const r = await submitAndWaitResult();
      assert(new RegExp(`对了 ${half} / ${groups.length} 组`).test(r), `expected 对了 ${half} / ${groups.length} 组, got "${r}"`);
      assert((await page.locator('.pl-res').getAttribute('class')).includes('tone-warning'), 'partial credit uses the warning tone');
      await waitText('.pl-sheet-count', new RegExp(`对 ${half} / ${groups.length} 组`));
      eq(await page.locator('.pl-grp.is-wrong').count(), groups.length - half, 'wrong groups on the sheet');
      // Every cell now shows the right digit; a wrong one keeps what was typed.
      eq(await page.locator('.pl-cell.is-wrong').count(), groups.length - half, 'wrong cells');
      for (const [gi, g] of groups.entries())
        for (const [li, l] of [...g].entries()) {
          const want = `格子 ${l}：正确 ${markShow(it.blanks[l])}${gi >= half && li === 0 ? `，你填了 ${markShow(typed[l])}` : ''}`;
          eq(await cell(l).getAttribute('aria-label'), want, `graded cell ${l}`);
        }
      await snap('math-partial');
      const st1 = await waitState((s) => s.sessions[sid].answers[it.id]?.submitted, 'answer graded');
      const a = st1.sessions[sid].answers[it.id];
      assert(Math.abs(a.score - half / groups.length) < 1e-9 && a.correct === false, `score ${a.score}, correct ${a.correct}`);

      await finishEarly();
      await waitText('.pl-fin-pct-label', /按组得分/);
      await waitText('.pl-fin-pct', new RegExp(`^${Math.round((half / groups.length) * 100)}`));
      await snap('math-summary');
      await waitState((s) => B(s, mathB).status === 'done', 'block marked done');
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
      // Locks follow the stem order up to the first wrong group (`groups` above is sorted for typing).
      const wrongGroups = new Set(groups.slice(half));
      const lockedLetters = [];
      for (const g of blankGroups(it)) {
        if (wrongGroups.has(g)) break;
        lockedLetters.push(...g);
      }
      eq(JSON.stringify(Object.keys(locks).sort()), JSON.stringify([...lockedLetters].sort()), 'lockedGroups = the groups before the first wrong one');
      await waitText('.pl-sheet-lock', /上次已答对/);
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
  const readB = find((b) => b.kind === 'reading' && !isGrammar(b) && !b.timed);
  if (!readB) skip('reading task', 'no reading task today');
  else
    await step(`Japanese reading (${readB.title}): passage + question, right and wrong answers`, async () => {
      await startTask(readB);
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
      assert(WRONG.test(await submitAndWaitResult()), 'reading item 2 wrong');
      await finishEarly();
      assert((await finStat()).includes('1/2题'), `答对 stat "${await finStat()}"`);
      await waitState((s) => B(s, readB).status === 'done', 'block marked done');
      expect.done++;
      expect.answered += 2;
      await backToToday();
    });

  // ── 10. Listening ──
  const listenB = find((b) => b.kind === 'listening');
  if (!listenB) skip('listening task', 'no listening task today');
  else
    await step('listening task: audio plays, option texts hidden until submitted', async () => {
      await startTask(listenB);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      eq(st0.sessions[sid].blockId, listenB.id, 'session of the first listening task');
      const ids = st0.sessions[sid].itemIds;
      // A pure listening question (options only in the recording) — 聴読解 shows them in the figure.
      const k = ids.findIndex((id) => byId.get(id).section === 'listening');
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
      // Playing: the button turns into 暂停 and the status shows the running time.
      await page.locator('.pl-audio.is-playing .pl-audio-btn[aria-label="暂停"]').waitFor({ timeout: T.short });
      await key(' ');
      await waitText('.pl-audio-status', /已暂停/);
      eq(await page.locator('.pl-audio.is-playing').count(), 0, 'playing state after Space');
      const paused = await page.evaluate((src) => window.__plays.filter((p) => p.src.endsWith(src)).pop().el.paused, it.audio.src);
      assert(paused, 'Space pauses the clip');

      await choose(it.answer);
      assert(/回答正确/.test(await submitAndWaitResult()), 'listening item right');
      eq(await page.locator('.pl-opt-text').count(), it.options.length, 'option texts after submitting');
      await waitText('.pl-opts', new RegExp(reEsc(it.options[it.answer].replace(/\$[^$]*\$/g, '').slice(0, 6))));
      await snap('listening-after');
      await finishEarly();
      await waitState((s) => B(s, listenB).status === 'done', 'block marked done');
      expect.done++;
      expect.answered += k + 1;
      await backToToday();
      return `played to ${play.t.toFixed(1)}s`;
    });

  // ── 11. 文型 (grammar) ──
  const gramB = find(isGrammar);
  if (!gramB) skip('文型 task', 'no grammar task today');
  else
    await step(`文型 task (${gramB.title}): sentence + question on one card, right and wrong`, async () => {
      eq(gramB.kind, 'reading', 'grammar block kind');
      await startTask(gramB);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      const ids = st0.sessions[sid].itemIds;
      assert(ids.every((id) => byId.get(id).topic.startsWith('ja.vocab')), 'only ja.vocab items');
      await page.locator('.pl-col.is-single').waitFor({ timeout: T.short });
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
      assert(WRONG.test(await submitAndWaitResult()), 'grammar item 2 wrong');
      await finishEarly();
      assert((await finStat()).includes('1/2题'), `答对 stat "${await finStat()}"`);
      await waitState((s) => B(s, gramB).status === 'done', 'block marked done');
      expect.done++;
      expect.answered += 2;
      await backToToday();
      return note;
    });

  // ── 12. Vocabulary ──
  const vocabB = find((b) => b.kind === 'vocab');
  if (!vocabB) skip('vocab task', 'no vocab task today');
  else
    await step('vocab task (#/vocab?start=1): type kana readings, choose meanings, finish the run', async () => {
      const st0 = await getState();
      const engine = vocabQueue(st0, bank, today, vocabToday(st0, bank, today).newWords);
      await startTask(vocabB);
      await page.locator('.vc-focus .vc-stage').waitFor({ state: 'visible', timeout: T.short });
      await poll(async () => !page.url().includes('start=1'), '?start=1 removed from the URL');
      const total0 = Number((await text('.vc-count')).split('/')[1]);
      eq(total0, engine.length, 'cards in the run = vocabQueue(…, vocabToday().newWords)');
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
          const right = opts.indexOf(gloss(v.meaningZh));
          assert(right >= 0, `meaning of ${word} ("${gloss(v.meaningZh)}") not among the options ${JSON.stringify(opts)}`);
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
        // After answering, the card itself takes focus on the next frame (so Enter / Space / E work);
        // wait for it like a person would (no one presses Enter within the same frame).
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await poll(() => page.evaluate(() => document.activeElement?.classList.contains('vc-stage')), 'answered card focused');
        await key('Enter');
        await poll(async () => (await page.locator('.vc-summary').isVisible()) || !(await page.locator('.vc-verdict').isVisible()), 'next card');
      }
      await page.locator('.vc-summary').waitFor({ state: 'visible', timeout: T.short });
      await waitText('.vc-sum-eyebrow', /今日计划里的词汇已完成/);
      await snap('vocab-summary');
      assert(wrongRead && wrongMeaning, 'the run had both kinds of cards');
      eq(retries, 2, 'wrong cards come back once in the same run');
      eq(firsts, engine.length, 'first tries = engine queue');
      const st = await waitState((s) => B(s, vocabB).status === 'done', 'vocab block marked done');
      const b = B(st, vocabB);
      eq(b.result.answered, firsts, 'vocab block result.answered (first tries)');
      eq(b.result.correct, firstOk, 'vocab block result.correct');
      eq(st.vocabAttempts.length - ctx.vocabAttempts0, cards, 'vocab attempts recorded');
      eq(st.days[today].vocab, cards, 'days[today].vocab');
      const est = Math.max(5, Math.min(30, Math.max(1, Math.round((engine.length * 9) / 60))));
      if (b.vocabCount !== engine.length || b.minutes !== est)
        warn(`vocab task says "${b.title}" (${b.vocabCount} 张卡, ${b.minutes} 分钟) but the run has ${engine.length} cards (~${est} min at 9 s/card)`);
      expect.done++;
      await page.locator('.vc-sum-cta').getByRole('button', { name: '返回词汇' }).click();
      await page.locator('.vc-page').waitFor({ timeout: T.short });
      await gotoToday();
      return `${cards} cards (${firsts} first tries, ${firstOk} right); plan said ${b.vocabCount} 张卡 / ${b.minutes} min`;
    });

  // ── 13. Today reflects the work ──
  await step('Today reflects progress: tasks done, answered count, minutes, the next task', async () => {
    if (!/#\/?$/.test(page.url()) && !/\/$/.test(page.url())) await gotoToday();
    await page.locator('.td-plan').waitFor({ timeout: T.short });
    await page.waitForTimeout(600);
    const st = await getState();
    const plan = st.plans[today];
    const day = st.days[today];
    const L = todayLayout(st, today);
    const doneN = plan.blocks.filter((b) => b.status === 'done').length;
    const countable = L.counted.length;
    eq(doneN, expect.done, 'done blocks in the saved plan');
    eq(day.answered, expect.answered, 'days[today].answered');
    assert(day.seconds > 0, `study seconds should be > 0, got ${day.seconds}`);
    if (ctx.linger) assert(day.seconds >= ctx.linger, `study seconds ${day.seconds} < ${ctx.linger} spent on one item`);
    await waitText('.td-pg-ratio', new RegExp(`^${doneN}\\s*/${countable}$`));
    await waitText('.td-pg-title', new RegExp(`完成 ${doneN} 项，还剩 ${countable - doneN} 项`));
    await waitText('.td-progress .td-pg-line', new RegExp(`已学 ${reEsc(fmtMinutes(day.seconds / 60))} / 计划 ${reEsc(fmtMinutes(L.counted.reduce((s, b) => s + b.minutes, 0)))}`));
    const tile = (await page.locator('.td-pg-stats .stat-tile').filter({ hasText: '今日做题' }).innerText()).replace(/\s+/g, '');
    assert(tile.includes(`${day.answered}题`) && tile.includes(`正确率${pct(day.correct / day.answered)}`), `今日做题 tile "${tile}"`);
    eq(await text('.td-plan .card-sub'), `今天共 ${countable} 项 · 约 ${fmtMinutes(L.counted.reduce((s, b) => s + b.minutes, 0))}`, 'list summary');
    // The hero moves on to the next task in 跟学 order.
    eq(await text('.td-hero-title'), shownTitle(L.hero), 'hero = the next task');
    eq(await text('.td-title'), `第 ${L.counted.indexOf(L.hero) + 1} 项了，保持节奏`, 'headline');
    // Finished tasks fold into one row; opened, each shows its result.
    await waitText('.td-plan .td-fold', new RegExp(`已完成 ${doneN} 项`));
    await unfold(/已完成/);
    eq(await page.locator('.td-plan .td-row.is-done').count(), doneN, 'done rows');
    eq(JSON.stringify(await titlesOf(page.locator('.td-plan .td-row.is-done'))), JSON.stringify(L.finished.map(shownTitle)), 'done rows in 跟学 order');
    for (const [i, b] of L.finished.entries()) {
      if (!b.result || !(b.result.answered > 0)) continue;
      const trail = (await page.locator('.td-plan .td-row.is-done').nth(i).locator('.td-row-size').innerText()).replace(/\s/g, '');
      assert(trail.includes(`对${b.result.correct}/${b.result.answered}`), `done row ${i + 1} (${b.title}) result "${trail}"`);
    }
    // Due cards: today's mistakes come back later, not today.
    await waitText('.td-due-row', /没有到期的错题/);
    await snap('today-progress');
    return `${doneN}/${countable} tasks, ${day.answered} answered, ${day.seconds}s`;
  });

  if (vocabB)
    await step('Today: 待复习词卡 counts cards (vocabDueCount), the same number the vocab engine schedules', async () => {
      const st = await getState();
      let cards = 0;
      for (const v of bank.bundle.vocab) {
        const p = st.vocab[v.id];
        if (p) for (const k of vocabSkills(v)) if (p[k] && p[k].due <= today) cards++;
      }
      eq(vocabDueCount(st, bank, today), cards, 'vocabDueCount vs. due skills the engine trains');
      const shown = (await page.locator('.td-due-row').filter({ hasText: '待复习词卡' }).innerText()).replace(/\s+/g, ' ');
      const m = /待复习词卡 (\d+) 张/.exec(shown);
      const n = m ? Number(m[1]) : /词汇都复习完了/.test(shown) ? 0 : NaN;
      const stray = bank.bundle.vocab
        .filter((v) => st.vocab[v.id])
        .flatMap((v) => ['read', 'meaning'].filter((k) => !vocabSkills(v).includes(k) && st.vocab[v.id][k] && st.vocab[v.id][k].due <= today).map((k) => `${v.word}/${k}`));
      eq(n, cards, `"${shown}" after finishing the run (skills the engine no longer trains: ${stray.join(', ') || 'none'})`);
      return `${n} cards due`;
    });

  await step('预测 on Today, 冲刺计划 and 数据 agree with estimateAll(state, bank)', async () => {
    const st = await getState();
    const est = estimateAll(st, bank);
    // Below 30 first attempts a subject shows max(estimate, baseline) (scores.ts shownScore).
    const want = Object.fromEntries(SCORE_ORDER.map((s) => [s, shownScore(est[s])]));
    want.total = SCORE_ORDER.reduce((a, s) => a + want[s], 0);
    const num = async (loc) => Number(((await loc.first().innerText()).match(/\d+/) || ['NaN'])[0]);
    const seen = { today: {}, plan: {}, stats: {} };
    for (const s of SCORE_ORDER) seen.today[s] = await num(page.locator(`.td-subj-row.tone-${s} .td-subj-val`));
    seen.today.total = await num(page.locator('.td-score-num'));
    await page.locator('.sidebar a', { hasText: '冲刺计划' }).first().click();
    await page.locator('.plan-tg-row.is-total').waitFor({ timeout: T.short });
    const rows = page.locator('.plan-tg-row:not(.plan-tg-headrow):not(.is-total)');
    eq(await rows.count(), SCORE_ORDER.length, 'subject rows on 冲刺计划');
    for (const [i, s] of SCORE_ORDER.entries()) {
      assert((await rows.nth(i).innerText()).includes(SUBJECT_NAME[s]), `冲刺计划 row ${i + 1} should be ${SUBJECT_NAME[s]}`);
      seen.plan[s] = await num(rows.nth(i).locator('.plan-tg-cur'));
    }
    seen.plan.total = await num(page.locator('.plan-tg-row.is-total .plan-tg-cur'));
    await page.locator('.sidebar a', { hasText: '数据' }).first().click();
    await page.locator('.st-hero-score').waitFor({ timeout: T.short });
    for (const s of SCORE_ORDER) seen.stats[s] = await num(page.locator(`.st-subj.tone-${s} .st-subj-score .num`));
    seen.stats.total = await num(page.locator('.st-hero-score .num'));
    await gotoToday();
    const bad = [];
    for (const where of ['today', 'plan', 'stats'])
      for (const k of [...SCORE_ORDER, 'total']) if (seen[where][k] !== want[k]) bad.push(`${where}.${k} ${seen[where][k]} ≠ ${want[k]}`);
    const raw = Object.fromEntries(SCORE_ORDER.map((s) => [s, `${est[s].estimate} (base ${est[s].baseline}, ${est[s].samples} samples)`]));
    assert(!bad.length, `${bad.join(', ')} (estimateAll: ${JSON.stringify(raw)})`);
    return `total ${want.total}`;
  });

  await step('skip a task (toast 撤销, restore from the folded row); leaving a task untouched puts it back', async () => {
    const st = await getState();
    const L = todayLayout(st, today);
    const b = L.pending.find((x) => x.status === 'todo' && ['drill', 'reading', 'listening'].includes(x.kind) && !x.reviewOfMock);
    if (!b) return 'no todo task left';
    const n = L.counted.length;
    const sub = (k) => new RegExp(`^今天共 ${k} 项`);
    await skipRow(b);
    await toastSeen(/已跳过，随时可以恢复/);
    await waitState((s) => B(s, b).status === 'skipped', 'task skipped');
    await waitText('.td-plan .card-sub', sub(n - 1));
    // Undo from the toast.
    await page.locator('.toast').filter({ hasText: '已跳过' }).last().getByRole('button', { name: '撤销' }).click();
    await waitState((s) => B(s, b).status === 'todo', 'skip undone from the toast');
    await waitText('.td-plan .card-sub', sub(n));
    // Skip again, then restore it from the folded 已完成 · 跳过 row.
    await skipRow(b);
    await waitState((s) => B(s, b).status === 'skipped', 'task skipped again');
    await waitText('.td-plan .td-fold', /跳过 1 项/);
    await unfold(/跳过/);
    const row = page.locator('.td-plan .td-row.is-skipped');
    eq(await row.count(), 1, 'skipped rows');
    eq((await titlesOf(row))[0], shownTitle(b), 'skipped row');
    await row.click();
    await waitState((s) => B(s, b).status === 'todo', 'task restored');
    await waitText('.td-plan .card-sub', sub(n));

    await startTask(b);
    const sid = await waitPlayer();
    await exitPlayer();
    const after = await waitState((s) => B(s, b).status === 'todo' && !s.sessions[sid] && !s.activeSessionId, 'untouched task back to todo, empty session dropped');
    eq(B(after, b).status, 'todo', 'block status');
    const La = todayLayout(after, today);
    if ((await text('.td-hero-eyebrow')).includes('继续上次'))
      assert(La.hero && La.hero.id !== b.id && openSession(after, La.hero.id), `Today offers to resume an empty session: hero "${await text('.td-hero-title')}"`);
    const row2 = await rowOf(after, b);
    assert((await row2.getAttribute('class')).includes('is-todo'), 'row back to todo');
    return b.title;
  });

  const keptOf = (s) => s.plans[today].blocks.filter((b) => b.status !== 'todo').map((b) => JSON.stringify([b.id, b.status, b.result ?? null, b.itemIds]));
  const usedItems = (s) => new Set(s.plans[today].blocks.filter((b) => b.status !== 'todo').flatMap((b) => b.itemIds));

  // ── 14. 调整时长 ──
  await step('调整时长: 8 h re-plans the rest of today, finished tasks kept', async () => {
    const before = await getState();
    await page.locator('.td-plan-actions').getByRole('button', { name: '调整时长' }).click();
    const modal = page.locator('.modal').filter({ hasText: '调整今天的学习时长' });
    await modal.waitFor({ timeout: T.short });
    await modal.locator('.du-opt').filter({ has: page.locator('.du-h', { hasText: /^8$/ }) }).click();
    await waitText('.du-note', /实际安排 8 小时/);
    await waitText('.du-note', /已完成和进行中的任务保留/);
    await snap('duration-dialog');
    await modal.getByRole('button', { name: '保存并更新计划' }).click();
    await toastSeen(/今天改为 8 小时，计划已更新/);
    const st = await waitState((s) => s.profile.dayMinutes[today] === 480 && s.plans[today].budgetMinutes === 480, 'dayMinutes saved and plan rebuilt');
    eq(JSON.stringify(keptOf(st)), JSON.stringify(keptOf(before)), 'finished tasks unchanged');
    const blocksNow = st.plans[today].blocks;
    const sum = blocksNow.reduce((s, b) => s + b.minutes, 0);
    const kept = blocksNow.filter((b) => b.status !== 'todo').reduce((s, b) => s + b.minutes, 0);
    assert(kept > 480 ? sum === kept : Math.abs(sum - 480) <= 15, `planned ${sum} min (kept ${kept}) for a 480 min day`);
    eq(blocksNow.filter((b) => b.kind === 'vocab').length, 1, 'still one vocab task');
    assert(blocksNow.filter(isRecall).length <= 1 && blocksNow.filter(isGrammar).length <= 1, 'no second 考点速测 / 文型 task');
    const used = usedItems(before);
    const reused = blocksNow.filter((b) => b.status === 'todo').flatMap((b) => b.itemIds).filter((id) => used.has(id));
    eq(reused.length, 0, `new tasks repeat items finished today (${reused.slice(0, 3).join(', ')})`);
    const L = todayLayout(st, today);
    await waitText('.td-progress .td-pg-line', new RegExp(`计划 ${reEsc(fmtMinutes(L.counted.reduce((s, b) => s + b.minutes, 0)))}`));
    await waitText('.td-plan .card-sub', new RegExp(`约 ${reEsc(fmtMinutes(L.counted.reduce((s, b) => s + b.minutes, 0)))}`));
    eq(await todayCount(), blocksNow.length, 'tasks on Today after re-planning');
    await snap('today-8h');
    return `${blocksNow.length} tasks, ${sum} min (${kept} kept)`;
  });

  // ── 15. 换一套安排 ──
  await step('换一套安排 keeps finished tasks and renews the rest', async () => {
    const before = await getState();
    const oldTodo = before.plans[today].blocks.filter((b) => b.status === 'todo').map((b) => b.id);
    await page.locator('.td-plan-actions').getByRole('button', { name: '换一套安排' }).click();
    await confirmModal('换一套今天的安排', '换一套');
    await toastSeen(/今天的安排已更新/);
    const st = await waitState((s) => s.plans[today].generatedAt !== before.plans[today].generatedAt, 'plan regenerated');
    eq(JSON.stringify(keptOf(st)), JSON.stringify(keptOf(before)), 'finished tasks unchanged');
    eq(st.plans[today].budgetMinutes, 480, 'budget kept');
    const todo = st.plans[today].blocks.filter((b) => b.status === 'todo');
    assert(todo.every((b) => !oldTodo.includes(b.id)), 'todo tasks are new');
    const kinds = st.plans[today].blocks.map((b) => b.kind);
    eq(kinds.filter((k) => k === 'vocab').length, 1, 'no duplicate vocab task');
    const used = usedItems(before);
    const reused = todo.flatMap((b) => b.itemIds).filter((id) => used.has(id));
    eq(reused.length, 0, `new tasks repeat items finished today (${reused.slice(0, 3).join(', ')})`);
    assert(st.plans[today].blocks.filter(isRecall).length <= 1 && st.plans[today].blocks.filter(isGrammar).length <= 1, 'no second 考点速测 / 文型 task');
    eq(await todayCount(), st.plans[today].blocks.length, 'tasks on Today after regenerating');
    eq(await page.locator('.td-plan .td-row.is-done').count(), expect.done, 'done rows after regenerating');
    await snap('today-regenerated');
    return `${todo.length} new todo tasks`;
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
    eq(await todayCount(), after.plans[today].blocks.length, 'tasks on Today after reload');
    eq(await page.locator('.td-plan .td-row.is-done').count(), expect.done, 'done rows after reload');
    await waitText('.td-pg-stats .stat-tile', new RegExp(`今日做题\\s*${after.days[today].answered}\\s*题`));
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
    eq(await todayCount(), st.plans[today].blocks.length, 'tasks on Today after restart');
    eq(await page.locator('.td-plan .td-row.is-done').count(), expect.done, 'done rows after restart');
  });

  await step('end of the day: leave a task half-done', async () => {
    const st = await getState();
    const b = st.plans[today].blocks.find((x) => x.status === 'todo' && (x.kind === 'drill' || x.kind === 'reading') && !x.timed && !isRecall(x));
    assert(b, 'no todo practice task left');
    await startTask(b);
    const sid = await waitPlayer();
    const s0 = (await waitState((x) => x.sessions[sid], 'session saved')).sessions[sid];
    const it = byId.get(s0.itemIds[0]);
    if (it.format === 'choice') await choose(it.answer);
    else for (const l of [...blankGroups(it)].sort().flatMap((g) => [...g])) await key(it.blanks[l] === '-' ? 'Minus' : it.blanks[l]);
    await submitAndWaitResult();
    await exitPlayer();
    await waitState((x) => x.activeSessionId === sid && x.sessions[sid].answers[it.id]?.submitted, 'left mid-way');
    ctx.stale = { sid, title: s0.title, n: s0.itemIds.length, block: b };
    return s0.title;
  });

  // ── 04:00 rollover with the app left open ──
  const d2 = addDays(DAY1, 1);
  await openDay(`${d2}T03:58:30`);
  curDay = DAY1;
  dayLabel = `${d2} 03:58`;
  await step('after midnight the study day is still yesterday; at 04:00 Today rolls over to a new plan', async () => {
    await page.locator('.td-plan').waitFor({ timeout: T.long });
    await waitText('.td-late', /凌晨 4 点前仍算作今天/);
    assert((await text('.td-eyebrow')).includes(fmtDateShort(DAY1)), `date before 04:00: "${await text('.td-eyebrow')}"`);
    await waitText('.td-hero-eyebrow', /继续上次/);
    eq(await text('.td-hero-title'), shownTitle(ctx.stale.block), 'yesterday-evening task leads Today before 04:00');
    eq(await text('.td-title'), '夜深了，做完这一项就休息吧', 'late-night headline');
    const before = await getState();
    assert(!before.plans[d2], `no plan for ${d2} before 04:00`);
    await page.clock.fastForward(150_000);
    await poll(async () => (await text('.td-eyebrow')).includes(fmtDateShort(d2)), `Today switches to ${d2}`, T.long);
    curDay = d2;
    eq(await page.locator('.td-late').count(), 0, 'late-night note after 04:00');
    const st = await waitState((x) => x.plans[d2]?.blocks.length > 0, `plan for ${d2} saved after the rollover`);
    await page.locator('.td-hero-title').waitFor({ timeout: T.short });
    eq(await todayCount(), st.plans[d2].blocks.length, 'tasks of the new day');
    await page.locator('.td-stale').waitFor({ timeout: T.short });
    return `${st.plans[d2].blocks.length} tasks for ${d2}`;
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
      const open = [...blankGroups(it)]
        .sort()
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
    eq(await todayCount(), plan.blocks.length, `${date} tasks on Today`);
    return st;
  }

  // ── Day +2: the first mistakes are due ──
  const d3 = addDays(DAY1, MISTAKE_INTERVALS[0]);
  await openDay(d3);
  if (ctx.stale)
    await step(`a task left half-done on ${DAY1} shows as a slim notice, not as today's hero; finish it from there`, async () => {
      await page.locator('.td-plan').waitFor({ timeout: T.long });
      const notice = page.locator('.td-stale');
      await notice.waitFor({ timeout: T.short });
      const t = (await notice.innerText()).replace(/\s+/g, ' ');
      assert(t.includes(`上次的「${ctx.stale.title}」还没做完`) && t.includes(`已做 1/${ctx.stale.n}`), `notice "${t}"`);
      const st = await getState();
      eq(await text('.td-hero-title'), shownTitle(todayLayout(st, d3).hero), "hero shows today's first task");
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
      eq(B(st2, ctx.stale.block)?.status, 'done', `${DAY1} task status`);
    });
  await step(`mistakes from ${DAY1} are due after ${MISTAKE_INTERVALS[0]} days; a confident right answer moves them to the 4-day step`, async () => {
    const st = await dayPlan(d3);
    const plan = st.plans[d3];
    const due = Object.entries(st.progress)
      .filter(([, p]) => isDue(p, d3))
      .map(([id]) => id);
    assert(due.length > 0, 'no due mistakes');
    const review = plan.blocks.find((b) => b.kind === 'review' && !b.reviewOfMock);
    assert(review, `no 错题重做 task: ${plan.blocks.map((b) => b.title).join(' | ')}`);
    assert(review.itemIds.every((id) => due.includes(id)), 'review task holds only due mistakes');
    const missing = due.filter((id) => !plan.blocks.some((b) => b.itemIds.includes(id)));
    eq(missing.length, 0, `due mistakes left out of the plan (${missing.join(', ')})`);
    // Unsure-but-right items (4-day step) are not due yet.
    const notYet = Object.entries(st.progress).filter(([, p]) => p.inMistakes && p.due > d3);
    assert(notYet.every(([id]) => !review.itemIds.includes(id)), 'review task holds items not yet due');
    await waitText('.td-due-row', new RegExp(`到期错题\\s*${due.length}\\s*题`));
    await startTask(review);
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
    await waitState((s) => B(s, review).status === 'done', 'review task done');
    await backToToday();
    ctx.retest = it.id;
    return `${due.length} due, ${review.itemIds.length} in 错题重做, re-tested ${it.id}`;
  });

  // ── Day +6: every task skipped, then the second spaced re-test clears the item ──
  const d7 = addDays(d3, MISTAKE_INTERVALS[1]);
  await openDay(d7);
  await step('跟学: skip the warm-up and every task (跳过这一项) → the finish card does not claim 今天收工了 when nothing was done', async () => {
    const st0 = await dayPlan(d7);
    ctx.d7n = st0.plans[d7].blocks.length;
    await skipAllWithFlow();
    await waitState((s) => s.plans[d7].blocks.every((b) => b.status === 'skipped'), 'every task skipped');
    await snap('flow-all-skipped');
    const card = (await page.locator('.fl-finish').innerText()).replace(/\s+/g, ' ');
    assert(!/今天收工了/.test(card), `flow finish card with 0 of ${ctx.d7n} tasks done: "${card}"`);
    await exitFlow();
  });
  if (ctx.d7n)
    await step('every task skipped → Today says 今天的任务都跳过了; 全部恢复 brings them back', async () => {
      const n = ctx.d7n;
      if (await page.locator('.fl').count()) await exitFlow();
      await page.locator('.td-plan').waitFor({ timeout: T.short });
      await waitState((s) => s.plans[d7].blocks.every((b) => b.status === 'skipped'), 'every task skipped');
      await waitText('.td-hero-title', /今天的任务都跳过了/);
      assert(/^(今天先休息一下|今天先到这里，去睡吧)$/.test(await text('.td-title')), `headline "${await text('.td-title')}"`);
      await waitText('.td-plan', new RegExp(`已跳过 ${n} 项`));
      eq(await page.locator('.td-done').count(), 0, 'no 今天收工了 card');
      await snap('today-all-skipped');
      await page.locator('.td-hero').getByRole('button', { name: '全部恢复' }).click();
      await toastSeen(new RegExp(`已恢复 ${n} 项`));
      await waitState((s) => s.plans[d7].blocks.every((b) => b.status === 'todo'), 'every task back to todo');
      eq(await todayCount(), n, 'tasks on Today after 全部恢复');
      await waitText('.td-hero', /开始跟学/);
    });

  if (!ctx.retest) skip('second re-test', 'no item re-tested on the first due day');
  else {
    await step(`a second spaced confident right answer (${d7}) takes the item out of the mistake book`, async () => {
      const st = await getState();
      const plan = st.plans[d7];
      const X = ctx.retest;
      assert(isDue(st.progress[X], d7), `${X} should be due on ${d7}: ${JSON.stringify(st.progress[X])}`);
      const blk = plan.blocks.find((b) => b.status === 'todo' && b.itemIds.includes(X));
      assert(blk, `${X} is not in today's plan`);
      await startTask(blk);
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
      await snap('day7-cleared');
      if (!/移出错题本/.test(r)) {
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(SHOTS, 'bug-cleared-mistake-banner.png') });
      }
      const st2 = await waitState((s) => s.progress[X].inMistakes === false, 'item left the mistake book');
      eq(st2.progress[X].due, undefined, 'no due date once cleared');
      if (k < session.itemIds.length - 1) await finishEarly();
      else {
        await key('Enter');
        await page.locator('.pl-fin').waitFor({ timeout: T.short });
      }
      await backToToday();
      // The banner must say so (checked last, so the session above is finished either way).
      assert(/移出错题本/.test(r), `the answer that clears a mistake does not say so: "${r}"`);
      return `${blk.title}: ${k + 1} answered`;
    });
  }

  // ── Missed mocks: the oldest comes back first on a day without its own mock ──
  const dSci = addDays(EXAM, -9);
  if (dSci <= d7) skip('missed mocks', `${dSci} is not after ${d7}`);
  else {
    await openDay(dSci);
    await step(`missed mocks come back on ${dSci}: 数理整卷模考 ① (${addDays(EXAM, -11)}) before 日语 ① (${addDays(EXAM, -10)}), corrections locked`, async () => {
      const st = await dayPlan(dSci);
      const plan = st.plans[dSci];
      eq(plan.phase, 'practice', 'phase');
      const sched = mockSchedule(st, bank);
      const missed = sched.filter((m) => m.date < dSci && m.parts.some((p) => !p.done));
      assert(missed.length >= 2, `missed mocks before ${dSci}: ${missed.map((m) => m.title).join(', ')}`);
      const oldest = missed[0];
      eq(oldest.daysLeft, 11, 'the oldest missed slot');
      const key2 = (x) => `${x.kind}:${x.session}`;
      const order = ['ja-reading', 'ja-listening', 'science', 'math'];
      const mocks = plan.blocks.filter((b) => b.kind === 'mock');
      eq(JSON.stringify(mocks.map((b) => key2(b.mock))), JSON.stringify([...oldest.parts].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).map(key2)), "today's mocks = the oldest missed slot");
      const corrections = plan.blocks.filter((b) => b.reviewOfMock);
      eq(corrections.length, mocks.length, 'one correction per mock');
      await unfold(/其余|明天继续/);
      eq(await page.locator('.td-plan .td-row.is-locked').count(), corrections.length, 'correction rows locked until the mock is handed in');
      await waitText('.td-plan .td-row.is-locked', /模考交卷后解锁/);
      await waitText('.td-mock', /今天补做/);
      for (const b of mocks) {
        const items = b.itemIds.map((id) => byId.get(id));
        eq(b.minutes, Math.round(mockLimitFor(b.mock.kind, items) / 60), `${b.title} minutes`);
        if (todayLayout(st, dSci).hero?.id === b.id) continue;
        const row = await rowOf(st, b, dSci);
        await row.locator('.td-row-badge', { hasText: '真题整卷' }).waitFor({ timeout: T.short });
      }
      // Start the first one and leave it untouched: back to todo, no result.
      const m0 = mocks[0];
      await startTask(m0, dSci);
      const sid = await waitPlayer();
      const s = (await waitState((x) => x.sessions[sid], 'mock session saved')).sessions[sid];
      eq(s.kind, 'mock', 'session kind');
      eq(s.exam, true, 'exam mode');
      eq(JSON.stringify(s.itemIds), JSON.stringify(m0.itemIds), 'mock items = planned items');
      const limit = mockLimitFor(m0.mock.kind, s.itemIds.map((id) => byId.get(id)));
      eq(s.timeLimitSec, limit, 'timeLimitSec');
      await atItem(0, m0.itemIds.length);
      const left = clockSecs(await text('.pl-countdown-value'));
      assert(left <= limit && left >= limit - 15, `countdown ${left}s for a ${limit}s mock`);
      await snap('mock-start');
      await exitPlayer();
      const st2 = await waitState((x) => B(x, m0).status === 'todo' && !x.sessions[sid], 'untouched mock back to todo');
      eq(st2.mocks.length, 0, 'no mock result recorded');
      return mocks.map((b) => `${b.title} (${b.itemIds.length} 题, ${b.minutes} min)`).join(', ');
    });

    await step('hand in 数理整卷模考 ①: every question answered → Enter on the last one asks to hand in (交卷 focused); a blank paper from the top bar; results recorded, corrections unlock', async () => {
      const st0 = await getState();
      const mocks = st0.plans[dSci].blocks.filter((b) => b.kind === 'mock');
      for (const [mi, m] of mocks.entries()) {
        await startTask(m, dSci);
        const sid = await waitPlayer();
        const s = (await waitState((x) => x.sessions[sid], 'mock session saved')).sessions[sid];
        const N = s.itemIds.length;
        const confirm = page.locator('.modal').filter({ hasText: '现在交卷' });
        const full = mi === 0 && s.itemIds.every((id) => byId.get(id).format === 'choice');
        if (full) {
          // Every question answered: Enter on the last one opens the 交卷 dialog with 交卷 focused.
          for (let i = 0; i < N; i++) {
            await atItem(i, N);
            await choose(byId.get(s.itemIds[i]).answer);
            if (i < N - 1) await key('Enter');
          }
          eq(await page.locator('.modal').count(), 0, 'no 交卷 dialog before the last Enter');
          await key('Enter');
          await confirm.waitFor({ timeout: T.short });
          const body = (await confirm.innerText()).replace(/\s+/g, ' ');
          assert(/全部作答完毕/.test(body), `交卷 dialog with every question answered: "${body}"`);
          await poll(() => page.evaluate(() => document.activeElement?.tagName === 'BUTTON' && (document.activeElement.textContent || '').trim() === '交卷'), 'the dialog focuses 交卷 when nothing is empty');
          await key('Enter');
          await confirm.waitFor({ state: 'detached', timeout: T.short });
        } else {
          await page.locator('.pl-top').getByRole('button', { name: '交卷', exact: true }).click();
          await confirm.waitFor({ timeout: T.short });
          const body = (await confirm.innerText()).replace(/\s+/g, ' ');
          assert(new RegExp(`还有 ${N} 题没作答，交卷后按答错计算`).test(body) && /超过一半没作答/.test(body), `mock 交卷 dialog: "${body}"`);
          await confirm.locator('.modal-foot').getByRole('button', { name: '交卷', exact: true }).click();
        }
        await page.locator('.pl-fin').waitFor({ state: 'visible', timeout: T.short });
        await waitText('.pl-fin-eyebrow', /已交卷/);
        const st = await waitState((x) => x.mocks.some((r) => r.kind === m.mock.kind && r.session === m.mock.session), 'mock result saved');
        const res = st.mocks.find((r) => r.kind === m.mock.kind && r.session === m.mock.session);
        eq(res.total, N, 'mock result total');
        eq(res.correct, full ? N : 0, 'mock result correct');
        await waitText('.pl-fin-score-num', new RegExp(`^${res.estimate}$`));
        eq(B(st, m).status, 'done', `${m.title} status`);
        await backToToday();
      }
      const st = await getState();
      eq(st.mocks.length, mocks.length, 'mock results');
      await unfold(/其余|明天继续/);
      eq(await page.locator('.td-plan .td-row.is-locked').count(), 0, 'corrections unlocked');
      return st.mocks.map((r) => `${r.kind} ${r.estimate}`).join(', ');
    });

    // ── 日语 ① comes back on the next day without a mock of its own, padded to exam length ──
    const dJa = addDays(EXAM, -7);
    await openDay(dJa);
    await step(`日语整卷模考 ① (missed on ${addDays(EXAM, -10)}) comes back on ${dJa}: padded to exam length and timed with mockLimitFor`, async () => {
      const st = await dayPlan(dJa);
      const plan = st.plans[dJa];
      eq(plan.phase, 'practice', 'phase');
      const ja1 = mockSchedule(st, bank).find((m) => m.daysLeft === 10);
      const b = plan.blocks.find((x) => x.kind === 'mock' && x.mock?.kind === 'ja-reading');
      assert(b, `no Japanese reading mock: ${plan.blocks.map((x) => x.title).join(' | ')}`);
      eq(b.mock.session, ja1.parts.find((p) => p.kind === 'ja-reading').session, '日语 ① paper');
      const corrections = plan.blocks.filter((x) => x.reviewOfMock).length;
      await unfold(/其余|明天继续/);
      eq(await page.locator('.td-plan .td-row.is-locked').count(), corrections, 'correction rows locked until the mock is handed in');
      const base = new Set(mockItems(bank, 'ja-reading', b.mock.session).map((x) => x.id));
      const want = JA_FULL['ja-reading'];
      assert(b.itemIds.length >= want && b.itemIds.length <= want + 1, `${b.itemIds.length} items, exam has ${want}`);
      const pads = b.itemIds.filter((id) => !base.has(id));
      const seen = new Set(st.attempts.map((a) => a.itemId));
      assert(pads.every((id) => byId.get(id).source.kind === 'original' && !seen.has(id)), 'padding is never-seen originals');
      assert(pads.length === 0 || b.reason.includes(`补 ${pads.length} 道原创题`), `reason mentions the padding: "${b.reason}"`);
      const row = await rowOf(st, b, dJa);
      assert((await row.locator('.td-row-size').innerText()).includes(`${b.itemIds.length} 题`), 'row count');
      const lb = plan.blocks.find((x) => x.kind === 'mock' && x.mock?.kind === 'ja-listening');
      if (lb) {
        const lbase = new Set(mockItems(bank, 'ja-listening', lb.mock.session).map((x) => x.id));
        const lwant = JA_FULL['ja-listening'];
        assert(lb.itemIds.length >= lwant && lb.itemIds.length <= lwant + 1, `listening mock: ${lb.itemIds.length} items, exam has ${lwant}`);
        const lpads = lb.itemIds.filter((id) => !lbase.has(id));
        assert(lpads.every((id) => byId.get(id).source.kind === 'original' && byId.get(id).section === 'listening' && !seen.has(id)), 'listening padding is never-seen original listening items');
        assert(lpads.every((id) => !b.itemIds.includes(id)), 'reading and listening padding overlap');
        eq(lb.minutes, Math.round(mockLimitFor('ja-listening', lb.itemIds.map((id) => byId.get(id))) / 60), 'listening mock minutes');
      }
      await startTask(b, dJa);
      const sid = await waitPlayer();
      const st1 = await waitState((s) => s.sessions[sid], 'mock session saved');
      const s = st1.sessions[sid];
      eq(s.kind, 'mock', 'session kind');
      eq(s.exam, true, 'exam mode');
      eq(JSON.stringify(s.itemIds), JSON.stringify(b.itemIds), 'mock items = planned (padded) items');
      const limit = mockLimitFor('ja-reading', s.itemIds.map((id) => byId.get(id)));
      eq(s.timeLimitSec, limit, 'timeLimitSec');
      await atItem(0, b.itemIds.length);
      const left = clockSecs(await text('.pl-countdown-value'));
      assert(left <= limit && left >= limit - 15, `countdown ${left}s for a ${limit}s mock`);
      await snap('mock-ja-start');
      await exitPlayer();
      const st2 = await waitState((x) => B(x, b).status === 'todo' && !x.sessions[sid], 'untouched mock back to todo');
      eq(st2.mocks.length, st.mocks.length, 'no mock result recorded');
      return `${b.itemIds.length} items (${pads.length} originals), ${Math.round(limit / 60)} min`;
    });
  }

  // ── The final days ──
  const dNotes = addDays(EXAM, -2);
  await openDay(dNotes);
  await step('跟学 in the final days: the warm-up is the 考点速记 task; 跳过复习 does not tick it off', async () => {
    const st = await dayPlan(dNotes);
    eq(st.plans[dNotes].phase, 'final', 'phase');
    const nb = st.plans[dNotes].blocks.find((b) => b.kind === 'notes');
    assert(nb, `no 考点速记 task: ${st.plans[dNotes].blocks.map((b) => b.title).join(' | ')}`);
    const topics = (nb.noteTopics || []).filter((t) => bank.notesByTopic.has(t)).slice(0, 6);
    assert(topics.length > 0, 'notes task has topics with notes');
    await page.locator('.td-hero').getByRole('button', { name: '开始跟学' }).click();
    await page.locator('.fl').waitFor({ timeout: T.short });
    await waitText('.fl-dots-num', new RegExp(`^1/${topics.length}$`));
    eq(await text('.fl-card .fl-title'), shortTopic(bank, topics[0]), 'warm-up = the 考点速记 topics');
    await page.locator('.fl-card').getByRole('button', { name: '跳过复习' }).click();
    await page.locator('.fl-card').getByRole('button', { name: '跳过这一项' }).waitFor({ timeout: T.short });
    await page.waitForTimeout(600);
    const after = B(await getState(), nb);
    await exitFlow();
    if (after.status !== 'todo') {
      await unfold(/已完成/);
      await page.screenshot({ path: path.join(SHOTS, 'bug-skip-review-ticks-notes.png') });
    }
    eq(after.status, 'todo', '考点速记 after 跳过复习 (nothing was reviewed)');
  });

  const dFinal = addDays(EXAM, -1);
  await openDay(dFinal);
  await step('the last day: no new words, 考前一页纸 lists my traps, 考点速记 walks the notes', async () => {
    const st = await dayPlan(dFinal);
    const plan = st.plans[dFinal];
    eq(plan.phase, 'final', 'phase');
    eq(plan.budgetMinutes, budgetFor(st, dFinal), 'tapered budget');
    eq(plan.blocks.filter((b) => b.kind === 'mock').length, 0, 'no mock the day before the exam');
    const vb = plan.blocks.find((b) => b.kind === 'vocab');
    if (vb) assert(!vb.title.includes('新词') && !/新词 \d+ 个/.test(vb.reason), `no new words in the final days: "${vb.title}" / "${vb.reason}"`);
    const tb = plan.blocks.find((b) => b.kind === 'traps');
    const nb = plan.blocks.find((b) => b.kind === 'notes');
    assert(tb, `no 考前一页纸 task: ${plan.blocks.map((b) => b.title).join(' | ')}`);
    assert(nb, `no 考点速记 task: ${plan.blocks.map((b) => b.title).join(' | ')}`);

    // Trap sheet: one entry per item answered wrong (blanks of a mock that ran out are not traps).
    await startTask(tb, dFinal);
    await page.waitForURL(/#\/traps\?block=/, { timeout: T.short });
    await page.locator('.tp-card').first().waitFor({ timeout: T.short });
    const missed = new Set(st.attempts.filter((a) => !a.correct && !(a.mode === 'mock' && a.response === null)).map((a) => a.itemId));
    const entries = await page.locator('.tp-card').count();
    const expected = Math.min(25, [...missed].filter((id) => byId.get(id) && (byId.get(id).explanation.traps?.length || byId.get(id).explanation.keyPoints?.length)).length);
    eq(entries, expected, 'trap entries (one per wrong item with traps/key points, max 25)');
    await snap('final-traps');
    await page.getByRole('button', { name: '看完了' }).click();
    await page.locator('.td-plan').waitFor({ timeout: T.short });
    await waitState((s) => B(s, tb).status === 'done', 'trap task done');

    // Notes: walk the topics with 下一个考点, finish with 看完了.
    const topics = nb.noteTopics || [];
    assert(topics.length > 0, 'notes task has topics');
    await startTask(nb, dFinal);
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
    await waitState((s) => B(s, nb).status === 'done', 'notes task done');
    await unfold(/已完成/);
    eq(await page.locator('.td-plan .td-row.is-done').count(), 2, 'done rows on the last day');

    await page.locator('.sidebar a', { hasText: '词汇' }).first().click();
    await waitText('.vc-hero', /考前最后几天只复习，不加新词/);
    await gotoToday();
    return `${entries} trap entries, ${topics.length} note topics`;
  });

  await step('everything resolved (the rest skipped via 跟学) → 今天收工了; 加练 adds one more task', async () => {
    await skipAllWithFlow();
    await exitFlow();
    const st0 = await waitState((s) => s.plans[dFinal].blocks.every((b) => b.status === 'done' || b.status === 'skipped'), 'every task resolved');
    const skipped = st0.plans[dFinal].blocks.filter((b) => b.status === 'skipped').length;
    await waitText('.td-done', /今日小结/);
    assert(/^今天的任务都完成了/.test(await text('.td-title')), `headline "${await text('.td-title')}"`);
    await waitText('.td-done-stats', new RegExp(`跳过 ${skipped} 项`));
    await snap('final-done');
    const n0 = st0.plans[dFinal].blocks.length;
    await page.locator('.td-extra-toggle').click();
    const btn = page.locator('.td-extra-btn:not([disabled])').first();
    await btn.waitFor({ timeout: T.short });
    const name = (await btn.locator('.td-extra-name').innerText()).trim();
    const sub = (await btn.locator('.td-extra-sub').innerText()).trim();
    await btn.click();
    await toastSeen(/已加入/);
    const st = await waitState((x) => x.plans[dFinal].blocks.length === n0 + 1, 'extra task saved');
    const x = st.plans[dFinal].blocks[n0];
    assert(x.extra && x.status === 'todo', `extra task ${JSON.stringify({ extra: x.extra, status: x.status })}`);
    eq(`${x.itemIds.length} 题 · ${fmtMinutes(x.minutes)}`, sub, 'the picker previewed this task');
    const used = new Set(st.plans[dFinal].blocks.slice(0, n0).flatMap((b) => b.itemIds));
    assert(x.itemIds.every((id) => !used.has(id)), 'extra task repeats items planned today');
    eq(await text('.td-hero-title'), shownTitle(x), 'the extra task leads Today');
    await startTask(x, dFinal);
    const sid = await waitPlayer();
    eq((await waitState((y) => y.sessions[sid], 'extra session saved')).sessions[sid].blockId, x.id, 'the extra task opens the player');
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
