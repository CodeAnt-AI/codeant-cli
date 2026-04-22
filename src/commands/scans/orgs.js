import { validateConnection } from '../../scans/connectionHandler.js';

/**
 * codeant scans orgs
 * List authenticated organizations.
 */
export async function runOrgs() {
  const result = await validateConnection();
  if (!result.success) {
    const err = new Error(result.error || 'Failed to validate connection');
    err.exitCode = result.error?.toLowerCase().includes('network') ? 4 : 1;
    throw err;
  }
  return { connections: result.connections, email: result.email };
}
