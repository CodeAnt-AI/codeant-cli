import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchApiResponse } = vi.hoisted(() => ({ fetchApiResponse: vi.fn() }));

vi.mock('../src/utils/fetchApi.js', () => ({ fetchApiResponse }));

const {
  normalizeApiPath,
  parseHeaders,
  parseJsonObject,
  parseJsonValue,
  runApiRequest,
} = await import('../src/commands/api/request.js');

describe('authenticated API request', () => {
  beforeEach(() => fetchApiResponse.mockReset());

  it('accepts only paths on the configured CodeAnt API host', () => {
    expect(normalizeApiPath('/extension/scans2/validate?x=1')).toBe('/extension/scans2/validate?x=1');
    expect(() => normalizeApiPath('https://example.com/steal')).toThrow(/must be relative/);
    expect(() => normalizeApiPath('//example.com/steal')).toThrow(/must be relative/);
  });

  it('rejects auth and transport header overrides', () => {
    expect(parseHeaders(['If-Match: revision-1'])).toEqual({ 'If-Match': 'revision-1' });
    expect(() => parseHeaders(['Authorization: Bearer attacker'])).toThrow(/cannot be overridden/);
    expect(() => parseHeaders(['Cookie: session=secret'])).toThrow(/cannot be overridden/);
  });

  it('requires an object query and accepts any JSON body value', () => {
    expect(parseJsonObject('{"page":1}', 'query')).toEqual({ page: 1 });
    expect(() => parseJsonObject('[1]', 'body')).toThrow(/must be a JSON object/);
    expect(parseJsonValue('[1,2]', 'body')).toEqual([1, 2]);
  });

  it('returns status and data from an authenticated relative request', async () => {
    fetchApiResponse.mockResolvedValue({ ok: true, status: 200, data: { result: 'ok' } });

    const result = await runApiRequest({
      path: '/example',
      method: 'post',
      query: '{"page":2}',
      body: '{"org":"CodeAnt-AI"}',
      headers: ['If-Match: revision-1'],
    });

    expect(fetchApiResponse).toHaveBeenCalledWith('/example', {
      method: 'POST',
      query: { page: 2 },
      body: { org: 'CodeAnt-AI' },
      headers: { 'If-Match': 'revision-1' },
      allowHttpError: true,
    });
    expect(result).toEqual({ ok: true, status: 200, data: { result: 'ok' } });
  });
});
