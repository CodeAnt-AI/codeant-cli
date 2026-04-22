import { fetchApi } from '../utils/fetchApi.js';

/**
 * Validate the stored API key with the CodeAnt backend.
 *
 * @returns {Promise<Object>}
 * {
 *   success: true,
 *   connections: [
 *     {
 *       organizationName: "acme-corp",
 *       baseUrl: "https://github.com",
 *       service: "github" | "gitlab" | "azuredevops" | "bitbucket" | "unknown"
 *     }
 *   ],
 *   email: "dev@acme.com",
 * }
 */
export async function validateConnection() {
  try {
    const response = await fetchApi('/extension/scans2/validate', 'POST', {
      extension: 'cli',
    });

    if (!response) {
      return { success: false, error: 'Failed to connect to CodeAnt server' };
    }

    if (response.status === 'success' && response.data) {
      const orgs = response.data.orgs || [];
      return {
        success: true,
        connections: orgs.map((org) => ({
          organizationName: org.organization_name,
          baseUrl: org.base_url,
          service: org.service || 'unknown',
        })),
        email: response.data.email,
      };
    }

    return {
      success: false,
      error: response.message || 'Invalid or expired connection string',
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to validate connection string',
    };
  }
}
