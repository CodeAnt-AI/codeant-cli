import { getClient, projectId } from './client.js';

export async function searchComments({ name, query, limit = 10 }) {
  const api = getClient();

  const mrs = await api.MergeRequests.all({ projectId: projectId(name), perPage: 10, orderBy: 'updated_at', sort: 'desc', state: 'all' });

  let allComments = [];
  for (const mr of mrs) {
    const notes = await api.MergeRequestNotes.all(projectId(name), mr.iid, { perPage: 50 });
    allComments.push(...notes.filter(n => !n.system).map(n => ({
      prNumber: mr.iid,
      prTitle: mr.title,
      id: n.id,
      author: n.author?.username,
      body: n.body,
      path: n.position?.new_path || null,
      line: n.position?.new_line || null,
      createdAt: n.created_at,
      isCodeantComment: n.author?.username?.includes('codeant'),
    })));
  }

  const q = query.toLowerCase();
  allComments = allComments.filter(c => c.body?.toLowerCase().includes(q));

  return allComments.slice(0, limit);
}
