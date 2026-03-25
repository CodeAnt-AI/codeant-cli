import { getClient, splitRepo } from './client.js';

export async function listCodeReviews({ name, prNumber, limit = 20 }) {
  // Bitbucket doesn't have discrete "reviews" — participants with reviewer role are the equivalent
  const client = getClient();
  const { workspace, repo_slug } = splitRepo(name);

  const { data: pr } = await client.repositories.getPullRequest({ workspace, repo_slug, pull_request_id: prNumber });

  return (pr.participants || []).filter(p => p.role === 'REVIEWER').slice(0, limit).map(p => ({
    id: null,
    user: p.user?.display_name || p.user?.nickname,
    state: p.approved ? 'APPROVED' : 'PENDING',
    body: null,
    submittedAt: null,
  }));
}
