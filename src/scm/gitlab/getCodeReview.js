import { getClient, projectId } from './client.js';

export async function getCodeReview({ name, prNumber, reviewId }) {
  const api = getClient();

  const note = await api.MergeRequestNotes.show(projectId(name), prNumber, reviewId);

  return {
    id: note.id,
    user: note.author?.username,
    state: note.resolved ? 'APPROVED' : 'COMMENTED',
    body: note.body,
    submittedAt: note.created_at,
    path: note.position?.new_path || null,
    line: note.position?.new_line || null,
    comments: [],
  };
}
