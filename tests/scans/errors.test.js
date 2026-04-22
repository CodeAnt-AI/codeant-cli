import { describe, it, expect, beforeAll } from 'vitest';
import { run, REPO, TIMEOUT } from './helpers.js';

describe('error handling', () => {
  let outBogusType;
  let outBadRepo;

  beforeAll(() => {
    outBogusType = run('scans', 'results', '--repo', REPO, '--types', 'bogus_type');
    outBadRepo   = run('scans', 'results', '--repo', 'NONEXISTENT_ORG_XYZ/NONEXISTENT_REPO_XYZ', '--quiet');
  });

  it('unknown --types exits non-zero', () => {
    expect(outBogusType.status).not.toBe(0);
  }, TIMEOUT);

  it('unknown --types shows valid type list', () => {
    expect(outBogusType.combined).toMatch(/valid|Valid|sast/i);
  }, TIMEOUT);

  it('nonexistent repo exits non-zero', () => {
    expect(outBadRepo.status).not.toBe(0);
  }, TIMEOUT);
});
