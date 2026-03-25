import { getConnection, splitRepo } from './client.js';

export async function listPullRequestComments({ name, prNumber, codeantGenerated, createdAfter, createdBefore }) {
  const connection = getConnection();
  const gitApi = await connection.getGitApi();
  const { project, repo } = splitRepo(name);

  const threads = await gitApi.getThreads(repo, prNumber, project);

  let comments = [];
  for (const thread of (threads || [])) {
    for (const comment of (thread.comments || [])) {
      if (comment.commentType === 'system') continue;
      comments.push({
        id: comment.id,
        threadId: thread.id,
        type: thread.threadContext?.filePath ? 'review' : 'issue',
        author: comment.author?.displayName || comment.author?.uniqueName,
        body: comment.content,
        path: thread.threadContext?.filePath || null,
        line: thread.threadContext?.rightFileStart?.line || null,
        createdAt: comment.publishedDate,
        updatedAt: comment.lastUpdatedDate,
        isCodeantComment: (comment.author?.displayName || '').toLowerCase().includes('codeant') || comment.content?.includes('Suggestion'),
        resolved: thread.status === 2, // Fixed
      });
    }
  }

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
