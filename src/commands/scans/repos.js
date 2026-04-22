import { validateConnection } from '../../scans/connectionHandler.js';
import { listRepos as listReposApi } from '../../scans/listRepos.js';

/**
 * codeant scans repos [--org <org>]
 * List repositories. Auto-picks org when only one is authenticated.
 */
export async function runRepos({ org } = {}) {
  let orgName = org;

  if (!orgName) {
    const conn = await validateConnection();
    if (!conn.success) {
      const err = new Error(conn.error || 'Failed to validate connection');
      err.exitCode = 1;
      throw err;
    }
    if (conn.connections.length === 0) {
      const err = new Error('No authenticated organizations found');
      err.exitCode = 1;
      throw err;
    }
    if (conn.connections.length > 1) {
      const err = new Error(
        `Multiple orgs found. Specify one with --org. Available: ${conn.connections.map((c) => c.organizationName).join(', ')}`
      );
      err.exitCode = 1;
      throw err;
    }
    orgName = conn.connections[0].organizationName;
  }

  const result = await listReposApi(orgName);
  if (!result.success) {
    const err = new Error(result.error || 'Failed to list repositories');
    err.exitCode = 1;
    throw err;
  }

  return { org: orgName, repos: result.repos };
}
