// Run the legacy frontend against its own immutable engine and bank sources.
// Never point a legacy write protocol at the v3 learner directory or service.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshot = 'a43d5f439b6d83fb583ca87fc34c31ba2ce292ab';
const work = mkdtempSync(join(tmpdir(), 'eju-v2-archive-'));
const web = join(root, 'legacy', 'web-v2');

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: work, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

try {
  const source = execFileSync('git', [
    'archive', '--format=tar', snapshot, 'package.json', 'VERSION', 'server.mjs', 'server', 'shared', 'content',
    'tools/v2/build-content.mjs', 'tools/v2/validate.mjs', 'tests-v2',
  ], { cwd: root, maxBuffer: 32 * 1024 ** 2 });
  execFileSync('tar', ['-xf', '-', '-C', work], { input: source });
  symlinkSync(join(root, 'node_modules'), join(work, 'node_modules'), 'dir');
  const assets = join(root, 'public');
  if (existsSync(assets)) symlinkSync(assets, join(work, 'public'), 'dir');
  copyFileSync(join(root, 'tests-v2', 'e2e.mjs'), join(work, 'tests-v2', 'e2e.mjs'));
  const env = { ...process.env, EJU_V2_SHARED_DIR: join(work, 'shared'), EJU_V2_FRONTEND: web };
  const code = run(process.execPath, ['tools/v2/build-content.mjs'], env);
  process.exitCode = code || run(process.execPath, ['tests-v2/e2e.mjs'], env);
} finally {
  rmSync(work, { recursive: true, force: true });
}
