import { describe, it, expect } from 'vitest';
import { run, REPO, TIMEOUT, SKIP_ONLINE } from './helpers.js';

describe('settings sprint-reports-list', () => {
  it.skipIf(SKIP_ONLINE)('exits 0 with no filters', () => {
    const r = run('settings', 'sprint-reports-list');
    expect(r.status).toBe(0);
  }, TIMEOUT);

  it.skipIf(SKIP_ONLINE)('accepts --repo and --status filters', () => {
    const r = run('settings', 'sprint-reports-list', '--repo', REPO, '--status', 'ACTIVE');
    expect(r.status).toBe(0);
  }, TIMEOUT);
});

describe('settings sprint-reports-create', () => {
  it('exits non-zero when --name is missing', () => {
    const r = run('settings', 'sprint-reports-create');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--name/);
  });
});

describe('settings sprint-reports-update', () => {
  it('exits non-zero when --config-id is missing', () => {
    const r = run('settings', 'sprint-reports-update', '--repo', REPO);
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--config-id/);
  });

  it('exits non-zero when --repo is missing', () => {
    const r = run('settings', 'sprint-reports-update', '--config-id', 'some-id');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--repo/);
  });
});
