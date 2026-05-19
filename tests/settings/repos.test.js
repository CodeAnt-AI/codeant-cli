import { describe, it, expect } from 'vitest';
import { run, TIMEOUT, SKIP_ONLINE } from './helpers.js';

describe('settings repos', () => {
  it.skipIf(SKIP_ONLINE)('exits 0 and returns repo list', () => {
    const r = run('settings', 'repos');
    expect(r.status).toBe(0);
    expect(r.combined).toMatch(/repo|name/i);
  }, TIMEOUT);
});
