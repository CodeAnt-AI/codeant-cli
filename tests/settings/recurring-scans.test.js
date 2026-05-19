import { describe, it, expect } from 'vitest';
import { run, REPO, TIMEOUT, SKIP_ONLINE } from './helpers.js';

describe('settings recurring-scans-list', () => {
  it.skipIf(SKIP_ONLINE)('exits 0 with no filters', () => {
    const r = run('settings', 'recurring-scans-list');
    expect(r.status).toBe(0);
  }, TIMEOUT);

  it.skipIf(SKIP_ONLINE)('accepts --repo and --status filters', () => {
    const r = run('settings', 'recurring-scans-list', '--repo', REPO, '--status', 'ACTIVE');
    expect(r.status).toBe(0);
  }, TIMEOUT);
});

describe('settings recurring-scans-create', () => {
  it('exits non-zero when --name is missing', () => {
    const r = run('settings', 'recurring-scans-create');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--name/);
  });
});

describe('settings recurring-scans-update', () => {
  it('exits non-zero when --schedule-id is missing', () => {
    const r = run('settings', 'recurring-scans-update', '--repo', REPO);
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--schedule-id/);
  });

  it('exits non-zero when --repo is missing', () => {
    const r = run('settings', 'recurring-scans-update', '--schedule-id', 'some-id');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--repo/);
  });
});
