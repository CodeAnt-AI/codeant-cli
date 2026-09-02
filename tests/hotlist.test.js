import { beforeEach, describe, expect, it, vi } from 'vitest';

const { validateConnection, fetchAppApi } = vi.hoisted(() => ({
  validateConnection: vi.fn(),
  fetchAppApi: vi.fn(),
}));

vi.mock('../src/scans/connectionHandler.js', () => ({ validateConnection }));
vi.mock('../src/utils/fetchApi.js', () => ({ fetchAppApi }));

const { resolveHotlistTenant, runHotlistGet, runHotlistList } = await import('../src/hotlist/client.js');

const connectionResult = {
  success: true,
  connections: [
    { organizationName: 'CodeAnt-AI', service: 'github', baseUrl: 'https://github.example.com' },
  ],
};

describe('Hotlist client', () => {
  beforeEach(() => {
    validateConnection.mockReset();
    fetchAppApi.mockReset();
    validateConnection.mockResolvedValue(connectionResult);
  });

  it('resolves provider context from the authenticated connection', async () => {
    await expect(resolveHotlistTenant({ org: 'CodeAnt-AI', service: 'github' })).resolves.toEqual({
      organization: 'CodeAnt-AI',
      service: 'github',
      providerBaseUrl: 'https://github.example.com',
      requestBody: {
        org: 'CodeAnt-AI',
        organization: 'CodeAnt-AI',
        service: 'github',
        github_base_url: 'https://github.example.com',
      },
    });
  });

  it('passes UI-compatible filters and follows every cursor', async () => {
    fetchAppApi
      .mockResolvedValueOnce({ state: 'ready', items: [{ id: 'a' }], has_more: true, next_cursor: 'next' })
      .mockResolvedValueOnce({ state: 'ready', items: [{ id: 'b' }], has_more: false, next_cursor: null });

    const result = await runHotlistList({
      org: 'CodeAnt-AI',
      service: 'github',
      severities: 'critical,high',
      validation: 'exploit_confirmed',
      limit: 25,
      all: true,
    });

    expect(fetchAppApi).toHaveBeenNthCalledWith(1, '/explorer/security/hotlist/query', 'POST', expect.objectContaining({
      filters: expect.objectContaining({
        severities: ['critical', 'high'],
        validation: ['exploit_confirmed'],
      }),
      limit: 25,
      cursor: null,
    }), expect.objectContaining({ organization: 'CodeAnt-AI', service: 'github' }));
    expect(fetchAppApi).toHaveBeenNthCalledWith(2, '/explorer/security/hotlist/query', 'POST', expect.objectContaining({ cursor: 'next' }), expect.any(Object));
    expect(result.items).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(result.returned_count).toBe(2);
  });

  it('gets one finding by stable ID', async () => {
    const findingId = '0123456789abcdef0123456789abcdef';
    fetchAppApi.mockResolvedValue({ state: 'ready', item: { id: findingId } });

    const result = await runHotlistGet({ findingId, org: 'CodeAnt-AI', service: 'github' });

    expect(fetchAppApi).toHaveBeenCalledWith('/explorer/security/hotlist/finding', 'POST', expect.objectContaining({
      finding_id: findingId,
      organization: 'CodeAnt-AI',
      service: 'github',
    }), expect.any(Object));
    expect(result.item.id).toBe(findingId);
  });

  it('rejects unstable or malformed finding identifiers', async () => {
    await expect(runHotlistGet({ findingId: 'src/app.py:12' })).rejects.toThrow(/32-character stable ID/);
    expect(validateConnection).not.toHaveBeenCalled();
  });
});
