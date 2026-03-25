import { getClient, splitRepo } from './client.js';

export async function listPullRequests({ name, sourceBranch, authorLogin, state = 'open', limit = 20 }) {
  const client = getClient();
  const { workspace, repo_slug } = splitRepo(name);

  const stateMap = { open: 'OPEN', closed: 'MERGED,DECLINED,SUPERSEDED' };
  const { data } = await client.repositories.listPullRequests({ workspace, repo_slug, state: stateMap[state] || 'OPEN', pagelen: limit });

  let prs = (data.values || []).map(pr => ({
    number: pr.id,
    title: pr.title,
    state: pr.state?.toLowerCase(),
    merged: pr.state === 'MERGED',
    author: pr.author?.display_name || pr.author?.nickname,
    sourceBranch: pr.source?.branch?.name,
    targetBranch: pr.destination?.branch?.name,
    createdAt: pr.created_on,
    updatedAt: pr.updated_on,
    url: pr.links?.html?.href,
  }));

  if (sourceBranch) {
    const sb = sourceBranch.toLowerCase();
    prs = prs.filter(pr => pr.sourceBranch?.toLowerCase().includes(sb));
  }
  if (authorLogin) {
    const author = authorLogin.toLowerCase();
    prs = prs.filter(pr => pr.author?.toLowerCase().includes(author));
  }

  return prs;
}
