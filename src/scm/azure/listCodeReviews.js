import { getConnection, splitRepo } from './client.js';

export async function listCodeReviews({ name, prNumber, limit = 20 }) {
  const connection = getConnection();
  const gitApi = await connection.getGitApi();
  const { project, repo } = splitRepo(name);

  const pr = await gitApi.getPullRequest(repo, prNumber, project);

  return (pr.reviewers || []).slice(0, limit).map(r => ({
    id: r.id,
    user: r.displayName || r.uniqueName,
    state: r.vote > 0 ? 'APPROVED' : r.vote < 0 ? 'REJECTED' : 'PENDING',
    body: null,
    submittedAt: null,
  }));
}
