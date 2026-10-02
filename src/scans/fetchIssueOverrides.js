import { fetchApi } from '../utils/fetchApi.js';

/**
 * Fetch the per-finding user overrides the web app saves for a repository
 * (Mark/Unmark false positive, secrets confidence, Change Severity).
 *
 * Override keys and patches by analysis type:
 *   security — "id::<tracking id>|rule::<test_id>||::||<result key>||::||<line>" → { false_positive, severity }
 *   secrets  — "<path>||::||<hashed_secret or line>||::||<type>"               → { confidence_score }
 *   iac      — "<file_path>||::||<check_id>||::||<start>-<end>"                → { false_positive }
 *   sca      — "<package>@<version>"                                           → { severity }
 *
 * @param {string} repo         - "org/repo-name"
 * @param {string} analysisType - security | secrets | iac | sca
 * @returns {Promise<{ success: boolean, overrides?: Object, error?: string }>}
 */
export async function fetchIssueOverrides(repo, analysisType) {
  try {
    const response = await fetchApi('/extension/scans2/change-issue-details/get', 'POST', {
      repo,
      analysis_type: analysisType,
    });

    if (!response) {
      return { success: false, error: 'Failed to connect to CodeAnt server' };
    }

    if (response.status === 'error') {
      return { success: false, error: response.message || 'Failed to fetch issue overrides' };
    }

    return { success: true, overrides: response.data || {} };
  } catch (error) {
    return { success: false, error: error.message || 'Failed to fetch issue overrides' };
  }
}
