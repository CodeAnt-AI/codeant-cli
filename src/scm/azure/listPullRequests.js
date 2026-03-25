import { getConnection, splitRepo } from './client.js';

export async function listPullRequests({ name, sourceBranch, authorLogin, state = 'open', limit = 20 }) {
  const connection = getConnection();
  const gitApi = await connection.getGitApi();
  const { project, repo } = splitRepo(name);

  const statusMap = { open: 1 /* Active */, closed: 3 /* Completed */ };
  const searchCriteria = { status: statusMap[state] || 1 };
  if (sourceBranch) searchCriteria.sourceRefName = `refs/heads/${sourceBranch}`;
  if (authorLogin) searchCriteria.creatorId = authorLogin;

  const prs = await gitApi.getPullRequests(repo, searchCriteria, project, undefined, undefined, limit);

  return (prs || []).map(pr => ({
    number: pr.pullRequestId,
    title: pr.title,
    state: pr.status === 1 ? 'open' : pr.status === 3 ? 'closed' : 'unknown',
    merged: pr.status === 3 && pr.closedBy != null,
    author: pr.createdBy?.displayName || pr.createdBy?.uniqueName,
    sourceBranch: pr.sourceRefName?.replace('refs/heads/', ''),
    targetBranch: pr.targetRefName?.replace('refs/heads/', ''),
    createdAt: pr.creationDate,
    url: pr.url,
  }));
}
