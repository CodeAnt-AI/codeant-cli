import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchApi } = vi.hoisted(() => ({ fetchApi: vi.fn() }));

vi.mock('../src/utils/fetchApi.js', () => ({ fetchApi }));

const {
  fetchDeadCodeResults,
  fetchDuplicateCodeResults,
  fetchIacResults,
  fetchScaResults,
} = await import('../src/scans/fetchAdvancedScanResults.js');
const { fetchDismissedAlerts } = await import('../src/scans/fetchDismissedAlerts.js');
const { fetchIssueOverrides } = await import('../src/scans/fetchIssueOverrides.js');
const { runDismissed, runOverrides } = await import('../src/commands/scans/dismissed.js');
const { normalizeIssue } = await import('../src/commands/scans/lib/normalize.js');

const SHA = 'a'.repeat(40);

describe('dismissed and false-positive markers', () => {
  beforeEach(() => fetchApi.mockReset());

  it('flattens duplicate-code groups into linked findings and sends the filters', async () => {
    fetchApi.mockResolvedValue({
      status: 'done',
      results: [[
        { fileName: `/mnt/repo/${SHA}/src/a.py`, window: '[10-20]', originalIndex: 4, is_dismissed: true },
        { fileName: `/mnt/repo/${SHA}/src/b.py`, window: '[30-40]', originalIndex: 4, is_dismissed: true },
      ]],
    });

    const result = await fetchDuplicateCodeResults('org/repo', SHA, { filterDismissed: true, includeFalsePositives: false });

    expect(fetchApi).toHaveBeenCalledWith('/extension/scans2/fetch-advanced-results', 'POST', {
      repo: 'org/repo',
      commit_id: SHA,
      result_type: 'duplicate_code',
      filter_dismissed: true,
      include_false_positives: false,
    });
    expect(result.issues.map((i) => [i.file_path, i.file_line_range, i.duplicate_locations])).toEqual([
      ['src/a.py', [10, 20], ['src/b.py:30-40']],
      ['src/b.py', [30, 40], ['src/a.py:10-20']],
    ]);
    expect(result.issues.every((i) => i.duplicate_group === 4 && i.is_dismissed === true)).toBe(true);
  });

  it('keeps backend markers on flattened IaC checks', async () => {
    fetchApi.mockResolvedValue({
      status: 'done',
      results: [{
        check_type: 'terraform',
        results: {
          failed_checks: [
            { file_path: '/main.tf', check_id: 'CKV_1', file_line_range: [1, 9], is_dismissed: false, is_false_positive: true },
            { file_path: '/main.tf', check_id: 'CKV_2', file_line_range: [3, 4], is_dismissed: true, reason_for_dismiss: 'r' },
          ],
        },
      }],
    });

    const { issues } = await fetchIacResults('org/repo', SHA);

    expect(issues.map((i) => [i.check_id, i.is_dismissed, i.is_false_positive, i.reason_for_dismiss])).toEqual([
      ['CKV_1', false, true, undefined],
      ['CKV_2', true, undefined, 'r'],
    ]);
  });

  it('keeps backend markers on every dead-code section', async () => {
    fetchApi.mockResolvedValue({
      status: 'done',
      dead_code: {
        python_dead_code: [{ file_path: 'app.py', issues: [{ line_number: 4, issue: "unused function 'f' (60% confidence)", is_dismissed: true }] }],
        js_dead_code: {
          unused_files: ['src/old.js', 'src/keep.js'],
          dismissed_unused_files: ['src/old.js'],
          unused_exports: [['src/lib.js', [{ name: 'gone', line: 3, is_dismissed: true }]]],
        },
        extra_dead_code: {
          results: {
            [`org/repo/${SHA}/svc/run.py/dead_code.json`]: [
              { line_number: 7, issue_text: 'Remove unused x', 'message-id': 'python:S1481', is_dismissed: false },
            ],
          },
        },
      },
    });

    const { issues } = await fetchDeadCodeResults('org/repo', SHA);

    expect(issues.map((i) => [i.type, i.file_path, i.is_dismissed])).toEqual([
      ['unused_function', 'app.py', true],
      ['unused_file', 'src/old.js', true],
      ['unused_file', 'src/keep.js', false],
      ['unused_export', 'src/lib.js', true],
      ['S1481', 'svc/run.py', false],
    ]);
  });

  it('reads SCA severity from the advisory rating', async () => {
    fetchApi.mockResolvedValue({
      status: 'done',
      results: { all_vulnerabilities: [{ package_name: 'lodash', ratings: [{ severity: 'low' }] }], healthy_packages: [] },
    });

    const { issues } = await fetchScaResults('org/repo', SHA);

    expect(issues[0].severity).toBe('low');
  });

  it('keeps dismissals whose keys have no file part', async () => {
    fetchApi.mockResolvedValue({
      status: 'success',
      data: {
        'lodash@4.17.0': { reason_for_dismiss: 'unused' },
        'src/a.py||::||12||::||rule': { reason_for_dismiss: 'fixed' },
      },
    });

    const { dismissedAlerts } = await fetchDismissedAlerts('org/repo', 'sca');

    expect(dismissedAlerts.map((d) => [d.issue_key, d.file_path, d.reason_for_dismiss])).toEqual([
      ['lodash@4.17.0', '', 'unused'],
      ['src/a.py||::||12||::||rule', 'src/a.py', 'fixed'],
    ]);
  });

  it('maps result-type names to the stores dismissals and overrides live in', async () => {
    fetchApi.mockResolvedValue({ status: 'success', data: { k: { false_positive: true } } });

    const dismissed = await runDismissed({ repo: 'org/repo', analysisType: 'anti_patterns' });
    const overrides = await runOverrides({ repo: 'org/repo', analysisType: 'sast' });

    expect(fetchApi).toHaveBeenNthCalledWith(1, '/extension/scans2/dismiss-alerts/get', 'POST', {
      repo: 'org/repo',
      analysis_type: 'antipatterns',
    });
    expect(fetchApi).toHaveBeenNthCalledWith(2, '/extension/scans2/change-issue-details/get', 'POST', {
      repo: 'org/repo',
      analysis_type: 'security',
    });
    expect(dismissed.analysis_type).toBe('antipatterns');
    expect(overrides).toEqual({
      repo: 'org/repo',
      analysis_type: 'security',
      total: 1,
      overrides: { k: { false_positive: true } },
    });
  });

  it('reports override fetch failures', async () => {
    fetchApi.mockResolvedValue({ status: 'error', message: 'Unauthorized' });

    await expect(fetchIssueOverrides('org/repo', 'iac')).resolves.toEqual({ success: false, error: 'Unauthorized' });
  });

  it('surfaces markers and duplicate links in normalized findings', () => {
    const finding = normalizeIssue({
      file_path: 'src/a.py',
      line_number: 10,
      check_id: 'duplicate-code',
      message: 'Duplicated block (2 locations)',
      duplicate_group: 4,
      duplicate_locations: ['src/b.py:30-40'],
      is_dismissed: true,
      reason_for_dismiss: 'intentional',
      comment_for_dismiss: 'kept for the v1 API',
      is_false_positive: true,
    }, 'duplicate_code');

    expect(finding.metadata).toEqual({
      duplicate_group: 4,
      duplicate_locations: ['src/b.py:30-40'],
      dismissed: true,
      reason_for_dismiss: 'intentional',
      comment_for_dismiss: 'kept for the v1 API',
      false_positive: true,
    });
  });

  it('marks secrets with a FALSE_POSITIVE confidence as false positives', () => {
    const finding = normalizeIssue(
      { file_path: '.env', line_number: 1, type: 'AWS Key', confidence_score: 'false_positive' },
      'secrets'
    );

    expect(finding.metadata.false_positive).toBe(true);
  });
});
