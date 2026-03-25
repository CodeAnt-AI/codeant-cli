import { getClient, splitRepo } from './client.js';

/**
 * Resolve a review conversation on GitHub.
 * GitHub doesn't have a native "resolve conversation" API for individual comments.
 * We use the GraphQL API to minimize (hide) the comment, which is the closest equivalent.
 * For review comments that are part of a PR review thread, we resolve via GraphQL resolveReviewThread.
 */
export async function resolveConversation({ name, prNumber, commentId, threadId }) {
  const octokit = getClient();
  const { owner, repo } = splitRepo(name);

  // If a threadId (graphql node_id of the review thread) is provided, resolve the thread
  if (threadId) {
    await octokit.graphql(
      `mutation($threadId: ID!) {
        resolveReviewThread(input: { threadId: $threadId }) {
          thread { isResolved }
        }
      }`,
      { threadId }
    );
    return { success: true };
  }

  // Otherwise, try to find the review comment and resolve its thread via node_id
  if (commentId) {
    // Fetch the review comment to get its node_id for the thread
    const { data: comment } = await octokit.pulls.getReviewComment({
      owner, repo, comment_id: commentId,
    });

    if (comment.node_id) {
      // Attempt to resolve the thread this comment belongs to
      // The comment's node_id is not the thread node_id, so we need to query for the thread
      const { repository } = await octokit.graphql(
        `query($owner: String!, $repo: String!, $prNumber: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $prNumber) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  comments(first: 1) {
                    nodes { databaseId }
                  }
                }
              }
            }
          }
        }`,
        { owner, repo, prNumber }
      );

      const threads = repository?.pullRequest?.reviewThreads?.nodes;
      if (!threads) {
        throw new Error(`Pull request ${prNumber} was not found or is not accessible`);
      }

      const thread = threads.find(
        t => t.comments.nodes.some(c => c.databaseId === commentId)
      );

      if (thread && !thread.isResolved) {
        await octokit.graphql(
          `mutation($threadId: ID!) {
            resolveReviewThread(input: { threadId: $threadId }) {
              thread { isResolved }
            }
          }`,
          { threadId: thread.id }
        );
        return { success: true };
      }

      if (thread?.isResolved) {
        return { success: true, message: 'Thread already resolved' };
      }
    }

    throw new Error(`Could not find a review thread for comment ${commentId}`);
  }

  throw new Error('Either commentId or threadId is required');
}
