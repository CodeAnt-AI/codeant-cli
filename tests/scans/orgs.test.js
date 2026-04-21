import { describe, it, expect, beforeAll } from 'vitest';
import { run, TIMEOUT } from './helpers.js';

describe('orgs', () => {
  let out;
  beforeAll(() => { out = run('scans', 'orgs'); });

  it('returns exit 0', () => {
    expect(out.status).toBe(0);
  }, TIMEOUT);

  it("output has 'connections' key", () => {
    expect(out.combined).toMatch('connections');
  }, TIMEOUT);
});
