import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getConfigValue } from '../src/utils/config.js';
import { getReviewMaxFiles } from '../src/utils/reviewConfig.js';

vi.mock('../src/utils/config.js', () => ({ getConfigValue: vi.fn() }));

beforeEach(() => {
  getConfigValue.mockReset();
  vi.stubEnv('CODEANT_REVIEW_MAX_FILES', undefined);
  delete process.env.CODEANT_REVIEW_MAX_FILES;
});
afterEach(() => vi.unstubAllEnvs());

describe('review file limit configuration', () => {
  it('defaults to 100', () => {
    expect(getReviewMaxFiles()).toBe(100);
  });

  it('uses per-run override > environment > saved global config > default', () => {
    getConfigValue.mockReturnValue(150);
    expect(getReviewMaxFiles()).toBe(150);
    expect(getConfigValue).toHaveBeenCalledWith('reviewMaxFiles');
    vi.stubEnv('CODEANT_REVIEW_MAX_FILES', '200');
    expect(getReviewMaxFiles()).toBe(200);
    expect(getReviewMaxFiles(250)).toBe(250);
    expect(getReviewMaxFiles(1)).toBe(1);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '', 'abc', '12abc', true, []])('rejects invalid overrides: %j', (value) => {
    expect(() => getReviewMaxFiles(value)).toThrow(/positive safe integer/);
  });

  it('reports invalid environment and global config instead of silently falling back', () => {
    getConfigValue.mockReturnValue(0);
    expect(() => getReviewMaxFiles()).toThrow(/reviewMaxFiles/);
    vi.stubEnv('CODEANT_REVIEW_MAX_FILES', '-1');
    expect(() => getReviewMaxFiles()).toThrow(/CODEANT_REVIEW_MAX_FILES/);
    expect(getReviewMaxFiles(100)).toBe(100);
  });
});
