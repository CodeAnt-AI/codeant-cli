import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchApi: vi.fn(), fetchApiResponse: vi.fn(), resolveScan: vi.fn() }));
vi.mock('../src/utils/fetchApi.js', () => ({ fetchApi: mocks.fetchApi, fetchApiResponse: mocks.fetchApiResponse }));
vi.mock('../src/commands/scans/lib/resolveScan.js', () => ({ resolveScan: mocks.resolveScan }));

import { fetchSecretsResults, fetchScaResults } from '../src/scans/fetchAdvancedScanResults.js';
import { getHistoryStatus } from '../src/scans/historySecrets.js';
import { runResults } from '../src/commands/scans/results.js';
import { runStartScan } from '../src/commands/scans/start-scan.js';
import { normalizeIssue } from '../src/commands/scans/lib/normalize.js';
import csv from '../src/commands/scans/formatters/csv.js';
import sarif from '../src/commands/scans/formatters/sarif.js';

const repo = 'org/repo';
const commit = 'a'.repeat(40);
const run = '9d7d70ad-3b32-4d3f-9f9a-222222222222';
const occurrence = { filename: 'old.env', line_number: 2, commit: 'b'.repeat(40), type: 'example', hashed_secret: 'hash', branches: ['feature'], tags: ['v1'], only_in_history: true, verification_status: 'revoked', live_status: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveScan.mockResolvedValue({ commit_id: commit });
  mocks.fetchApiResponse.mockResolvedValue({ ok: true, status: 200, data: { findings: [occurrence], status: 'completed', run: { scan_run_id: run, status: 'completed' } } });
});

describe('history results contract', () => {
  it('preserves occurrence and validation metadata through the envelope and exports', async () => {
    const envelope = await runResults({ repo, types: 'secrets', secretsScope: 'history', historyRun: run, returnEnvelope: true });
    expect(mocks.fetchApi).not.toHaveBeenCalled();
    expect(mocks.fetchApiResponse.mock.calls[0][1].body).toMatchObject({ scan_run_id: run, commit_id: commit });
    expect(envelope.schema_version).toBe('1.1');
    expect(envelope.history_run.scan_run_id).toBe(run);
    expect(envelope.findings[0]).toMatchObject({ file_path: 'old.env', metadata: { commit: occurrence.commit, verification_status: 'revoked', live_status: null, only_in_history: true } });
    expect(csv.render(envelope)).toContain('verification_status');
    expect(JSON.parse(sarif.render(envelope)).runs[0].results[0].properties.metadata.tags).toEqual(['v1']);
    expect(JSON.stringify(envelope)).not.toContain('hashed_secret');
  });

  it('works without a snapshot and keeps run metadata separate', async () => {
    mocks.resolveScan.mockRejectedValue(Object.assign(new Error('no scans found'), { exitCode: 2 }));
    const envelope = await runResults({ repo, types: 'secrets', secretsScope: 'history', returnEnvelope: true });
    expect(envelope.scan).toBeNull();
    expect(mocks.fetchApiResponse.mock.calls[0][1].body).not.toHaveProperty('commit_id');
  });

  it('does not hide auth failures as a missing snapshot', async () => {
    mocks.resolveScan.mockRejectedValue(Object.assign(new Error('unauthorized'), { exitCode: 1 }));
    await expect(runResults({ repo, types: 'secrets', secretsScope: 'history', returnEnvelope: true })).rejects.toThrow('unauthorized');
  });

  it('merges only matching current occurrences and retains distinct historical commits', async () => {
    mocks.fetchApi.mockResolvedValue({ secrets: { 'old.env': [{ type: 'example', hashed_secret: 'hash', line_number: 8 }] }, status: 'done' });
    const result = await fetchSecretsResults(repo, commit, { secretsScope: 'all' });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].history_occurrences[0].commit).toBe(occurrence.commit);
    const history = await fetchSecretsResults(repo, commit, { secretsScope: 'history' });
    const first = normalizeIssue(history.issues[0], 'secrets');
    const second = normalizeIssue({ ...history.issues[0], commit: 'c'.repeat(40) }, 'secrets');
    expect(first.id).not.toBe(second.id);
  });

  it('projects metadata without dropping the run state', async () => {
    const envelope = await runResults({ repo, types: 'secrets', secretsScope: 'history', fields: 'id,metadata', returnEnvelope: true });
    expect(Object.keys(envelope.findings[0])).toEqual(['id', 'metadata']);
    expect(envelope.history_run.status).toBe('completed');
  });

  it('keeps repeated same-line history occurrences distinct without changing IDs in other commits', async () => {
    const findings = [occurrence, { ...occurrence, filename: `/mnt/code/${occurrence.commit}/old.env` }, { ...occurrence, commit: 'c'.repeat(40) }];
    mocks.fetchApiResponse.mockResolvedValue({ ok: true, status: 200, data: { findings, status: 'completed' } });
    const first = (await fetchSecretsResults(repo, commit, { secretsScope: 'history' })).issues.map((issue) => normalizeIssue(issue, 'secrets'));
    expect(new Set(first.map((finding) => finding.id)).size).toBe(3);
    expect(first.map((finding) => finding.metadata.occurrence_index)).toEqual([0, 1, 0]);
    mocks.fetchApiResponse.mockResolvedValue({ ok: true, status: 200, data: { findings: [...findings].reverse(), status: 'completed' } });
    const reordered = (await fetchSecretsResults(repo, commit, { secretsScope: 'history' })).issues.map((issue) => normalizeIssue(issue, 'secrets'));
    expect(reordered.map((finding) => finding.id).sort()).toEqual(first.map((finding) => finding.id).sort());
  });

  it('reports unsupported backends explicitly before starting work', async () => {
    mocks.fetchApiResponse.mockResolvedValue({ ok: false, status: 404, data: { detail: 'Not Found' } });
    await expect(getHistoryStatus({ repo })).rejects.toThrow('Upgrade the backend');
    await expect(runResults({ repo, types: 'secrets', secretsScope: 'history', returnEnvelope: true })).rejects.toThrow('Upgrade the backend');
    await expect(runStartScan({ repo, branch: 'main', commit, types: 'historical_secrets', returnResult: true })).rejects.toThrow('Upgrade the backend');
    expect(mocks.fetchApi).not.toHaveBeenCalled();
  });

  it('distinguishes repository access errors from unsupported backends', async () => {
    mocks.fetchApiResponse.mockResolvedValue({ ok: false, status: 404, data: { error: 'Scan results not found' } });
    await expect(getHistoryStatus({ repo })).rejects.toThrow('Scan results not found');
  });

  it('rejects malformed success responses', async () => {
    mocks.fetchApiResponse.mockResolvedValue({ ok: true, status: 200, data: '<html>wrong server</html>' });
    await expect(getHistoryStatus({ repo })).rejects.toThrow('Invalid history API response');
  });

  it('starts exactly the requested scanners and returns the run ID', async () => {
    mocks.fetchApi.mockResolvedValue({ scan_run_id: run, message: 'Analysis started' });
    const result = await runStartScan({ repo, branch: 'main', commit, types: 'historical_secrets', returnResult: true });
    expect(mocks.fetchApi).toHaveBeenCalledWith('/extension/analysis/run', 'POST', { repo, branch: 'main', commit_id: commit, scan_types: ['historical_secrets'] });
    expect(result.scan_run_id).toBe(run);
  });

  it('keeps the default on snapshot results', async () => {
    mocks.fetchApi.mockResolvedValue({ secrets: {}, status: 'done' });
    await fetchSecretsResults(repo, commit);
    expect(mocks.fetchApiResponse).not.toHaveBeenCalled();
  });

  it('rejects invalid scopes and scanner names', async () => {
    await expect(runResults({ repo, secretsScope: 'bad' })).rejects.toThrow('Invalid --secrets-scope');
    await expect(runStartScan({ repo, types: 'bad' })).rejects.toThrow('Invalid --types');
  });
});

describe('SCA remediation contract', () => {
  it('retains manifest, paths and fixed versions through fetch and normalization', async () => {
    const dependencyPaths = [{ manifest: 'apps/web/package.json', lockfile: 'pnpm-lock.yaml', packages: ['direct@1', 'vulnerable@1'], direct_dependency: 'direct@1', resolution: 'COMMITTED_LOCK' }];
    mocks.fetchApi.mockResolvedValue({ status: 'done', results: { dependency_paths_status: 'done', all_vulnerabilities: [{ package_name: 'vulnerable', package_version: '1', ecosystem: 'NPM', cve_id: 'CVE-EXAMPLE', relative_path: 'apps/web/package.json', dependency_paths: dependencyPaths, dependency_paths_status: 'resolved', fix_details: { fixed_version: '2', fix_available: true } }] } });
    const result = await fetchScaResults(repo, commit);
    const finding = normalizeIssue(result.issues[0], 'sca');
    expect(finding).toMatchObject({ file_path: 'apps/web/package.json', metadata: { dependency_paths: dependencyPaths, fix_version: '2', fix_available: true } });
    expect(result.dependencyPathsStatus).toBe('done');
    expect(finding.id).not.toBe(normalizeIssue({ ...result.issues[0], package_version: '3' }, 'sca').id);
  });
});
