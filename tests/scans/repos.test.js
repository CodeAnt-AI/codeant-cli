import { describe, it, expect, beforeAll } from 'vitest';
import { run, REPO, ORG, TIMEOUT } from './helpers.js';

describe('repos', () => {
  let outDefault;
  let outExplicit;

  beforeAll(() => {
    outDefault  = run('scans', 'repos');
    outExplicit = run('scans', 'repos', '--org', ORG);
  });

  it('auto-picks a single org or asks for an explicit selection', () => {
    if (outDefault.status === 0) {
      expect(outDefault.combined).toMatch('repos');
    } else {
      expect(outDefault.status).toBe(1);
      expect(outDefault.combined).toMatch(/Multiple orgs found/);
      expect(outDefault.combined).toMatch(/--org/);
    }
  }, TIMEOUT);

  it('--org explicit — exit 0', () => {
    expect(outExplicit.status).toBe(0);
  }, TIMEOUT);

  it("output has 'repos' key", () => {
    expect(outExplicit.combined).toMatch('repos');
  }, TIMEOUT);
});
