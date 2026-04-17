import { fetchApi } from '../utils/fetchApi.js';

/**
 * Fetch dismissed alerts for a repository.
 *
 * Issue keys use the format: "file_path||::||context_code_block||::||test_id"
 * For secrets the format is:  "file_path||::||line_number||::||type"
 *
 * @param {string} repo         - "org/repo-name"
 * @param {string} analysisType - e.g. "security" (default)
 * @returns {Promise<{ success: boolean, dismissedAlerts?: Array, error?: string }>}
 */
export async function fetchDismissedAlerts(repo, analysisType = 'security') {
  try {
    const response = await fetchApi('/extension/scans2/dismiss-alerts/get', 'POST', {
      repo,
      analysis_type: analysisType,
    });

    if (!response) {
      return { success: false, error: 'Failed to connect to CodeAnt server' };
    }

    if (response.status === 'error') {
      return { success: false, error: response.message || 'Failed to fetch dismissed alerts' };
    }

    const dismissData = response.data || {};
    const dismissedAlerts = [];

    for (const [issueKey, dismissInfo] of Object.entries(dismissData)) {
      if (!issueKey.includes('||::||')) continue;

      const parts = issueKey.split('||::||');
      let file_path = parts[0] || '';
      const part1 = parts[1] || '';
      const part2 = parts[2] || '';

      if (file_path.endsWith('/security_issues.json')) {
        file_path = file_path.replace('/security_issues.json', '');
      }

      dismissedAlerts.push({
        file_path,
        context_code_block: part1,
        test_id: part2,
        line_number: parseInt(part1, 10) || 0,
        type: part2,
        issue_key: issueKey,
        reason_for_dismiss: dismissInfo.reason_for_dismiss || '',
        comment_for_dismiss: dismissInfo.comment_for_dismiss || '',
      });
    }

    return { success: true, dismissedAlerts };
  } catch (error) {
    return { success: false, error: error.message || 'Failed to fetch dismissed alerts' };
  }
}
