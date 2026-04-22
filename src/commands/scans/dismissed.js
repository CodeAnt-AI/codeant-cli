import { fetchDismissedAlerts } from '../../scans/fetchDismissedAlerts.js';

/**
 * codeant scans dismissed --repo <repo> [--analysis-type security|secrets]
 */
export async function runDismissed({ repo, analysisType = 'security' } = {}) {
  if (!repo) {
    const err = new Error('--repo is required');
    err.exitCode = 1;
    throw err;
  }

  const result = await fetchDismissedAlerts(repo, analysisType);
  if (!result.success) {
    const err = new Error(result.error || 'Failed to fetch dismissed alerts');
    err.exitCode = 1;
    throw err;
  }

  return {
    repo,
    analysis_type: analysisType,
    total: result.dismissedAlerts.length,
    dismissed_alerts: result.dismissedAlerts,
  };
}
