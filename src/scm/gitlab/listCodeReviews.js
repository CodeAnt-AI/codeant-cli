import { getClient, projectId } from './client.js';

export async function listCodeReviews({ name, prNumber, limit = 20, offset = 0 }) {
  const api = getClient();

  // GitLab doesn't have "reviews" like GitHub — use notes + approvals
  const notes = await api.MergeRequestNotes.all(projectId(name), prNumber, {
    perPage: limit,
    page: Math.floor(offset / Math.max(limit, 1)) + 1,
  });

  const reviewNotes = notes.filter(n => !n.system);

  return reviewNotes.map(n => ({
    id: n.id,
    user: n.author?.username,
    state: n.resolved ? 'APPROVED' : 'COMMENTED',
    body: n.body,
    submittedAt: n.created_at,
  }));
}
