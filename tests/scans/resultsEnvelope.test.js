import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveScan, fetchSastResults, fetchSecretsResults, startScan } = vi.hoisted(() => ({
  resolveScan: vi.fn(),
  fetchSastResults: vi.fn(),
  fetchSecretsResults: vi.fn(),
  startScan: vi.fn(),
}));

vi.mock('../../src/commands/scans/lib/resolveScan.js', () => ({ resolveScan }));
vi.mock('../../src/commands/scans/lib/categories.js', () => ({
  parseTypes: (types) => [
    { key: 'sast', fetcher: fetchSastResults, kind: 'code' },
    { key: 'secrets', fetcher: fetchSecretsResults, kind: 'secret' },
  ].filter((c) => types === 'all' || types.split(',').includes(c.key)),
}));
vi.mock('../../src/scans/startScan.js', () => ({ startScan }));

const { buildResultsEnvelope } = await import('../../src/commands/scans/results.js');
const { runStartScan } = await import('../../src/commands/scans/start-scan.js');

describe('buildResultsEnvelope', () => {
  beforeEach(() => {
    resolveScan.mockReset().mockResolvedValue({ commit_id: 'abc', branch: 'main', resolved_by: 'latest' });
    fetchSastResults.mockReset().mockResolvedValue({
      success: true,
      issues: [
        { file_path: 'b.js', line_number: 4, severity: 'low', check_id: 'S1', message: 'low one' },
        { file_path: 'a.js', line_number: 9, severity: 'high', check_id: 'S2', message: 'high one' },
      ],
    });
    fetchSecretsResults.mockReset().mockResolvedValue({
      success: true,
      issues: [{ file_path: 'c.env', line_number: 1, severity: 'critical', type: 'aws', message: 'key' }],
    });
  });

  it('returns a sorted, paginated envelope with pre-pagination summary and no stdout output', async () => {
    const write = vi.spyOn(process.stdout, 'write');

    const envelope = await buildResultsEnvelope({ repo: 'acme/a', types: 'all', limit: 2 });

    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
    expect(envelope.findings.map((f) => f.severity)).toEqual(['critical', 'high']);
    expect(envelope.summary.total).toBe(3);
    expect(envelope.summary.by_category).toEqual({ sast: 2, secrets: 1 });
    expect(envelope.pagination).toMatchObject({ limit: 2, offset: 0 });
  });

  it('applies severity filters and field projection', async () => {
    const envelope = await buildResultsEnvelope({ repo: 'acme/a', types: 'sast', severity: 'high', fields: 'file_path,severity' });

    expect(envelope.findings).toEqual([{ file_path: 'a.js', severity: 'high' }]);
    expect(envelope.summary.total).toBe(1);
  });

  it('records category failures instead of throwing unless failFast is set', async () => {
    fetchSecretsResults.mockResolvedValue({ success: false, error: 'boom' });
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const envelope = await buildResultsEnvelope({ repo: 'acme/a', types: 'all' });
    expect(envelope.errors).toEqual([{ category: 'secrets', error: 'boom' }]);
    await expect(buildResultsEnvelope({ repo: 'acme/a', types: 'all', failFast: true })).rejects.toThrow('secrets');

    errSpy.mockRestore();
  });
});

describe('runStartScan', () => {
  beforeEach(() => startScan.mockReset());

  it('returns the resolved repo, branch and commit along with the API response', async () => {
    startScan.mockResolvedValue({ success: true, message: 'queued', run_id: 'r1' });
    const log = vi.spyOn(console, 'log');

    const result = await runStartScan({ repo: 'acme/a', branch: 'main', commit: 'abc', include: 'src/**,lib/*.{js,ts}' });

    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
    expect(result).toEqual({ repo: 'acme/a', branch: 'main', commit: 'abc', message: 'queued', run_id: 'r1' });
    expect(startScan).toHaveBeenCalledWith({
      repo: 'acme/a',
      branch: 'main',
      commitId: 'abc',
      includeFiles: ['src/**', 'lib/*.{js,ts}'],
      excludeFiles: undefined,
    });
  });

  it('defaults the message and throws on API errors', async () => {
    startScan.mockResolvedValueOnce({ success: true });
    expect((await runStartScan({ repo: 'acme/a', branch: 'main', commit: 'abc' })).message).toBe('Analysis started');

    startScan.mockResolvedValueOnce({ success: false, error: 'nope' });
    await expect(runStartScan({ repo: 'acme/a', branch: 'main', commit: 'abc' })).rejects.toThrow('nope');
  });
});
