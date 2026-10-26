import { fetchApiResponse } from '../utils/fetchApi.js';

async function historyRequest(action, body) {
  const response = await fetchApiResponse(`/extension/scans2/secrets/history/${action}`, {
    method: 'POST', body, allowHttpError: true,
  });
  if (!response.ok) {
    if (response.status === 405 || (response.status === 404 && (!response.data || response.data.detail === 'Not Found' || response.data.message === 'Not Found'))) {
      throw new Error('This backend does not support historical_secrets_v1. Upgrade the backend before requesting history scans.');
    }
    throw new Error(response.data?.error || response.data?.message || `History request failed (HTTP ${response.status})`);
  }
  if (!response.data || typeof response.data.status !== 'string' || (action === 'results' && !Array.isArray(response.data.findings))) {
    throw new Error('Invalid history API response; verify the backend supports historical_secrets_v1.');
  }
  return response.data;
}

export function getHistoryStatus({ repo, run } = {}) {
  if (!repo) throw new Error('--repo is required');
  return historyRequest('status', { repo, ...(run ? { scan_run_id: run } : {}) });
}

export function getHistoryResults(repo, commitId, opts = {}) {
  return historyRequest('results', {
    repo,
    ...(commitId ? { commit_id: commitId } : {}),
    ...(opts.historyRun ? { scan_run_id: opts.historyRun } : {}),
    filter_dismissed: opts.filterDismissed ?? false,
    include_false_positives: opts.includeFalsePositives ?? true,
  });
}
