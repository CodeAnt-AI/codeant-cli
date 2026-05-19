import { describe, it, expect } from 'vitest';
import { run, REPO, TIMEOUT, SKIP_ONLINE } from './helpers.js';

describe('settings team-subscriptions-list', () => {
  it.skipIf(SKIP_ONLINE)('exits 0 and returns subscriptions', () => {
    const r = run('settings', 'team-subscriptions-list');
    expect(r.status).toBe(0);
  }, TIMEOUT);
});

describe('settings team-users-list', () => {
  it('exits non-zero when --subscription-id is missing', () => {
    const r = run('settings', 'team-users-list');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--subscription-id/);
  });
});

describe('settings team-user-get', () => {
  it('exits non-zero when --user-id is missing', () => {
    const r = run('settings', 'team-user-get');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--user-id/);
  });
});

describe('settings team-user-create', () => {
  it('exits non-zero when --user-id is missing', () => {
    const r = run('settings', 'team-user-create',
      '--email', 'test@example.com', '--name', 'Test', '--role', 'developer');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--user-id/);
  });

  it('exits non-zero when --email is missing', () => {
    const r = run('settings', 'team-user-create',
      '--user-id', 'u1', '--name', 'Test', '--role', 'developer');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--email/);
  });

  it('exits non-zero when --name is missing', () => {
    const r = run('settings', 'team-user-create',
      '--user-id', 'u1', '--email', 'test@example.com', '--role', 'developer');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--name/);
  });

  it('exits non-zero when --role is missing', () => {
    const r = run('settings', 'team-user-create',
      '--user-id', 'u1', '--email', 'test@example.com', '--name', 'Test');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--role/);
  });
});

describe('settings team-user-delete', () => {
  it('exits non-zero when --user-id is missing', () => {
    const r = run('settings', 'team-user-delete');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--user-id/);
  });
});

describe('settings team-user-update', () => {
  it('exits non-zero when --user-id is missing', () => {
    const r = run('settings', 'team-user-update',
      '--email', 'test@example.com', '--name', 'Test', '--role', 'developer', '--status', 'active');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--user-id/);
  });

  it('exits non-zero when --status is missing', () => {
    const r = run('settings', 'team-user-update',
      '--user-id', 'u1', '--email', 'test@example.com', '--name', 'Test', '--role', 'developer');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--status/);
  });
});

describe('settings team-rbac-get', () => {
  it('exits non-zero when --repo is missing', () => {
    const r = run('settings', 'team-rbac-get');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--repo/);
  });

  it.skipIf(SKIP_ONLINE)('returns RBAC settings for repo', () => {
    const r = run('settings', 'team-rbac-get', '--repo', REPO);
    expect(r.status).toBe(0);
  }, TIMEOUT);
});

describe('settings team-rbac-save', () => {
  it('exits non-zero when --repo is missing', () => {
    const r = run('settings', 'team-rbac-save', '--data', '{}');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--repo/);
  });

  it('exits non-zero when --data is missing', () => {
    const r = run('settings', 'team-rbac-save', '--repo', REPO);
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--data/);
  });
});

describe('settings team-plan-end', () => {
  it.skipIf(SKIP_ONLINE)('exits 0 (dry run — no --include-users)', () => {
    const r = run('settings', 'team-plan-end');
    expect(r.status).toBe(0);
  }, TIMEOUT);
});
