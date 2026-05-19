import { describe, it, expect } from 'vitest';
import { run, REPO, TIMEOUT, SKIP_ONLINE } from './helpers.js';

describe('settings branches-all', () => {
  it('exits non-zero when --repo is missing', () => {
    const r = run('settings', 'branches-all');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--repo/);
  });

  it.skipIf(SKIP_ONLINE)('returns branch list for repo', () => {
    const r = run('settings', 'branches-all', '--repo', REPO);
    expect(r.status).toBe(0);
    expect(r.combined).toMatch(/branch|name/i);
  }, TIMEOUT);
});

describe('settings branches-default', () => {
  it('exits non-zero when --repo is missing', () => {
    const r = run('settings', 'branches-default');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--repo/);
  });

  it.skipIf(SKIP_ONLINE)('returns default branch for repo', () => {
    const r = run('settings', 'branches-default', '--repo', REPO);
    expect(r.status).toBe(0);
    expect(r.combined).toMatch(/branch|default/i);
  }, TIMEOUT);
});

describe('settings branches-update-default', () => {
  it('exits non-zero when --repo is missing', () => {
    const r = run('settings', 'branches-update-default', '--branch', 'main');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--repo/);
  });

  it('exits non-zero when --branch is missing', () => {
    const r = run('settings', 'branches-update-default', '--repo', REPO);
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--branch/);
  });
});
