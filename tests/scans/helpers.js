import { spawnSync, execFile } from 'child_process';
import { promisify } from 'util';
import { expect } from 'vitest';

const execFileAsync = promisify(execFile);

export const REPO    = process.env.REPO ?? 'CodeAnt-AI/codeant-ci-backend-2';
export const ORG     = process.env.ORG  ?? REPO.split('/')[0];
export const TIMEOUT = 60_000;

const CLI = ['node', 'src/index.js'];

/** Run a CLI command synchronously; return { status, stdout, stderr, combined }. */
export function run(...args) {
  const result = spawnSync(CLI[0], [...CLI.slice(1), ...args], {
    encoding: 'utf8',
    timeout: TIMEOUT - 5_000,
    env: { ...process.env },
    input: '',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    status:   result.status ?? 1,
    signal:   result.signal ?? null,
    stdout:   result.stdout ?? '',
    stderr:   result.stderr ?? '',
    combined: result.signal
      ? `[killed: ${result.signal}]`
      : (result.stdout ?? '') + (result.stderr ?? ''),
  };
}

/**
 * Run a CLI command asynchronously.
 * Use with Promise.all() to fire multiple calls in parallel.
 * Returns the same { status, stdout, stderr, combined } shape as run().
 */
export async function runAsync(...args) {
  try {
    const { stdout, stderr } = await execFileAsync(CLI[0], [...CLI.slice(1), ...args], {
      encoding: 'utf8',
      timeout: TIMEOUT - 5_000,
      env: { ...process.env },
      maxBuffer: 100 * 1024 * 1024, // 100 MB
    });
    return { status: 0, stdout, stderr, combined: stdout + stderr };
  } catch (err) {
    const stdout = err.stdout ?? '';
    const stderr = err.stderr ?? '';
    return { status: err.code ?? 1, stdout, stderr, combined: stdout + stderr };
  }
}

/** Assert exit 0 and return result. */
export function expectOk(...args) {
  const r = run(...args);
  expect(r.status, `expected exit 0 for: ${args.join(' ')}\nstderr: ${r.stderr}`).toBe(0);
  return r;
}

/** Assert exit matches expected (or any non-zero when expected === 'nonzero'). */
export function expectExit(expected, ...args) {
  const r = run(...args);
  if (expected === 'nonzero') {
    expect(r.status, `expected non-zero exit for: ${args.join(' ')}`).not.toBe(0);
  } else {
    expect(r.status, `expected exit ${expected} for: ${args.join(' ')}\nstderr: ${r.stderr}`).toBe(expected);
  }
  return r;
}

/** Assert combined output matches pattern. */
export function expectOutput(pattern, ...args) {
  const r = run(...args);
  expect(r.combined, `expected "${pattern}" in output of: ${args.join(' ')}`).toMatch(pattern);
  return r;
}
