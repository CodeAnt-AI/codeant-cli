import { getClient, splitRepo } from './client.js';

export async function getPullRequest({ name, prNumber }) {
  const octokit = getClient();
  const { owner, repo } = splitRepo(name);

  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
  const { data: reviews } = await octokit.pulls.listReviews({ owner, repo, pull_number: prNumber });

  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    merged: pr.merged_at !== null,
    author: pr.user?.login,
    sourceBranch: pr.head?.ref,
    targetBranch: pr.base?.ref,
    body: pr.body,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    url: pr.html_url,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    reviewSummary: reviews.map(r => ({ user: r.user?.login, state: r.state, submittedAt: r.submitted_at })),
  };
}
