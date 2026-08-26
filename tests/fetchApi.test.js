import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getConfigValue, getBaseUrl } = vi.hoisted(() => ({
  getConfigValue: vi.fn(),
  getBaseUrl: vi.fn(),
}));

vi.mock('../src/utils/config.js', () => ({ getConfigValue }));
vi.mock('../src/utils/baseUrl.js', () => ({ getBaseUrl }));

const { fetchApi, fetchApiResponse } = await import('../src/utils/fetchApi.js');

describe('fetchApi', () => {
  beforeEach(() => {
    getBaseUrl.mockReturnValue('https://api.codeant.test');
    getConfigValue.mockReturnValue(null);
    process.env.CODEANT_API_TOKEN = 'test-token';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    delete process.env.CODEANT_API_TOKEN;
    vi.unstubAllGlobals();
  });

  it('preserves the existing data-only API and bearer authentication', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ status: 'success' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(fetchApi('/validate', 'POST', { extension: 'cli' })).resolves.toEqual({ status: 'success' });
    expect(fetch).toHaveBeenCalledWith('https://api.codeant.test/validate', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      body: JSON.stringify({ extension: 'cli' }),
    }));
  });

  it('returns status metadata and supports array query parameters', async () => {
    fetch.mockResolvedValue(new Response('plain text', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }));

    await expect(fetchApiResponse('/items', { query: { tag: ['a', 'b'] } })).resolves.toEqual(expect.objectContaining({
      ok: true,
      status: 200,
      data: 'plain text',
    }));
    expect(fetch.mock.calls[0][0]).toBe('https://api.codeant.test/items?tag=a&tag=b');
  });

  it('attaches server-managed CLI tenant headers for app API calls', async () => {
    fetch.mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await fetchApiResponse('/explorer/security/hotlist/query', {
      method: 'POST',
      body: {},
      tenant: {
        organization: 'Acme',
        service: 'gitlab',
        providerBaseUrl: 'https://gitlab.acme.test',
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.codeant.test/explorer/security/hotlist/query',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-CodeAnt-CLI-Org': 'Acme',
          'X-CodeAnt-CLI-Service': 'gitlab',
          'X-CodeAnt-CLI-Base-URL': 'https://gitlab.acme.test',
        }),
      }),
    );
  });

  it('surfaces nested API error messages', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Finding not found' } }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(fetchApi('/missing')).rejects.toThrow('Finding not found');
  });
});
