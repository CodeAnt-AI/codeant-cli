import { getClient, splitRepo } from './client.js';

export async function listCodeReviews({ name, prNumber, limit = 20, offset = 0 }) {
  const octokit = getClient();
  const { owner, repo } = splitRepo(name);

  const { data } = await octokit.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: limit, page: Math.floor(offset / limit) + 1 });

  return data.map(r => ({
    id: r.id,
    user: r.user?.login,
    state: r.state,
    body: r.body,
    submittedAt: r.submitted_at,
    url: r.html_url,
  }));
}
