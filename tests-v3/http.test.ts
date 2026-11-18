import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { bundle, fresh, written } from './fixtures.ts';

test('loopback HTTP, seven views, CAS, persisted variants and independent coach jobs', { timeout: 20000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eju-v3-http-'));
  const file = path.join(dir, 'bank.json'),
    cli = path.join(dir, 'fake-cli.mjs'),
    trace = path.join(dir, 'trace.jsonl'),
    mismatch = path.join(dir, 'mismatch');
  const site = path.join(dir, 'dist');
  fs.mkdirSync(path.join(site, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(site, 'index.html'), '<title>v3 fixture</title>');
  fs.writeFileSync(path.join(site, 'assets', 'site.js'), 'site asset');
  const raw = structuredClone(bundle);
  const legacyState = fresh();
  assert.equal(legacyState.settings.newCardsPerDay, 20);
  Reflect.deleteProperty(legacyState.settings, 'newCardsPerDay');
  fs.writeFileSync(path.join(dir, 'state-v3.json'), JSON.stringify(legacyState));
  fs.writeFileSync(
    file,
    JSON.stringify({
      ...raw,
      vocab: [{}],
      items: [...raw.items, { ...written, id: 'ja1', subject: 'japanese' }],
      taxonomy: { subjects: { ...raw.taxonomy.subjects, japanese: { units: [] } } },
      notes: [...raw.notes, { topic: 'ja.reading.short', body: 'archive' }],
    }),
  );
  fs.writeFileSync(
    cli,
    '#!' + process.execPath + '\n' + fs.readFileSync(new URL('./coach-cli.mjs', import.meta.url), 'utf8'),
    { mode: 0o700 },
  );
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('../', import.meta.url),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: '0',
      EJU_CONTENT_FILE: file,
      EJU_DATA_DIR: dir,
      EJU_WEB_DIST: site,
      EJU_CODEX_PATH: cli,
      EJU_TEST_TRACE: trace,
      EJU_TEST_MISMATCH: mismatch,
    },
  });
  try {
    const [chunk] = await Promise.race([
      once(server.stdout, 'data'),
      once(server, 'exit').then(() => {
        throw Error('server startup failed');
      }),
    ]);
    const url = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/)![0];
    const get = async (route: string) => {
      const res = await fetch(url + route);
      assert.equal(res.status, 200, route);
      return res.json();
    };
    const post = (route: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(url + route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    assert.equal((await get('/api/health')).version, '3.0.0');
    assert.equal(await (await fetch(url + '/deep/client/route')).text(), '<title>v3 fixture</title>');
    assert.equal(await (await fetch(url + '/assets/site.js')).text(), 'site asset');
    const bank = await get('/content/bank.json');
    assert.ok(!('vocab' in bank) && !('japanese' in bank.taxonomy.subjects));
    assert.equal(bank.items.length, bundle.items.length);
    assert.equal((await get('/api/practice?school=aoyama&format=written')).items.length, 1);
    const routes = ['today', 'plan', 'practice', 'review', 'mocks', 'notes', 'stats'];
    for (const r of routes) assert.ok(await get('/api/' + r + '?date=2026-11-19&asOf=2026-11-19'));
    assert.equal((await fetch(url + '/api/today?date=2027-02-31')).status, 400);
    const a = { baseRevision: 0, action: { type: 'star', value: true, itemId: written.id } };
    assert.equal((await post('/api/action', a, { origin: 'null' })).status, 403);
    assert.equal((await post('/api/action', a, { 'Content-Type': 'text/plain' })).status, 415);
    const writes = await Promise.all([post('/api/action', a), post('/api/action', a)]);
    assert.deepEqual(writes.map((w) => w.status).sort(), [200, 409]);
    assert.equal((await get('/api/state')).state.revision, 1);
    assert.equal((await get('/api/state')).state.settings.newCardsPerDay, 20);
    const preview = await get('/api/plan?date=2026-12-01&asOf=2026-11-19');
    const school = preview.week
      .find((day: { date: string }) => day.date === '2026-12-01')
      .blocks.find((block: { kind: string }) => block.kind === 'school');
    assert.equal(school.school, 'aoyama');
    assert.equal(school.schoolPurpose, 'exam_style');
    assert.equal(
      (await post('/api/action', { baseRevision: 1, action: { type: 'startPractice', itemIds: ['missing'] } })).status,
      400,
    );
    assert.equal((await get('/api/export')).revision, 1);
    assert.ok((await get('/api/backups')).backups.length);
    async function enqueue(kind: string, body: unknown) {
      const r = await post('/api/coach/' + kind, body);
      assert.equal(r.status, 202);
      return (await r.json()).job;
    }
    async function poll(id: string) {
      for (let i = 0; i < 160; i++) {
        const job = (await get('/api/coach/job?id=' + id)).job;
        if (job.finishedAt) return job;
        await delay(15);
      }
      throw Error('job stalled');
    }
    assert.equal((await post('/api/coach/grade', { itemId: written.id })).status, 400);
    const ask = await enqueue('ask', { itemId: written.id, question: 'WAIT_FOR_CANCEL' });
    assert.equal((await post('/api/coach/ask', { itemId: written.id })).status, 409);
    assert.equal((await post('/api/coach/cancel', { id: ask.id })).status, 200);
    assert.equal((await poll(ask.id)).status, 'cancelled');
    for (const kind of ['ask', 'grade', 'weekly']) {
      const job = await poll((await enqueue(kind, { itemId: written.id, question: '先观察什么？', text: 'BLv', date: '2026-11-19' })).id);
      assert.equal(job.status, 'done', kind);
      if (kind === 'grade') assert.equal(job.result.earned, 10);
    }
    fs.writeFileSync(mismatch, '');
    const failed = await poll((await enqueue('variant', { itemId: written.id })).id);
    assert.equal(failed.error, 'verification_failed');
    assert.equal(failed.result, undefined);
    fs.unlinkSync(mismatch);
    const verified = await poll((await enqueue('variant', { itemId: written.id })).id);
    assert.equal(verified.status, 'done');
    const res = await post('/api/action', { baseRevision: 1, action: { type: 'startVariant', jobId: verified.id } });
    assert.equal(res.status, 200);
    const session = (await res.json()).result;
    assert.deepEqual(session.itemIds, [verified.result.item.id]);
    assert.equal((await get('/api/practice?q=' + session.itemIds[0])).items.length, 1);
    assert.equal(
      (
        await post('/api/action', {
          baseRevision: 2,
          action: { type: 'answer', sessionId: session.id, itemId: session.itemIds[0], response: 3, seconds: 30 },
        })
      ).status,
      200,
    );
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state-v3.json'), 'utf8')).attempts[0].correct, true);
    const patch = await post('/api/action', {
      baseRevision: 3,
      action: { type: 'settings', patch: { newCardsPerDay: 3 } },
    });
    assert.equal(patch.status, 200);
    assert.equal((await patch.json()).result.newCardsPerDay, 3);
    const date = '2026-11-19';
    const due = (await get('/api/review?date=' + date)).queue;
    const all = (await get('/api/review?scope=all&date=' + date)).queue;
    const isCardRow = (row: { reasons: string[] }) => row.reasons.includes('card');
    assert.equal(due.filter(isCardRow).length, 3);
    assert.equal(all.filter(isCardRow).length, 8);
    const today = await get('/api/today?date=' + date);
    const review = today.plan.blocks.find((block: { kind: string }) => block.kind === 'review');
    assert.deepEqual(
      review.itemIds.filter((id: string) => id.startsWith('recall-')),
      due.filter(isCardRow).map((row: { itemId: string }) => row.itemId),
    );
    const calls = fs
      .readFileSync(trace, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    assert.equal(new Set(calls.map((c) => c.dir)).size, calls.length);
    for (const c of calls) {
      assert.ok(
        c.args.includes('--ignore-user-config') && c.args.includes('read-only') && c.args.includes('--output-schema'),
      );
      if (c.schema.includes('unambiguous'))
        assert.ok(
          !c.prompt.includes('SECRET_AUTHOR_REASONING') &&
            !c.prompt.includes(written.stem) &&
            !c.prompt.includes('"answer":3'),
        );
    }
    assert.equal(calls.filter((c) => c.schema.includes('unambiguous')).length, 2);
  } finally {
    if (server.exitCode === null) {
      const closed = once(server, 'close');
      server.kill('SIGTERM');
      await closed;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
