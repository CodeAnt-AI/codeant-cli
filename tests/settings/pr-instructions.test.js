import { describe, it, expect } from 'vitest';
import { run, TIMEOUT, SKIP_ONLINE } from './helpers.js';

describe('settings pr-instructions-get', () => {
  it('exits non-zero when --type is missing', () => {
    const r = run('settings', 'pr-instructions-get');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--type/);
  });

  it.skipIf(SKIP_ONLINE)('returns instructions for given type', () => {
    const r = run('settings', 'pr-instructions-get', '--type', 'custom');
    expect(r.status).toBe(0);
  }, TIMEOUT);
});

describe('settings pr-instructions-save', () => {
  it.skipIf(SKIP_ONLINE)('exits 0 with no options (all optional)', () => {
    const r = run('settings', 'pr-instructions-save');
    expect(r.status).toBe(0);
  }, TIMEOUT);
});

describe('settings pr-instructions-edit', () => {
  it('exits non-zero when --instruction-id is missing', () => {
    const r = run('settings', 'pr-instructions-edit');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--instruction-id/);
  });
});

describe('settings pr-instructions-delete', () => {
  it('exits non-zero when --instruction-id is missing', () => {
    const r = run('settings', 'pr-instructions-delete');
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/--instruction-id/);
  });
});
