import { describe, it, expect, beforeAll } from 'vitest';
import { run, REPO, TIMEOUT } from './helpers.js';

describe('get', () => {
  let outBasic;
  let outTypes;

  beforeAll(() => {
    outBasic = run('scans', 'get', '--repo', REPO, '--quiet');
    outTypes = run('scans', 'get', '--repo', REPO, '--types', 'sast,sca', '--quiet');
  });

  it('latest scan summary — exit 0', () => {
    expect(outBasic.status).toBe(0);
  }, TIMEOUT);

  it('--types sast,sca — exit 0', () => {
    expect(outTypes.status).toBe(0);
  }, TIMEOUT);

  it("output has 'summary' key", () => {
    expect(outBasic.combined).toMatch('summary');
  }, TIMEOUT);

  it('--quiet suppresses stderr progress', () => {
    expect(outBasic.stderr).not.toMatch(/\[progress\]/);
  }, TIMEOUT);
});
