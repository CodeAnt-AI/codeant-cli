import { getClient, splitRepo } from './client.js';

export async function listPullRequestComments({ name, prNumber, codeantGenerated, addressed, createdAfter, createdBefore }) {
  const octokit = getClient();
  const { owner, repo } = splitRepo(name);

  // Get both review comments (inline) and issue comments (general)
  const [{ data: reviewComments }, { data: issueComments }] = await Promise.all([
    octokit.pulls.listReviewComments({ owner, repo, pull_number: prNumber, per_page: 100 }),
    octokit.issues.listComments({ owner, repo, issue_number: prNumber, per_page: 100 }),
  ]);

  let comments = [
    ...reviewComments.map(c => ({
      id: c.id,
      type: 'review',
      author: c.user?.login,
      body: c.body,
      path: c.path,
      line: c.line || c.original_line,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      isCodeantComment: c.user?.login?.includes('codeant') || c.body?.includes('Suggestion'),
      inReplyToId: c.in_reply_to_id || null,
    })),
    ...issueComments.map(c => ({
      id: c.id,
      type: 'issue',
      author: c.user?.login,
      body: c.body,
      path: null,
      line: null,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      isCodeantComment: c.user?.login?.includes('codeant') || c.body?.includes('Suggestion'),
      inReplyToId: null,
    })),
  ];

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
