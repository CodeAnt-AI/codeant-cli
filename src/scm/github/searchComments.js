import { getClient, splitRepo } from './client.js';

export async function searchComments({ name, query, limit = 10, includeAddressed = false }) {
  const octokit = getClient();
  const { owner, repo } = splitRepo(name);

  // GitHub doesn't have a native comment search API, so we fetch recent PR comments and filter
  const { data: prs } = await octokit.pulls.list({ owner, repo, state: 'all', per_page: 10, sort: 'updated' });

  let allComments = [];
  for (const pr of prs) {
    const { data: comments } = await octokit.pulls.listReviewComments({ owner, repo, pull_number: pr.number, per_page: 50 });
    allComments.push(...comments.map(c => ({
      prNumber: pr.number,
      prTitle: pr.title,
      id: c.id,
      author: c.user?.login,
      body: c.body,
      path: c.path,
      line: c.line || c.original_line,
      createdAt: c.created_at,
      isCodeantComment: c.user?.login?.includes('codeant'),
    })));
  }

  const q = query.toLowerCase();
  allComments = allComments.filter(c => c.body?.toLowerCase().includes(q));

  return allComments.slice(0, limit);
}
