#!/usr/bin/env node
// End-to-end test of the daily flow (real server + built web app + system Chrome).
//
//   node tests-v2/e2e.mjs            builds the web app into a temp dir, then runs
//   E2E_DIST=<dir> node tests-v2/e2e.mjs   reuse an existing build
//   E2E_TMP=<dir>  E2E_PORT=18829  E2E_HEADFUL=1  E2E_KEEP=1 (keep temp dir)
//
// The server runs on its own port with a temp data dir seeded from a COPY of
// data/state.json (the learner's v1.4 record), so it starts like a first launch:
// onboarding → Today → one block of every kind → plan changes → reload.
// The real data/ folder is never written. Prints PASS/FAIL per step, exits 1 on failure.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { studyDate, addDays } from '../shared/dates.ts';
import { budgetFor, daysLeftOn } from '../shared/planner.ts';
import { blankGroups } from '../shared/grading.ts';
import { fmtMinutes, pct } from '../web/src/lib/format.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_PORT || 18829);
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = process.env.E2E_TMP ? path.resolve(process.env.E2E_TMP) : fs.mkdtempSync(path.join(os.tmpdir(), 'eju-e2e-'));
const DATA = path.join(TMP, 'data');
const SHOTS = path.join(TMP, 'shots');
const V1_SOURCE = path.join(ROOT, 'data', 'state.json');
const T = { short: 5000, long: 15000 };
/** Seconds spent on the first reading item (0 with E2E_FAST=1). */
const LINGER = process.env.E2E_FAST ? 0 : 61;

// ─────────────────────────── tiny harness ───────────────────────────

const results = [];
let failed = 0;
let page;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function step(name, fn, { critical = false } = {}) {
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}${note ? ` — ${note}` : ''}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    return true;
  } catch (e) {
    failed++;
    results.push({ name, ok: false });
    const file = path.join(SHOTS, `${String(results.length).padStart(2, '0')}-${name.replace(/[^\w一-鿿-]+/g, '_').slice(0, 60)}.png`);
    try {
      if (page) await page.screenshot({ path: file, fullPage: false });
    } catch {
      /* page may be gone */
    }
    console.log(`FAIL  ${name}\n      ${String(e && e.message ? e.message : e).split('\n').join('\n      ')}\n      screenshot: ${file}`);
    if (critical) throw new Error(`critical step failed: ${name}`);
    return false;
  }
}

function skip(name, why) {
  results.push({ name, ok: true, skipped: true });
  console.log(`SKIP  ${name} — ${why}`);
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
  await poll(async () => {
    last = await getState();
    return pred(last);
  }, msg, timeout, 150);
  return last;
}

// ─────────────────────────── page helpers ───────────────────────────

const consoleErrors = [];
const httpErrors = [];
const consoleWarnings = [];

async function text(sel) {
  return (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
}

async function waitText(sel, re, timeout = T.short) {
  const loc = page.locator(sel).filter({ hasText: re }).first();
  await loc.waitFor({ state: 'visible', timeout });
  return loc;
}

/** E2E_SHOTS=1 keeps a screenshot of each milestone in <temp>/shots for a visual check. */
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

/** Click "开始/继续" on the n-th plan row of Today and wait for the player. */
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
  await key(String(i + 1));
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

function HMtext(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h > 0 ? `${h}小时` : ''}${r > 0 || h === 0 ? `${r}分` : ''}`;
}

const wrongOf = (it) => (it.answer + 1) % it.options.length;

// ─────────────────────────── main ───────────────────────────

let browser;
const today = studyDate();
const ctx = {}; // values handed from step to step

async function main() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log(`e2e: ${BASE}  temp ${TMP}  study date ${today}`);

  if (await health()) throw new Error(`port ${PORT} is already in use — stop that server or set E2E_PORT`);

  let dist = process.env.E2E_DIST ? path.resolve(process.env.E2E_DIST) : '';
  if (!dist) {
    dist = path.join(TMP, 'dist');
    const vite = path.join(ROOT, 'node_modules', '.bin', 'vite');
    const r = spawnSync(vite, ['build', '--config', 'web/vite.config.ts', '--outDir', dist, '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`web build failed:\n${r.stdout}\n${r.stderr}`);
  }
  assert(fs.existsSync(path.join(dist, 'index.html')), `no index.html in ${dist}`);
  assert(fs.existsSync(path.join(ROOT, 'content', 'dist', 'bank.json')), 'content/dist/bank.json missing — run npm run build:content');

  const bankJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'dist', 'bank.json'), 'utf8'));
  const byId = new Map(bankJson.items.map((it) => [it.id, it]));
  const vocabByWord = new Map(bankJson.vocab.map((v) => [v.word, v]));

  // First launch: a copy of the v1.4 record in an empty data dir; the server migrates it.
  const v1Copy = path.join(DATA, 'state.json');
  const hasV1 = fs.existsSync(V1_SOURCE);
  if (hasV1) fs.copyFileSync(V1_SOURCE, v1Copy);
  const v1Hash = hasV1 ? sha(v1Copy) : null;

  await startServer(dist);

  browser = await chromium.launch({ channel: 'chrome', headless: !process.env.E2E_HEADFUL });
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
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
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`);
    else if (m.type() === 'warning') consoleWarnings.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(BASE)) httpErrors.push(`${r.status()} ${r.request().method()} ${r.url().slice(BASE.length)}`);
  });

  // ── 1. Migration on first start ──
  await step('server imports the v1.4 record on first start', async () => {
    const st = await getState();
    eq(st.version, 2, 'state version');
    eq(st.profile.onboarded, false, 'profile.onboarded before onboarding');
    assert(fs.existsSync(path.join(DATA, 'state-v2.json')), 'state-v2.json not written');
    if (hasV1) eq(sha(v1Copy), v1Hash, 'v1 state.json must stay untouched');
    ctx.baseline = clone(st.profile.baseline);
    ctx.targets = clone(st.profile.targets);
    ctx.vocabAttempts0 = st.vocabAttempts.length;
    return hasV1 ? `${st.attempts.length} attempts, ${st.vocabAttempts.length} vocab attempts kept` : 'no v1 record, fresh start';
  }, { critical: true });

  // ── 2. Onboarding ──
  await step('onboarding: change the math target, choose 7 h, start', async () => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
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
      (s) => s.profile.onboarded && s.profile.dailyMinutes === 420 && s.profile.targets.math === ctx.mathTarget && s.plans[today],
      'onboarding saved (onboarded, 420 min, new math target, plan)',
    );
    eq(saved.profile.targetTotal, ctx.targetTotal, 'targetTotal');
    eq(saved.profile.startDate, today, 'startDate');
    return `target ${ctx.targetTotal}, ${Math.round(total / 60)} h until the exam`;
  }, { critical: true });

  // ── 3. Today's plan fits the budget ──
  await step('Today: plan minutes match the 7 h budget', async () => {
    const st = await getState();
    const plan = st.plans[today];
    const budget = budgetFor(st, today);
    eq(plan.budgetMinutes, budget, 'plan.budgetMinutes');
    if (daysLeftOn(st, today) > 3) eq(budget, 420, 'budget for a normal day');
    const sum = plan.blocks.reduce((s, b) => s + b.minutes, 0);
    assert(Math.abs(sum - budget) <= 15, `planned ${sum} min vs budget ${budget} min`);
    await waitText('.td-plan-sub', new RegExp(`${plan.blocks.length} 块 · 约 ${fmtMinutes(sum)} · 已完成 0`));
    await waitText('.td-pg-budget', new RegExp(`计划 ${fmtMinutes(budget)}`));
    eq(await page.locator('.td-row').count(), plan.blocks.length, 'rows on Today');
    eq(await text('.td-hero-title'), plan.blocks[0].title, 'hero shows the first block');
    await waitText('.td-mini', new RegExp(`0/${plan.blocks.length}`));
    ctx.plan = plan;
    await snap('today-start');
    const kinds = plan.blocks.map((b) => (b.kind === 'drill' ? `${b.kind}:${b.subject}` : b.kind));
    return `${plan.blocks.length} blocks, ${sum}/${budget} min: ${kinds.join(', ')}`;
  }, { critical: true });

  const blocks = ctx.plan.blocks;
  const idxOf = (f) => blocks.findIndex(f);
  const expect = { done: 0, answered: 0 };

  // ── 4. Science choice drill, all the way through ──
  const sciIdx = idxOf((b) => b.kind === 'drill' && (b.subject === 'physics' || b.subject === 'chemistry'));
  if (sciIdx < 0) skip('science drill', 'no physics/chemistry drill today');
  else
    await step(`science drill (${blocks[sciIdx].title}): answer, result, E, Enter, finish`, async () => {
      await startRow(sciIdx);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      const ids = st0.sessions[sid].itemIds;
      const N = ids.length;
      assert(N >= 4, `need ≥4 items, block has ${N}`);
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
          // Wrong answer → explanation opens by itself, correct key shown, goes to the mistake book.
          await choose(wrongOf(it));
          const r = await submitAndWaitResult();
          assert(/答错了/.test(r) && /正确答案/.test(r), `expected 答错了 + 正确答案, got "${r}"`);
          await page.locator('.pl-excard.is-open').waitFor({ timeout: T.short });
          await page.locator('.pl-opt.is-right').waitFor({ timeout: T.short });
          await page.locator('.pl-opt.is-wrong').waitFor({ timeout: T.short });
          assert(/错题本/.test(r), `expected the mistake-book note, got "${r}"`);
          await snap('drill-wrong');
        } else if (i === 2) {
          // F = 没把握: still graded right, explanation opens, flagged for review.
          await key('f');
          await page.locator('.pl-conf-btn.is-unsure.is-on').waitFor({ timeout: T.short });
          await choose(it.answer);
          const r = await submitAndWaitResult();
          assert(/回答正确/.test(r) && /没把握/.test(r), `expected 回答正确 + 没把握, got "${r}"`);
          await page.locator('.pl-excard.is-open').waitFor({ timeout: T.short });
          correct++;
        } else if (i === 3) {
          // "不会，看解析" without choosing.
          await page.getByRole('button', { name: '不会，看解析' }).click();
          await page.locator('.pl-res').waitFor({ timeout: T.short });
          assert(/看懂解析/.test(await text('.pl-res')), 'gave-up banner');
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
      await snap('drill-summary');
      const stat = await text('.pl-fin-stat');
      assert(stat.includes(`${correct} / ${N}`), `答对 stat "${stat}" should be ${correct} / ${N}`);
      eq(await page.locator('.pl-fin-list:not(.pl-fin-right) .pl-fin-row').count(), 2, 'items to look at again (wrong + gave up)');
      const st = await waitState((s) => s.plans[today].blocks[sciIdx].status === 'done', 'block marked done');
      const b = st.plans[today].blocks[sciIdx];
      eq(b.result.correct, correct, 'block.result.correct');
      eq(b.result.answered, N - 1, 'block.result.answered (gave-up excluded)');
      assert(st.sessions[sid].finishedAt, 'session finished');
      assert(st.progress[ids[1]]?.inMistakes, 'wrong item is in the mistake book');
      assert(st.progress[ids[2]]?.inMistakes, 'unsure item is in the mistake book');
      expect.done++;
      expect.answered += N;
      await backToToday();
      return `${correct}/${N} right`;
    });

  // ── 5. Leave a block mid-way and resume it from Today ──
  const sci2Idx = idxOf((b, i) => i !== sciIdx && b.kind === 'drill' && (b.subject === 'physics' || b.subject === 'chemistry'));
  if (sci2Idx < 0) skip('resume a block', 'only one science drill today');
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
      await page.locator('.pl-top').getByRole('button', { name: '退出（进度会保存）' }).click();
      await page.locator('.td-plan').waitFor({ state: 'visible', timeout: T.short });
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

  // ── 6. Math: the EJU mark sheet by keyboard, partial credit ──
  const mathIdx = idxOf((b) => b.kind === 'drill' && b.subject === 'math');
  if (mathIdx < 0) skip('math mark sheet', 'no math drill today');
  else
    await step('math block: fill the mark sheet by keyboard, submit, partial credit', async () => {
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
      await backToToday();
      return `${half}/${groups.length} groups`;
    });

  // ── 7. Japanese reading ──
  const readIdx = idxOf((b) => b.kind === 'reading');
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
      await snap('reading-item');
      // Read for a minute (real time) so the study clock has something to show on Today.
      if (LINGER) await page.waitForTimeout(LINGER * 1000);
      await choose(it0.answer);
      const r0 = await submitAndWaitResult();
      assert(/回答正确/.test(r0), 'reading item 1 right');
      if (LINGER) {
        const st1 = await waitState((s) => s.sessions[sid].answers[it0.id]?.submitted, 'reading answer saved');
        const secs = st1.sessions[sid].answers[it0.id].seconds;
        assert(Math.abs(secs - LINGER) <= 3, `item time ${secs}s after reading for ${LINGER}s`);
        assert(r0.includes(`用时 ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`), `banner time for ${secs}s: "${r0}"`);
      }
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

  // ── 8. Listening ──
  const listenIdx = idxOf((b) => b.kind === 'listening');
  if (listenIdx < 0) skip('listening block', 'no listening block today');
  else
    await step('listening block: audio plays, option texts hidden until submitted', async () => {
      await startRow(listenIdx);
      const sid = await waitPlayer();
      const st0 = await waitState((s) => s.sessions[sid], 'session saved');
      const it = byId.get(st0.sessions[sid].itemIds[0]);
      assert(it.audio?.src, `${it.id} has no audio`);
      await page.locator('.pl-audio').waitFor({ timeout: T.short });
      eq(await page.locator('.pl-opt').count(), it.options.length, 'option buttons');
      eq(await page.locator('.pl-opt-text').count(), 0, 'option texts before submitting');
      const html = await page.content();
      const leaked = it.options.filter((o) => o.length >= 4 && html.includes(o));
      eq(leaked.length, 0, `option texts leaked into the page before submitting: ${leaked.join(' / ')}`);
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
      await waitText('.pl-opts', new RegExp(it.options[it.answer].slice(0, 6).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      await snap('listening-after');
      await finishEarly();
      await waitState((s) => s.plans[today].blocks[listenIdx].status === 'done', 'block marked done');
      expect.done++;
      expect.answered += 1;
      await backToToday();
      return `played to ${play.t.toFixed(1)}s`;
    });

  // ── 9. Vocabulary ──
  const vocabIdx = idxOf((b) => b.kind === 'vocab');
  if (vocabIdx < 0) skip('vocab block', 'no vocab block today');
  else
    await step('vocab block: type kana readings, choose meanings, finish the run', async () => {
      await startRow(vocabIdx);
      await page.locator('.vc-session').waitFor({ state: 'visible', timeout: T.short });
      await poll(async () => !page.url().includes('start=1'), '?start=1 removed from the URL');
      let cards = 0;
      let firsts = 0;
      let firstOk = 0;
      let wrongRead = null;
      let wrongMeaning = null;
      let retries = 0;
      for (let guard = 0; guard < 500; guard++) {
        const done = await page.locator('.vc-summary').isVisible();
        if (done) break;
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
      await snap('vocab-summary');
      assert(wrongRead && wrongMeaning, 'the run had both kinds of cards');
      eq(retries, 2, 'wrong cards come back once in the same run');
      const st = await waitState((s) => s.plans[today].blocks[vocabIdx].status === 'done', 'vocab block marked done');
      const b = st.plans[today].blocks[vocabIdx];
      eq(b.result.answered, firsts, 'vocab block result.answered (first tries)');
      eq(b.result.correct, firstOk, 'vocab block result.correct');
      eq(st.vocabAttempts.length - ctx.vocabAttempts0, cards, 'vocab attempts recorded');
      eq(st.days[today].vocab, cards, 'days[today].vocab');
      expect.done++;
      return `${cards} cards (${firsts} first tries, ${firstOk} right)`;
    });

  // ── 10. Notes ──
  const notesIdx = idxOf((b) => b.kind === 'notes');
  if (notesIdx < 0) skip('notes block', `no 考点速记 block today (only planned in the final phase)`);
  else
    await step('notes block: open the notes, mark the block done', async () => {
      await startRow(notesIdx);
      await page.waitForURL(/#\/notes\//, { timeout: T.short });
      await page.locator('.nt-blockbar').waitFor({ timeout: T.short });
      await gotoToday();
      await page.locator('.td-hero').getByRole('button', { name: '已完成' }).click();
      await waitState((s) => s.plans[today].blocks[notesIdx].status === 'done', 'notes block marked done');
      expect.done++;
    });

  // ── 11. Today reflects the work ──
  await step('Today reflects progress: blocks, answered count, minutes', async () => {
    if (!page.url().endsWith('#/') && !/\/$/.test(page.url())) await gotoToday();
    await page.locator('.td-plan').waitFor({ timeout: T.short });
    const st = await getState();
    const plan = st.plans[today];
    const day = st.days[today];
    const doneN = plan.blocks.filter((b) => b.status === 'done').length;
    const countable = plan.blocks.filter((b) => b.status !== 'skipped').length;
    eq(doneN, expect.done, 'done blocks in the saved plan');
    eq(day.answered, expect.answered, 'days[today].answered');
    assert(day.seconds > 0, `study seconds should be > 0, got ${day.seconds}`);
    eq(await page.locator('.td-row.is-done').count(), doneN, 'done rows');
    await waitText('.td-mini', new RegExp(`^\\s*${doneN}/${countable}`));
    await waitText('.td-mini', new RegExp(`^\\s*${day.answered}\\s*正确率 ${pct(day.correct / day.answered)}`));
    if (LINGER) assert(day.seconds >= LINGER, `study seconds ${day.seconds} < ${LINGER} spent reading`);
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
    ctx.afterWork = clone(st);
    await snap('today-progress');
    return `${doneN}/${countable} blocks, ${day.answered} answered, ${day.seconds}s`;
  });

  await step('skip a block and restore it; leaving a block untouched puts it back', async () => {
    const st = await getState();
    const plan = st.plans[today];
    const i = plan.blocks.findIndex((b) => b.status === 'todo' && b.kind !== 'vocab' && b.kind !== 'notes' && b.kind !== 'mock');
    if (i < 0) return 'no todo block left';
    const n = plan.blocks.length;
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
    await page.locator('.pl-top').getByRole('button', { name: '退出（进度会保存）' }).click();
    await page.locator('.td-plan').waitFor({ timeout: T.short });
    const after = await waitState((s) => s.plans[today].blocks[i].status === 'todo' && !s.sessions[sid] && !s.activeSessionId, 'untouched block back to todo, empty session dropped');
    eq(after.plans[today].blocks[i].status, 'todo', 'block status');
    assert(!(await text('.td-hero-eyebrow')).includes('继续上次'), 'Today should not offer to resume an empty session');
    eq(await page.locator('.td-row').nth(i).getAttribute('class').then((c) => c.includes('is-todo')), true, 'row back to todo');
  });

  const keptOf = (s) => s.plans[today].blocks.filter((b) => b.status !== 'todo').map((b) => JSON.stringify([b.id, b.status, b.result ?? null, b.itemIds]));

  // ── 12. 调整时长 ──
  await step('调整时长: 5 h re-plans the rest of today, finished blocks kept', async () => {
    const before = await getState();
    await page.locator('.td-plan-actions').getByRole('button', { name: '调整时长' }).click();
    const modal = page.locator('.modal').filter({ hasText: '调整今天的学习时长' });
    await modal.waitFor({ timeout: T.short });
    await modal.locator('.du-opt').filter({ has: page.locator('.du-h', { hasText: /^5$/ }) }).click();
    await waitText('.du-note', /实际安排 5 小时/);
    await waitText('.du-note', /已完成和进行中的块保留/);
    await snap('duration-dialog');
    await modal.getByRole('button', { name: '保存并更新计划' }).click();
    await toastSeen(/今天改为 5 小时，计划已更新/);
    const st = await waitState((s) => s.profile.dayMinutes[today] === 300 && s.plans[today].budgetMinutes === 300, 'dayMinutes saved and plan rebuilt');
    eq(JSON.stringify(keptOf(st)), JSON.stringify(keptOf(before)), 'finished blocks unchanged');
    const blocksNow = st.plans[today].blocks;
    const sum = blocksNow.reduce((s, b) => s + b.minutes, 0);
    const kept = blocksNow.filter((b) => b.status !== 'todo').reduce((s, b) => s + b.minutes, 0);
    assert(kept > 300 ? sum === kept : Math.abs(sum - 300) <= 15, `planned ${sum} min (kept ${kept}) for a 300 min day`);
    eq(blocksNow.filter((b) => b.kind === 'vocab').length, 1, 'still one vocab block');
    await waitText('.td-pg-budget', /计划 5 小时/);
    await waitText('.td-plan-sub', new RegExp(`约 ${fmtMinutes(sum)}`));
    eq(await page.locator('.td-row').count(), blocksNow.length, 'rows after re-plan');
    await snap('today-5h');
    return `${blocksNow.length} blocks, ${sum} min`;
  });

  // ── 13. 重新生成 ──
  await step('重新生成 keeps finished blocks and renews the rest', async () => {
    const before = await getState();
    const oldTodo = before.plans[today].blocks.filter((b) => b.status === 'todo').map((b) => b.id);
    await page.locator('.td-plan-actions').getByRole('button', { name: '重新生成' }).click();
    await confirmModal('重新生成今天的计划', '重新生成');
    await toastSeen(/计划已更新/);
    const st = await waitState((s) => s.plans[today].generatedAt !== before.plans[today].generatedAt, 'plan regenerated');
    eq(JSON.stringify(keptOf(st)), JSON.stringify(keptOf(before)), 'finished blocks unchanged');
    eq(st.plans[today].budgetMinutes, 300, 'budget kept');
    const todo = st.plans[today].blocks.filter((b) => b.status === 'todo');
    assert(todo.every((b) => !oldTodo.includes(b.id)), 'todo blocks are new');
    const kinds = st.plans[today].blocks.map((b) => b.kind);
    eq(kinds.filter((k) => k === 'vocab').length, 1, 'no duplicate vocab block');
    eq(await page.locator('.td-row.is-done').count(), expect.done, 'done rows after regenerating');
    eq(await page.locator('.td-row').count(), st.plans[today].blocks.length, 'rows after regenerating');
    await snap('today-regenerated');
  });

  // ── 14. Reload & restart: everything persisted ──
  await step('reload: Today and GET /api/state unchanged', async () => {
    await page.waitForTimeout(800); // let the last debounced save land
    const before = await getState();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.td-plan').waitFor({ timeout: T.long });
    await page.waitForTimeout(800);
    const after = await getState();
    for (const k of ['profile', 'days', 'vocab', 'progress', 'mocks']) eq(JSON.stringify(after[k]), JSON.stringify(before[k]), `state.${k} after reload`);
    eq(JSON.stringify(after.plans[today]), JSON.stringify(before.plans[today]), "today's plan after reload");
    eq(after.attempts.length, before.attempts.length, 'attempts after reload');
    eq(after.vocabAttempts.length, before.vocabAttempts.length, 'vocab attempts after reload');
    eq(await page.locator('.td-row.is-done').count(), expect.done, 'done rows after reload');
    eq(await page.locator('.td-row').count(), after.plans[today].blocks.length, 'rows after reload');
    await waitText('.td-mini', new RegExp(`^\\s*${after.days[today].answered}正确率`));
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

  // ── 15. Console ──
  await step('browser console has no errors', async () => {
    const real = httpErrors.filter((e) => !/\/api\/coach\//.test(e));
    assert(consoleErrors.length === 0 && real.length === 0, [...consoleErrors, ...real].join('\n') || 'errors');
    if (consoleWarnings.length) return `${consoleWarnings.length} warnings, e.g. ${consoleWarnings[0].slice(0, 120)}`;
  });

  if (studyDate() !== today) console.log(`note: the study day changed during the run (${today} → ${studyDate()}); date-based checks may be off`);
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
console.log(`\n${failed ? 'FAILED' : 'OK'}: ${passed} passed, ${results.filter((r) => !r.ok).length} failed, ${skipped} skipped${crashed ? ' (aborted)' : ''}`);
if (failed && serverLog.trim()) console.log(`server log:\n${serverLog.trim().split('\n').slice(-15).join('\n')}`);
if (!process.env.E2E_KEEP && !process.env.E2E_TMP && !failed) fs.rmSync(TMP, { recursive: true, force: true });
else console.log(`artifacts: ${TMP}`);
process.exit(failed ? 1 : 0);
