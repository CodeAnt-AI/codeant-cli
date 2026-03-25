import { getClient, projectId } from './client.js';

export async function listPullRequestComments({ name, prNumber, codeantGenerated, createdAfter, createdBefore }) {
  const api = getClient();

  const [notes, discussions] = await Promise.all([
    api.MergeRequestNotes.all(projectId(name), prNumber, { perPage: 100 }),
    api.MergeRequestDiscussions.all(projectId(name), prNumber, { perPage: 100 }),
  ]);

  let comments = notes.map(n => ({
    id: n.id,
    type: n.type === 'DiffNote' ? 'review' : 'issue',
    author: n.author?.username,
    body: n.body,
    path: n.position?.new_path || null,
    line: n.position?.new_line || null,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
    isCodeantComment: n.author?.username?.includes('codeant') || n.body?.includes('Suggestion'),
    resolved: n.resolved || false,
    discussionId: null,
  }));

  // Enrich with discussion context
  for (const disc of discussions) {
    for (const note of disc.notes || []) {
      const match = comments.find(c => c.id === note.id);
      if (match) match.discussionId = disc.id;
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
