import { getClient, splitRepo } from './client.js';

export async function getCodeReview({ name, prNumber, reviewId }) {
  const octokit = getClient();
  const { owner, repo } = splitRepo(name);

  const [{ data: review }, { data: reviewComments }] = await Promise.all([
    octokit.pulls.getReview({ owner, repo, pull_number: prNumber, review_id: reviewId }),
    octokit.pulls.listCommentsForReview({ owner, repo, pull_number: prNumber, review_id: reviewId, per_page: 100 }),
  ]);

  return {
    id: review.id,
    user: review.user?.login,
    state: review.state,
    body: review.body,
    submittedAt: review.submitted_at,
    comments: reviewComments.map(c => ({
      id: c.id,
      path: c.path,
      line: c.line || c.original_line,
      body: c.body,
      createdAt: c.created_at,
    })),
  };
}
