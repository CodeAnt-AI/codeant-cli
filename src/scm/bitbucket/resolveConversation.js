import { getClient, splitRepo } from './client.js';

/**
 * Resolve a comment (conversation) on a Bitbucket pull request.
 */
export async function resolveConversation({ name, prNumber, commentId }) {
  if (!commentId) throw new Error('commentId is required to resolve a Bitbucket comment');

  const client = getClient();
  const { workspace, repo_slug } = splitRepo(name);

  await client.repositories.updatePullRequestComment({
    workspace,
    repo_slug,
    pull_request_id: prNumber,
    comment_id: commentId,
    _body: { resolved: true },
  });

  return { success: true };
}
