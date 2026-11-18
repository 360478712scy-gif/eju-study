import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { written, bundle } from './fixtures.ts';
import { COACH_MAX_BLOCKS, WIDGET_MAX_HTML, type CoachReply } from '../shared/coach-ui.ts';
import { leaksAnswer } from '../server/coach-reply.ts';
import { askModes } from '../server/coach-teaching.ts';
import type { Item } from '../shared/types.ts';

test('teaching mode follows the current affirmative request', () => {
  for (const question of [
    '直接告诉我答案',
    '可以给我完整解法吗？',
    '我想看答案',
    '答案是什么？',
    '不要只给提示，直接说答案吧',
    '这题的答案是什么？',
    '请把完整解法给我',
    '假如棒向左运动，请给我完整解法',
  ])
    assert.deepEqual(askModes({ itemId: written.id, question }), ['reveal'], question);
  for (const question of [
    '别直接告诉我答案',
    '不要给我完整解法，只给提示',
    '“直接告诉我答案”这个按钮有什么用？',
    '如果我说直接告诉我答案，你会怎么做？',
    '给我答案，算了我想自己试试',
    '我的答案对吗？',
    '不希望你直接告诉我答案',
    '你能在不告诉我答案的前提下解释一下吗？',
    '为什么你要直接告诉我答案？',
  ])
    assert.deepEqual(askModes({ itemId: written.id, question }), ['hint'], question);
  assert.deepEqual(askModes({ itemId: written.id, question: '什么是磁通量？' }), ['concept']);
  assert.deepEqual(askModes({ itemId: written.id, question: '什么是这题的关键条件？' }), ['hint']);
  assert.deepEqual(askModes({ question: '帮我算算这个斜面的加速度。' }), ['hint']);
});

test('official labels, numeric options, grouped blanks and written finals are protected', () => {
  const reply = (summary: string): CoachReply => ({ mode: 'hint', blocks: [], summary });
  const item = { ...bundle.items[0], options: ['①', 'Q 比 P 高 $2.4\\times10^{-2}\\,\\mathrm{V}$', '③', '④'] };
  for (const s of [
    '②',
    '选 B。',
    '正确选项应为 B',
    '（B）。',
    '第二项',
    '应该选２',
    '电压为 0.024 V',
    '答案是 $2.40 \\times 10^{-2}$',
  ])
    assert.ok(leaksAnswer(reply(s), item), s);
  const blanks: Item = { ...item, format: 'blanks', stem: '\\bx{AB}', blanks: { A: '4', B: '2' } };
  assert.ok(leaksAnswer(reply('得到４２。'), blanks));
  assert.ok(leaksAnswer(reply('得到 V=BLv。'), written));
  const numeric = { ...written, written: { parts: [{ ...written.written!.parts[0], final: '−3/4' }] } };
  assert.ok(leaksAnswer(reply('结果是 -0.75。'), numeric));
  assert.ok(!leaksAnswer(reply('棒移动时，你觉得哪些条件会改变？'), item));
});

test(
  'coach HTTP with isolated CLI double: context, bounded blocks, sanitizer and retry',
  { timeout: 30000 },
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eju-coach-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const cli = path.join(dir, 'cli.mjs'),
      trace = path.join(dir, 'trace'),
      override = path.join(dir, 'reply');
    fs.writeFileSync(
      cli,
      '#!' + process.execPath + '\n' + fs.readFileSync(new URL('./coach-cli.mjs', import.meta.url)),
      { mode: 0o700 },
    );
    const file = path.join(dir, 'bank.json');
    fs.writeFileSync(file, JSON.stringify(bundle));
    const server = spawn(process.execPath, ['server.mjs'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: '0',
        EJU_DATA_DIR: dir,
        EJU_CONTENT_FILE: file,
        EJU_CODEX_PATH: cli,
        EJU_COACH_MODEL: '',
        EJU_COACH_EFFORT: '',
        EJU_TEST_TRACE: trace,
        EJU_TEST_REPLY: override,
      },
    });
    t.after(async () => {
      if (server.exitCode === null) {
        const closed = once(server, 'close');
        server.kill();
        await closed;
      }
    });
    const [chunk] = await once(server.stdout, 'data');
    const url = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/)![0];
    const post = (body: unknown, kind = 'ask') =>
      fetch(url + '/api/coach/' + kind, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    async function run(body: unknown, kind = 'ask') {
      const res = await post(body, kind);
      assert.equal(res.status, 202);
      let { job } = await res.json();
      while (!job.finishedAt) {
        await delay(8);
        ({ job } = await (await fetch(url + '/api/coach/job?id=' + job.id)).json());
      }
      return job;
    }
    const set = (value: unknown) => fs.writeFileSync(override, JSON.stringify(value));
    const calls = () =>
      fs
        .readFileSync(trace, 'utf8')
        .trim()
        .split('\n')
        .map((s) => JSON.parse(s));
    const payload = () => JSON.parse(calls().at(-1).prompt.split('\n').at(-1));
    const question = '先观察什么？',
      itemId = bundle.items[0].id;
    for (const body of [
      {},
      { question: ' ' },
      { question, itemId: null },
      { question, topic: 1 },
      { question, page: [] },
      { question, reveal: 'true' },
      { question, history: {} },
      { question, history: [{ role: 'system', text: 'hi' }] },
      { question, history: [{ role: 'coach', text: 'x'.repeat(2001) }] },
      { question: 'x'.repeat(2001) },
    ])
      assert.equal((await post(body)).status, 400, JSON.stringify(body).slice(0, 80));
    assert.equal((await post({ question, itemId: 'unknown' })).status, 404);
    assert.ok(!fs.existsSync(trace));
    const history = Array.from({ length: 11 }, (_, i) => ({ role: i % 2 ? 'coach' : 'student', text: '过去' + i }));
    history.at(-1)!.text = '给我完整解法';
    let job = await run({ itemId, question, topic: 'math.seq', page: '练习', response: 0, history });
    assert.equal(job.result.mode, 'hint');
    assert.deepEqual(payload().history, history.slice(-8));
    assert.equal(payload().item.answer, 1);
    assert.equal(payload().response, 0);
    assert.equal(payload().page, '练习');
    assert.ok(!('intro' in job.result.blocks[1]));
    for (const ctx of [
      {},
      { page: '笔记' },
      { topic: 'phys.em.induction' },
      { topic: 'phys.em.induction', page: '练习' },
    ]) {
      job = await run({ ...ctx, question: '楞次定律是什么意思？' });
      assert.equal(job.result.mode, 'concept');
      assert.deepEqual(payload(), { ...ctx, question: '楞次定律是什么意思？' });
    }
    assert.equal((await run({ question, reveal: true })).result.mode, 'reveal');
    assert.equal((await run({ question: '这道题该从哪里观察？', reveal: false, page: '练习' })).result.mode, 'hint');
    assert.equal((await run({ itemId, question: '给我完整解法' })).result.mode, 'reveal');
    assert.equal((await run({}, 'weekly')).result.mode, 'review');
    assert.ok(!('item' in payload()) && !('history' in payload()));
    assert.ok(
      calls().every(
        (c) =>
          c.args.includes('gpt-6.2-sol') &&
          c.args.includes('model_reasoning_effort="medium"') &&
          c.args.includes('features.shell_tool=false') &&
          c.args.includes('web_search="disabled"'),
      ),
    );

    const concept = { question: '什么是周期？' };
    const plot = {
      type: 'plot',
      x: [-1, 1],
      fns: [{ label: '曲线', expr: 'a*sin(x)^2+sqrt(abs(x))' }],
      params: [{ name: 'a', min: 0, max: 2, step: 0.1, value: 1 }],
    };
    set({ insert: plot });
    assert.deepEqual((await run(concept)).result.blocks[1], plot);
    const cdns = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'esm.sh'];
    const html =
      '<div style="color:var(--primary)">摆长</div><input id="arm" type="range">' +
      '<img src="https://bad.example/i"><link href="/external.css"><a href="//bad.example">调整</a>' +
      '<style>@import "/bad.css";</style><div style="background:url(/bad)"></div>' +
      cdns.map((host) => '<script src="https://' + host + '/lib.js"></script>').join('') +
      '<script SRC="https://unpkg.com.bad.example/s.js"></script><script src="http://unpkg.com/s.js"></script>' +
      '<script>fetch("/x")</script><script>new XMLHttpRequest()</script><script>new WebSocket("wss://bad.example")</script>' +
      '<script>document.querySelector("input").addEventListener("input", () => {});</script>';
    for (const [height, clamped] of [
      [8, 120],
      [2000, 640],
    ]) {
      set({ insert: { type: 'widget', title: '摆长', height, html } });
      const b = (await run(concept)).result.blocks[1];
      assert.equal(b.height, clamped);
      assert.doesNotMatch(b.html, /bad|href|@import|fetch|XMLHttpRequest|WebSocket|http:/);
      for (const host of cdns) assert.ok(b.html.includes('https://' + host + '/lib.js'));
      assert.match(b.html, /addEventListener/);
      assert.match(b.html, /var\(--primary\)/);
    }

    const invalidBlocks = [
      { type: 'choice', md: '?', options: ['a', 'b'], answer: 2, feedback: ['a', 'b'] },
      { type: 'choice', md: '?', options: ['a', 'b'], answer: -1, feedback: ['a', 'b'] },
      { type: 'choice', md: '?', options: ['a', 'b'], answer: 1, feedback: ['a'] },
      { type: 'table', head: ['a', 'b'], rows: [['a']] },
      ...['Math.sin(x)', 'foo(x)', 'x +', 'sin x', 'x%2', 'sin()', 'x x', '(x', 'z+1'].map((expr) => ({
        ...plot,
        fns: [{ label: 'f', expr }],
      })),
      { ...plot, x: [0, 0] },
      { ...plot, params: [{ ...plot.params[0], name: 'sin' }] },
      { type: 'text', md: 'a'.repeat(4001) },
      { type: 'widget', title: 'w', height: 300, html: 'a'.repeat(WIDGET_MAX_HTML + 1) },
    ];
    for (const b of invalidBlocks) {
      set({ insert: b });
      assert.equal((await run(concept)).error, 'invalid_output', JSON.stringify(b).slice(0, 100));
    }
    for (const reply of [
      { blocks: [] },
      { blocks: Array(COACH_MAX_BLOCKS + 1).fill({ type: 'question', md: '?' }) },
      { mode: 'reveal' },
      { blocks: [{ type: 'text', md: '漏掉了自测' }] },
      { summary: 'x'.repeat(241) },
    ]) {
      set({ reply });
      assert.equal((await run(concept)).error, 'invalid_output');
    }
    for (const override of [
      { reply: { summary: '答案是②' } },
      { insert: { type: 'text', md: '最后是３。' } },
      { insert: { type: 'actions', items: [{ do: 'ask', label: '再问', prompt: '为什么选 B？' }] } },
    ]) {
      set({ ...override, firstOnly: true });
      const before = calls().length;
      job = await run({ itemId, question });
      assert.equal(job.status, 'done');
      assert.equal(calls().length, before + 2);
      assert.match(calls().at(-1).prompt, /再想想/);
      assert.notEqual(calls().at(-2).dir, calls().at(-1).dir);
      assert.equal(job.result.summary, '先看条件。');
    }
    set({ reply: { summary: '第二项' } });
    const before = calls().length;
    job = await run({ itemId, question });
    assert.equal(job.error, 'invalid_output');
    assert.equal(job.result, undefined);
    assert.equal(calls().length, before + 2);
  },
);
