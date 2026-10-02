import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchAppApi } = vi.hoisted(() => ({ fetchAppApi: vi.fn() }));

vi.mock('../src/utils/fetchApi.js', () => ({ fetchAppApi }));

const { fetchPaginated } = await import('../src/findings/paginate.js');

const tenant = { organization: 'CodeAnt-AI' };
const page = (body) => ({
  total: 260,
  limit: body.limit,
  offset: body.offset,
  items: Array.from({ length: Math.max(0, Math.min(body.limit, 260 - body.offset)) }, (_, index) => body.offset + index),
});

describe('paged findings fetch', () => {
  beforeEach(() => {
    fetchAppApi.mockReset();
    fetchAppApi.mockImplementation(async (_path, _method, body) => page(body));
  });

  it('fetches one page of 500 by default', async () => {
    const result = await fetchPaginated('/x/paginated', { org: 'o' }, tenant, 'items');

    expect(fetchAppApi).toHaveBeenCalledTimes(1);
    expect(fetchAppApi).toHaveBeenCalledWith('/x/paginated', 'POST', { org: 'o', limit: 500, offset: 0 }, tenant);
    expect(result.items).toHaveLength(260);
  });

  it('merges every page from the starting offset with all', async () => {
    const result = await fetchPaginated('/x/paginated', {}, tenant, 'items', { limit: 25, offset: 50, all: true });

    expect(fetchAppApi.mock.calls.map((call) => call[2].offset)).toEqual(
      Array.from({ length: 9 }, (_, index) => 50 + index * 25),
    );
    expect(result.items).toEqual(Array.from({ length: 210 }, (_, index) => 50 + index));
    expect(result.total).toBe(260);
  });

  it.each([
    [{ limit: 50 }, /--limit/],
    [{ limit: 25, offset: 30 }, /--offset/],
    [{ offset: -500 }, /--offset/],
  ])('rejects %o before calling the API', async (options, message) => {
    await expect(fetchPaginated('/x/paginated', {}, tenant, 'items', options)).rejects.toThrow(message);
    expect(fetchAppApi).not.toHaveBeenCalled();
  });
});
