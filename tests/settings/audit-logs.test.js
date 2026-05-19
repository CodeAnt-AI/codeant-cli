import { describe, it, expect } from 'vitest';
import { run, TIMEOUT, SKIP_ONLINE } from './helpers.js';

describe('settings audit-logs', () => {
  it.skipIf(SKIP_ONLINE)('exits 0 with default options', () => {
    const r = run('settings', 'audit-logs');
    expect(r.status).toBe(0);
  }, TIMEOUT);

  it.skipIf(SKIP_ONLINE)('accepts --days --page --limit options', () => {
    const r = run('settings', 'audit-logs', '--days', '7', '--page', '1', '--limit', '10');
    expect(r.status).toBe(0);
  }, TIMEOUT);
});
