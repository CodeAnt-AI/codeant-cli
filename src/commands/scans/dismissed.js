import { fetchDismissedAlerts } from '../../scans/fetchDismissedAlerts.js';
import { fetchIssueOverrides } from '../../scans/fetchIssueOverrides.js';

// Result-type names (`scans results --types`) → the names dismissals and
// overrides are stored under.
const STORE_ANALYSIS_TYPES = {
  sast: 'security',
  security_issues: 'security',
  anti_patterns: 'antipatterns',
};

export function storeAnalysisType(analysisType) {
  return STORE_ANALYSIS_TYPES[analysisType] || analysisType;
}

function requireRepo(repo) {
  if (!repo) {
    const err = new Error('--repo is required');
    err.exitCode = 1;
    throw err;
  }
}

/**
 * codeant scans dismissed --repo <repo> [--analysis-type <type>]
 */
export async function runDismissed({ repo, analysisType = 'security' } = {}) {
  requireRepo(repo);
  const type = storeAnalysisType(analysisType);

  const result = await fetchDismissedAlerts(repo, type);
  if (!result.success) {
    const err = new Error(result.error || 'Failed to fetch dismissed alerts');
    err.exitCode = 1;
    throw err;
  }

  return {
    repo,
    analysis_type: type,
    total: result.dismissedAlerts.length,
    dismissed_alerts: result.dismissedAlerts,
  };
}

/**
 * codeant scans overrides --repo <repo> [--analysis-type security|secrets|iac|sca]
 */
export async function runOverrides({ repo, analysisType = 'security' } = {}) {
  requireRepo(repo);
  const type = storeAnalysisType(analysisType);

  const result = await fetchIssueOverrides(repo, type);
  if (!result.success) {
    const err = new Error(result.error || 'Failed to fetch issue overrides');
    err.exitCode = 1;
    throw err;
  }

  return {
    repo,
    analysis_type: type,
    total: Object.keys(result.overrides).length,
    overrides: result.overrides,
  };
}
