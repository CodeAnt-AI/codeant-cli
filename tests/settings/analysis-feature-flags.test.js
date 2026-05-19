import { describe, it, expect } from 'vitest';
import { run, REPO, TIMEOUT, SKIP_ONLINE } from './helpers.js';

describe('settings analysis-feature-flags-get', () => {
  it('exits non-zero when --repo is missing', () => {
    const r = run('settings', 'analysis-feature-flags-get');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--repo/);
  });

  it.skipIf(SKIP_ONLINE)('returns analysis feature flags for repo', () => {
    const r = run('settings', 'analysis-feature-flags-get', '--repo', REPO);
    expect(r.status).toBe(0);
  }, TIMEOUT);
});

describe('settings analysis-feature-flags-update', () => {
  it('exits non-zero when --repo is missing', () => {
    const r = run('settings', 'analysis-feature-flags-update', '--flags', '{}');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--repo/);
  });

  it('exits non-zero when --flags is missing', () => {
    const r = run('settings', 'analysis-feature-flags-update', '--repo', REPO);
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--flags/);
  });
});
