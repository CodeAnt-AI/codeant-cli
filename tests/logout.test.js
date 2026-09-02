import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchApiResponse, getConfigValue, setConfigValue } = vi.hoisted(() => ({
  fetchApiResponse: vi.fn(),
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
}));

vi.mock('../src/utils/fetchApi.js', () => ({ fetchApiResponse }));
vi.mock('../src/utils/config.js', () => ({ getConfigValue, setConfigValue }));

const { logoutCodeAnt } = await import('../src/utils/logout.js');

describe('logoutCodeAnt', () => {
  beforeEach(() => {
    fetchApiResponse.mockReset();
    getConfigValue.mockReset();
    setConfigValue.mockReset();
    delete process.env.CODEANT_API_TOKEN;
  });

  it('revokes the server key before clearing local authentication', async () => {
    getConfigValue.mockReturnValue('key');
    fetchApiResponse.mockResolvedValue({ data: { status: 'logged_out' } });

    await expect(logoutCodeAnt()).resolves.toEqual({
      wasLoggedIn: true,
      serverRevoked: true,
      warning: undefined,
    });
    expect(fetchApiResponse).toHaveBeenCalledWith('/extension/logout', {
      method: 'POST',
      body: {},
      signal: expect.any(AbortSignal),
    });
    expect(setConfigValue).toHaveBeenCalledWith('apiKeyV2', null);
  });

  it('still clears the local key and reports when revocation cannot be confirmed', async () => {
    getConfigValue.mockReturnValue('key');
    fetchApiResponse.mockRejectedValue(new Error('offline'));

    const result = await logoutCodeAnt();

    expect(result.serverRevoked).toBe(false);
    expect(result.warning).toMatch(/could not be confirmed.*offline/);
    expect(setConfigValue).toHaveBeenCalledWith('apiKeyV2', null);
  });

  it('bounds server revocation and still clears local authentication', async () => {
    vi.useFakeTimers();
    try {
      getConfigValue.mockReturnValue('key');
      process.env.CODEANT_API_TOKEN = 'environment-key';
      fetchApiResponse.mockImplementation((_endpoint, { signal }) => (
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('revocation timed out')), { once: true });
        })
      ));

      const logout = logoutCodeAnt({ revocationTimeoutMs: 25 });
      await vi.advanceTimersByTimeAsync(25);

      await expect(logout).resolves.toEqual({
        wasLoggedIn: true,
        serverRevoked: false,
        warning: expect.stringContaining('revocation timed out'),
      });
      expect(setConfigValue).toHaveBeenCalledWith('apiKeyV2', null);
      expect(process.env.CODEANT_API_TOKEN).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
