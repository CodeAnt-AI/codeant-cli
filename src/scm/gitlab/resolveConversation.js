import { getClient, projectId } from './client.js';

/**
 * Resolve a discussion (conversation) on a GitLab merge request.
 */
export async function resolveConversation({ name, prNumber, discussionId }) {
  if (!discussionId) throw new Error('discussionId is required to resolve a GitLab discussion');

  const api = getClient();

  await api.MergeRequestDiscussions.edit(projectId(name), prNumber, discussionId, { resolved: true });

  return { success: true };
}
