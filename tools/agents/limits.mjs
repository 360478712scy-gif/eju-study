#!/usr/bin/env node
// Codex 额度：只读当前用量。用户 2026-11-18 改口：不用重置卡，超了直接花账户里现有的额度（周额度会自然重置）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const mode = process.argv[2] || 'read';
const LOG = new URL('../../design/agents/limits.log', import.meta.url).pathname;
const p = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'ignore'] });
let buf = '';
const waiters = new Map();
p.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    try {
      const m = JSON.parse(line);
      if (m.id != null && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
    } catch { /* not json */ }
  }
});
let n = 0;
const call = (method, params) => new Promise((r) => {
  const id = ++n; waiters.set(id, r);
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const timer = setTimeout(() => { console.error('timeout'); p.kill(); process.exit(2); }, 60000);
await call('initialize', { clientInfo: { name: 'eju-agents', version: '1.0.0' } });
p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }) + '\n');
const rl = (await call('account/rateLimits/read', null)).result || {};
const used = rl.rateLimits?.primary?.usedPercent ?? 0;
const reached = rl.rateLimits?.rateLimitReachedType || null;
const credits = rl.rateLimitResetCredits?.availableCount ?? 0;
const resetsAt = rl.rateLimits?.primary?.resetsAt ? new Date(rl.rateLimits.primary.resetsAt * 1000).toISOString() : '?';
const line = `${new Date().toISOString()} used=${used}% reached=${reached} resets=${credits} windowResetsAt=${resetsAt}`;
console.log(line);
clearTimeout(timer);
p.kill();
