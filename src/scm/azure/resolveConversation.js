import { getConnection, splitRepo } from './client.js';

/**
 * Resolve a comment thread on an Azure DevOps pull request.
 * Azure uses thread status: 1 = Active, 2 = Fixed (resolved), 3 = WontFix, 4 = Closed, 5 = ByDesign, 6 = Pending
 */
export async function resolveConversation({ name, prNumber, threadId }) {
  if (!threadId) throw new Error('threadId is required to resolve an Azure DevOps thread');

  const parsedThreadId = Number(threadId);
  if (!Number.isInteger(parsedThreadId) || parsedThreadId <= 0) {
    throw new Error('threadId must be a positive integer for Azure DevOps');
  }

  const connection = getConnection();
  const gitApi = await connection.getGitApi();
  const { project, repo } = splitRepo(name);

  await gitApi.updateThread({ status: 2 }, repo, prNumber, parsedThreadId, project);

  return { success: true };
}
