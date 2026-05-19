import { describe, it, expect } from 'vitest';
import { run, REPO, TIMEOUT, SKIP_ONLINE } from './helpers.js';

describe('settings feature-flags-get', () => {
  it('exits non-zero when --repo is missing', () => {
    const r = run('settings', 'feature-flags-get');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--repo/);
  });

  it.skipIf(SKIP_ONLINE)('returns feature flags for repo', () => {
    const r = run('settings', 'feature-flags-get', '--repo', REPO);
    expect(r.status).toBe(0);
  }, TIMEOUT);

  it.skipIf(SKIP_ONLINE)('accepts --v2 flag', () => {
    const r = run('settings', 'feature-flags-get', '--repo', REPO, '--v2');
    expect(r.status).toBe(0);
  }, TIMEOUT);
});

describe('settings feature-flags-update', () => {
  it('exits non-zero when --repo is missing', () => {
    const r = run('settings', 'feature-flags-update', '--flags', '{}');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--repo/);
  });

  it('exits non-zero when --flags is missing', () => {
    const r = run('settings', 'feature-flags-update', '--repo', REPO);
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--flags/);
  });
});
