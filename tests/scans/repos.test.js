import { describe, it, expect, beforeAll } from 'vitest';
import { run, REPO, ORG, TIMEOUT } from './helpers.js';

describe('repos', () => {
  let outDefault;
  let outExplicit;

  beforeAll(() => {
    outDefault  = run('scans', 'repos');
    outExplicit = run('scans', 'repos', '--org', ORG);
  });

  it('auto-pick org — exit 0', () => {
    expect(outDefault.status).toBe(0);
  }, TIMEOUT);

  it('--org explicit — exit 0', () => {
    expect(outExplicit.status).toBe(0);
  }, TIMEOUT);

  it("output has 'repos' key", () => {
    expect(outExplicit.combined).toMatch('repos');
  }, TIMEOUT);
});
