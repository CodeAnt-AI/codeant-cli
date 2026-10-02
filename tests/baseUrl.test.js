import { afterEach, describe, expect, it, vi } from 'vitest';

const { getConfigValue } = vi.hoisted(() => ({ getConfigValue: vi.fn() }));
vi.mock('../src/utils/config.js', () => ({ getConfigValue }));

const { getBaseUrl } = await import('../src/utils/baseUrl.js');

describe('API base URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getConfigValue.mockReset();
  });

  it('uses the production API host by default', () => {
    vi.stubEnv('CODEANT_API_URL', '');
    getConfigValue.mockReturnValue(undefined);
    expect(getBaseUrl()).toBe('https://api.codeant.ai');
  });

  it('keeps an explicitly configured API host', () => {
    vi.stubEnv('CODEANT_API_URL', 'https://api.codeant.ai');
    expect(getBaseUrl()).toBe('https://api.codeant.ai');

    vi.stubEnv('CODEANT_API_URL', '');
    getConfigValue.mockReturnValue('https://api.codeant.ai');
    expect(getBaseUrl()).toBe('https://api.codeant.ai');
  });
});
