import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const cli = fileURLToPath(new URL('../src/index.js', import.meta.url));
// Isolate the real config implementation without changing the user's home/config.
const bootstrap = `import os from 'node:os';
  import { pathToFileURL } from 'node:url';
  os.homedir = () => process.env.CODEANT_TEST_CONFIG_HOME;
  process.execArgv = [];
  await import(pathToFileURL(process.argv[1]).href);`;
let testDir;

function run(args, env = {}) {
  const childEnv = { ...process.env, CODEANT_TELEMETRY_DISABLED: '1', CODEANT_TEST_CONFIG_HOME: testDir, ...env };
  if (!Object.hasOwn(env, 'CODEANT_REVIEW_MAX_FILES')) delete childEnv.CODEANT_REVIEW_MAX_FILES;
  return spawnSync(process.execPath, ['--input-type=module', '--eval', bootstrap, cli, ...args], {
    cwd: testDir, env: childEnv, encoding: 'utf8', timeout: 10000,
  });
}

beforeAll(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeant-review-cli-'));
  execFileSync('git', ['init', '--quiet'], { cwd: testDir });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--allow-empty', '-m', 'Initial'], { cwd: testDir });
});
afterAll(() => fs.rmSync(testDir, { recursive: true, force: true }));

describe('review CLI file limits', () => {
  it('persists a global default and lets env and inline flags override only the run', () => {
    const saved = run(['set-review-max-files', '150']);
    expect(saved.status, saved.stderr || saved.stdout).toBe(0);
    const configPath = path.join(testDir, '.codeant', 'config.json');
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).reviewMaxFiles).toBe(150);

    for (const [args, env, expected] of [
      [[], {}, 150],
      [[], { CODEANT_REVIEW_MAX_FILES: '200' }, 200],
      [['--max-files', '250'], { CODEANT_REVIEW_MAX_FILES: '200' }, 250],
    ]) {
      const review = run(['review', '--staged', '--headless', ...args], env);
      expect(review.status, review.stderr).toBe(0);
      expect(JSON.parse(review.stdout)).toMatchObject({ error: null, noFiles: true, meta: { max_files: expected } });
    }
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).reviewMaxFiles).toBe(150);
  }, 15000);

  it.each(['0', '-1', '1.5', 'abc', '9007199254740992'])('rejects invalid inline and global values: %s', value => {
    expect(run(['review', '--headless', '--max-files', value]).status).toBe(1);
    expect(run(['set-review-max-files', value]).status).toBe(1);
  });
});
