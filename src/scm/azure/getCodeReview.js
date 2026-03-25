import { getConnection, splitRepo } from './client.js';

export async function getCodeReview({ name, prNumber, reviewId }) {
  const connection = getConnection();
  const gitApi = await connection.getGitApi();
  const { project, repo } = splitRepo(name);

  const pr = await gitApi.getPullRequest(repo, prNumber, project);
  const reviewer = (pr.reviewers || []).find(r => String(r.id) === String(reviewId));

  if (!reviewer) throw new Error(`Reviewer ${reviewId} not found on PR #${prNumber}`);

  return {
    id: reviewer.id,
    user: reviewer.displayName || reviewer.uniqueName,
    state: reviewer.vote > 0 ? 'APPROVED' : reviewer.vote < 0 ? 'REJECTED' : 'PENDING',
    body: null,
    comments: [],
  };
}
