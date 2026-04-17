import { fetchApi } from '../utils/fetchApi.js';

/**
 * Fetch repositories for the authenticated user from the CodeAnt backend.
 *
 * @param {string} organizationName - The organization name to filter repositories by.
 * @returns {Promise<Object>}
 * {
 *   success: true,
 *   repos: [{ name, full_name, pushed_at, ... }]
 * }
 */
export async function listRepos(organizationName) {
  try {
    const response = await fetchApi('/extension/scans2/listrepos', 'POST', {
      org: organizationName,
    });

    if (!response) {
      return { success: false, error: 'Failed to connect to CodeAnt server' };
    }

    if (response.repos) {
      const sortedRepos = (response.repos || []).sort(
        (a, b) => new Date(b.pushed_at) - new Date(a.pushed_at)
      );
      return { success: true, repos: sortedRepos };
    }

    if (response.status === 'error') {
      return { success: false, error: response.message || 'Failed to fetch repositories' };
    }

    return { success: false, error: 'Unexpected response from server' };
  } catch (error) {
    return { success: false, error: error.message || 'Failed to fetch repositories' };
  }
}
