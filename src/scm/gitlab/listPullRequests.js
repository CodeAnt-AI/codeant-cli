import { getClient, projectId } from './client.js';

export async function listPullRequests({ name, sourceBranch, authorLogin, state = 'open', limit = 20, offset = 0 }) {
  const api = getClient();

  const params = { perPage: limit, page: Math.floor(offset / limit) + 1, orderBy: 'updated_at', sort: 'desc' };
  if (state === 'open') params.state = 'opened';
  else if (state === 'closed') params.state = 'closed';
  if (sourceBranch) params.sourceBranch = sourceBranch;
  if (authorLogin) params.authorUsername = authorLogin;

  const mrs = await api.MergeRequests.all({ projectId: projectId(name), ...params });

  return mrs.map(mr => ({
    number: mr.iid,
    title: mr.title,
    state: mr.state === 'opened' ? 'open' : mr.state,
    merged: mr.state === 'merged',
    author: mr.author?.username,
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
    createdAt: mr.created_at,
    updatedAt: mr.updated_at,
    url: mr.web_url,
  }));
}
