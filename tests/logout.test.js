import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchApi, getConfigValue, setConfigValue } = vi.hoisted(() => ({
  fetchApi: vi.fn(),
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
}));

vi.mock('../src/utils/fetchApi.js', () => ({ fetchApi }));
vi.mock('../src/utils/config.js', () => ({ getConfigValue, setConfigValue }));

const { logoutCodeAnt } = await import('../src/utils/logout.js');

describe('logoutCodeAnt', () => {
  beforeEach(() => {
    fetchApi.mockReset();
    getConfigValue.mockReset();
    setConfigValue.mockReset();
    delete process.env.CODEANT_API_TOKEN;
  });

  it('revokes the server key before clearing local authentication', async () => {
    getConfigValue.mockReturnValue('key');
    fetchApi.mockResolvedValue({ status: 'logged_out' });

    await expect(logoutCodeAnt()).resolves.toEqual({
      wasLoggedIn: true,
      serverRevoked: true,
      warning: undefined,
    });
    expect(fetchApi).toHaveBeenCalledWith('/extension/logout', 'POST', {});
    expect(setConfigValue).toHaveBeenCalledWith('apiKeyV2', null);
  });

  it('still clears the local key and reports when revocation cannot be confirmed', async () => {
    getConfigValue.mockReturnValue('key');
    fetchApi.mockRejectedValue(new Error('offline'));

    const result = await logoutCodeAnt();

    expect(result.serverRevoked).toBe(false);
    expect(result.warning).toMatch(/could not be confirmed.*offline/);
    expect(setConfigValue).toHaveBeenCalledWith('apiKeyV2', null);
  });
});
