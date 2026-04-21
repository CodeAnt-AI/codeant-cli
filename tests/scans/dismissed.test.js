import { describe, it, expect, beforeAll } from 'vitest';
import { run, REPO, TIMEOUT } from './helpers.js';

describe('dismissed', () => {
  let outBasic;
  let outSecrets;

  beforeAll(() => {
    outBasic   = run('scans', 'dismissed', '--repo', REPO);
    outSecrets = run('scans', 'dismissed', '--repo', REPO, '--analysis-type', 'secrets');
  });

  it('--repo — exit 0', () => {
    expect(outBasic.status).toBe(0);
  }, TIMEOUT);

  it('--analysis-type secrets — graceful exit (0 or 1)', () => {
    expect(outSecrets.status).toBeLessThanOrEqual(1);
  }, TIMEOUT);

  it("output has 'dismissed_alerts' key", () => {
    expect(outBasic.combined).toMatch('dismissed_alerts');
  }, TIMEOUT);
});
