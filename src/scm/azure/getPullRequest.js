import { getConnection, splitRepo } from './client.js';

export async function getPullRequest({ name, prNumber }) {
  const connection = getConnection();
  const gitApi = await connection.getGitApi();
  const { project, repo } = splitRepo(name);

  const pr = await gitApi.getPullRequest(repo, prNumber, project);
  const threads = await gitApi.getThreads(repo, prNumber, project);

  const reviewers = (pr.reviewers || []).map(r => ({
    user: r.displayName || r.uniqueName,
    state: r.vote > 0 ? 'APPROVED' : r.vote < 0 ? 'REJECTED' : 'PENDING',
  }));

  return {
    number: pr.pullRequestId,
    title: pr.title,
    state: pr.status === 1 ? 'open' : 'closed',
    merged: pr.status === 3,
    author: pr.createdBy?.displayName || pr.createdBy?.uniqueName,
    sourceBranch: pr.sourceRefName?.replace('refs/heads/', ''),
    targetBranch: pr.targetRefName?.replace('refs/heads/', ''),
    body: pr.description,
    createdAt: pr.creationDate,
    url: pr.url,
    reviewSummary: reviewers,
    threadCount: threads?.length || 0,
  };
}
