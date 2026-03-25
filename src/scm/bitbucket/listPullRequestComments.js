import { getClient, splitRepo } from './client.js';

export async function listPullRequestComments({ name, prNumber, codeantGenerated, createdAfter, createdBefore }) {
  const client = getClient();
  const { workspace, repo_slug } = splitRepo(name);

  const { data } = await client.repositories.listPullRequestComments({ workspace, repo_slug, pull_request_id: prNumber, pagelen: 100 });

  let comments = (data.values || []).map(c => ({
    id: c.id,
    type: c.inline ? 'review' : 'issue',
    author: c.user?.display_name || c.user?.nickname,
    body: c.content?.raw || c.content?.markup || '',
    path: c.inline?.path || null,
    line: c.inline?.to || null,
    createdAt: c.created_on,
    updatedAt: c.updated_on,
    isCodeantComment: (c.user?.display_name || c.user?.nickname || '').toLowerCase().includes('codeant') || (c.content?.raw || c.content?.markup || '').includes('Suggestion'),
    resolved: c.resolved || false,
  }));

  if (codeantGenerated !== undefined) {
    comments = comments.filter(c => c.isCodeantComment === codeantGenerated);
  }
  if (createdAfter) {
    comments = comments.filter(c => new Date(c.createdAt) >= new Date(createdAfter));
  }
  if (createdBefore) {
    comments = comments.filter(c => new Date(c.createdAt) <= new Date(createdBefore));
  }

  return comments;
}
