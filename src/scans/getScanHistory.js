import { fetchApi } from '../utils/fetchApi.js';

/**
 * Fetch scan history for a repository.
 *
 * @param {string} repo - Repository full name (e.g. "org/repo-name")
 * @returns {Promise<Object>}
 * {
 *   success: true,
 *   repo: "org/repo-name",
 *   scanHistory: [...]
 * }
 */
export async function getScanHistory(repo) {
  try {
    const response = await fetchApi('/extension/scans2/get-scan-history', 'POST', { repo });

    if (!response) {
      return { success: false, error: 'Failed to connect to CodeAnt server' };
    }

    if (response.last_analysis_results !== undefined) {
      return {
        success: true,
        repo: response.repo || repo,
        scanHistory: response.last_analysis_results || [],
      };
    }

    if (response.status === 'error') {
      return { success: false, error: response.message || 'Failed to fetch scan history' };
    }

    return { success: false, error: 'Unexpected response from server' };
  } catch (error) {
    return { success: false, error: error.message || 'Failed to fetch scan history' };
  }
}
