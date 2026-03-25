import { getClient, splitRepo } from './client.js';

export async function listPullRequests({ name, sourceBranch, authorLogin, state = 'open', limit = 20, offset = 0 }) {
  const octokit = getClient();
  const { owner, repo } = splitRepo(name);

  const perPage = Math.max(limit, 1);
  const params = { owner, repo, state: state === 'closed' ? 'closed' : 'open', per_page: perPage, page: Math.floor(offset / perPage) + 1, sort: 'updated', direction: 'desc' };
  if (sourceBranch) params.head = sourceBranch.includes(':') ? sourceBranch : `${owner}:${sourceBranch}`;

  const { data } = await octokit.pulls.list(params);

  let prs = data.map(pr => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    merged: pr.merged_at !== null,
    author: pr.user?.login,
    sourceBranch: pr.head?.ref,
    targetBranch: pr.base?.ref,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    url: pr.html_url,
  }));

  if (authorLogin) {
    const author = authorLogin.toLowerCase();
    prs = prs.filter(pr => pr.author?.toLowerCase().includes(author));
  }

  return prs;
}
