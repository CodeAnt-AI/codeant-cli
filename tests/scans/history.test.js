import { describe, it, expect, beforeAll } from 'vitest';
import { run, REPO, TIMEOUT } from './helpers.js';

describe('history', () => {
  let outBasic;
  let outLimit;
  let outBranch;

  beforeAll(() => {
    outBasic  = run('scans', 'history', '--repo', REPO);
    outLimit  = run('scans', 'history', '--repo', REPO, '--limit', '3');
    outBranch = run('scans', 'history', '--repo', REPO, '--branch', 'main');
  });

  it('basic — exit 0', () => {
    expect(outBasic.status).toBe(0);
  }, TIMEOUT);

  it('--limit 3 — exit 0', () => {
    expect(outLimit.status).toBe(0);
  }, TIMEOUT);

  it('--branch main — exit 0', () => {
    expect(outBranch.status).toBe(0);
  }, TIMEOUT);

  it("output has 'scans' key", () => {
    expect(outBasic.combined).toMatch('scans');
  }, TIMEOUT);
});
