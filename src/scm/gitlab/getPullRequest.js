import { getClient, projectId } from './client.js';

export async function getPullRequest({ name, prNumber }) {
  const api = getClient();

  const mr = await api.MergeRequests.show(projectId(name), prNumber);
  const approvals = await api.MergeRequestApprovals.configuration(projectId(name), { mergerequestIid: prNumber }).catch(() => null);

  return {
    number: mr.iid,
    title: mr.title,
    state: mr.state === 'opened' ? 'open' : mr.state,
    merged: mr.state === 'merged',
    author: mr.author?.username,
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
    body: mr.description,
    createdAt: mr.created_at,
    updatedAt: mr.updated_at,
    url: mr.web_url,
    additions: mr.changes_count,
    reviewSummary: approvals?.approved_by?.map(a => ({ user: a.user?.username, state: 'APPROVED' })) || [],
  };
}
