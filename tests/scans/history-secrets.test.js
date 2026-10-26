import { beforeAll, describe, expect, it } from 'vitest';
import { runAsync, REPO, TIMEOUT } from './helpers.js';

// Opt into an existing completed history + SCA fixture. These tests never
// initiate scans or change repository settings.
const historyRun = process.env.CODEANT_HISTORY_RUN;
const commit = process.env.CODEANT_HISTORY_COMMIT;
const enabled = !!historyRun && !!commit;

describe.skipIf(!enabled)('live history and SCA automation contracts', () => {
  let history;
  let alias;
  let status;
  let sca;
  let noSnapshot;

  beforeAll(async () => {
    const scope = ['--repo', REPO, '--scan', commit, '--types', 'secrets', '--secrets-scope', 'history', '--history-run', historyRun, '--limit', '10000', '--quiet'];
    const commands = [
      ['scans', 'results', ...scope],
      ['findings', 'repo', ...scope],
      ['scans', 'status', '--repo', REPO, '--run', historyRun],
      ['scans', 'results', '--repo', REPO, '--scan', commit, '--types', 'sca', '--limit', '10000', '--quiet'],
      ['scans', 'results', ...scope, '--scan', '0'.repeat(40)],
    ];
    const responses = await Promise.all(commands.map((args) => runAsync(...args)));
    const parsed = responses.map((response, index) => {
      expect(response.status, `${commands[index].join(' ')}: ${response.stderr}`).toBe(0);
      return JSON.parse(response.stdout);
    });
    [history, alias, status, sca, noSnapshot] = parsed;
  }, TIMEOUT * 3);

  it('reports the selected completed run and timestamps', () => {
    expect(status).toMatchObject({ scan_run_id: historyRun, status: 'completed' });
    expect(status.started_at).toBeTruthy();
    expect(status.finished_at).toBeTruthy();
  });

  it('keeps snapshot and history job identities separate', () => {
    expect(history.schema_version).toBe('1.1');
    expect(history.scan.commit_id).toBe(commit);
    expect(history.history_run.scan_run_id).toBe(historyRun);
    expect(history.errors).toEqual([]);
  });

  it('has identical findings through both command aliases', () => {
    expect(alias.findings).toEqual(history.findings);
    expect(alias.history_run).toEqual(history.history_run);
  });

  it('preserves commit/ref and native validation evidence', () => {
    expect(history.findings.length).toBeGreaterThan(0);
    for (const { metadata } of history.findings) {
      expect(metadata.commit).toMatch(/^[a-f0-9]{40}$/);
      expect(Array.isArray(metadata.branches)).toBe(true);
      expect(Array.isArray(metadata.tags)).toBe(true);
      expect(Number.isNaN(Date.parse(metadata.scanned_at))).toBe(false);
      expect(metadata.verification_status).toBeTruthy();
      expect(metadata).toHaveProperty('only_in_history');
      expect(metadata).toHaveProperty('live_status');
    }
  });

  it('assigns unique IDs to all historical occurrences', () => {
    expect(new Set(history.findings.map((finding) => finding.id)).size).toBe(history.findings.length);
  });

  it('does not classify absent snapshot evidence as history-only', () => {
    expect(noSnapshot.findings.length).toBe(history.findings.length);
    expect(noSnapshot.findings.every((finding) => finding.metadata.only_in_history === null)).toBe(true);
  });

  it('excludes credential storage from normalized output', () => {
    const forbidden = new Set(['secret', 'credentials', 'credential_id', 'capturegroups', 'componentsets']);
    function inspect(value) {
      if (!value || typeof value !== 'object') return;
      for (const [key, nested] of Object.entries(value)) {
        expect(forbidden.has(key.toLowerCase()), key).toBe(false);
        inspect(nested);
      }
    }
    inspect(history);
  });

  it('reports static dependency-path readiness', () => {
    expect(sca.category_status.sca.dependency_paths_status).toBe('done');
    expect(sca.findings.length).toBeGreaterThan(0);
    expect(sca.errors).toEqual([]);
  });

  it('preserves direct introducers, manifests, lockfiles and fixes', () => {
    const paths = sca.findings.flatMap((finding) => finding.metadata.dependency_paths);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((path) => path.lockfile)).toBe(true);
    expect(sca.findings.some((finding) => finding.metadata.fix_version)).toBe(true);
    for (const path of paths) {
      expect(path.manifest).toBeTruthy();
      expect(path.direct_dependency).toBe(path.packages[0]);
    }
    expect(sca.findings.every((finding) => finding.file_path !== 'unknown')).toBe(true);
  });
});
