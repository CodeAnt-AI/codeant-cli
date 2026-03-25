import { getClient, splitRepo } from './client.js';

export async function getPullRequest({ name, prNumber }) {
  const client = getClient();
  const { workspace, repo_slug } = splitRepo(name);

  const { data: pr } = await client.repositories.getPullRequest({ workspace, repo_slug, pull_request_id: prNumber });

  return {
    number: pr.id,
    title: pr.title,
    state: pr.state?.toLowerCase(),
    merged: pr.state === 'MERGED',
    author: pr.author?.display_name || pr.author?.nickname,
    sourceBranch: pr.source?.branch?.name,
    targetBranch: pr.destination?.branch?.name,
    body: pr.description,
    createdAt: pr.created_on,
    updatedAt: pr.updated_on,
    url: pr.links?.html?.href,
    reviewSummary: pr.participants?.filter(p => p.role === 'REVIEWER').map(p => ({
      user: p.user?.display_name || p.user?.nickname,
      state: p.approved ? 'APPROVED' : 'PENDING',
    })) || [],
  };
}
