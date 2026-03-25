import { getConnection, splitRepo } from './client.js';

export async function searchComments({ name, query, limit = 10 }) {
  const connection = getConnection();
  const gitApi = await connection.getGitApi();
  const { project, repo } = splitRepo(name);

  const prs = await gitApi.getPullRequests(repo, { status: 1 }, project, undefined, undefined, 10);

  let allComments = [];
  for (const pr of (prs || [])) {
    const threads = await gitApi.getThreads(repo, pr.pullRequestId, project);
    for (const thread of (threads || [])) {
      for (const comment of (thread.comments || [])) {
        if (comment.commentType === 'system') continue;
        allComments.push({
          prNumber: pr.pullRequestId,
          prTitle: pr.title,
          id: comment.id,
          author: comment.author?.displayName,
          body: comment.content,
          path: thread.threadContext?.filePath || null,
          line: thread.threadContext?.rightFileStart?.line || null,
          createdAt: comment.publishedDate,
          isCodeantComment: (comment.author?.displayName || '').toLowerCase().includes('codeant'),
        });
      }
    }
  }

  const q = query.toLowerCase();
  allComments = allComments.filter(c => c.body?.toLowerCase().includes(q));

  return allComments.slice(0, limit);
}
