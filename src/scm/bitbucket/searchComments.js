import { getClient, splitRepo } from './client.js';

export async function searchComments({ name, query, limit = 10 }) {
  const client = getClient();
  const { workspace, repo_slug } = splitRepo(name);

  const { data: prsData } = await client.repositories.listPullRequests({ workspace, repo_slug, state: 'OPEN', pagelen: 10 });

  let allComments = [];
  for (const pr of (prsData.values || [])) {
    const { data: commentsData } = await client.repositories.listPullRequestComments({ workspace, repo_slug, pull_request_id: pr.id, pagelen: 50 });
    allComments.push(...(commentsData.values || []).map(c => ({
      prNumber: pr.id,
      prTitle: pr.title,
      id: c.id,
      author: c.user?.display_name || c.user?.nickname,
      body: c.content?.raw || '',
      path: c.inline?.path || null,
      line: c.inline?.to || null,
      createdAt: c.created_on,
      isCodeantComment: (c.user?.display_name || '').toLowerCase().includes('codeant'),
    })));
  }

  const q = query.toLowerCase();
  allComments = allComments.filter(c => c.body?.toLowerCase().includes(q));

  return allComments.slice(0, limit);
}
