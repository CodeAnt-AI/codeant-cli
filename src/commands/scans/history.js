import { getScanHistory } from '../../scans/getScanHistory.js';

/**
 * codeant scans history --repo <repo> [--branch <name>] [--since <iso>] [--limit <n>]
 */
export async function runHistory({ repo, branch, since, limit = 20 } = {}) {
  if (!repo) {
    const err = new Error('--repo is required');
    err.exitCode = 1;
    throw err;
  }

  const result = await getScanHistory(repo);
  if (!result.success) {
    const err = new Error(result.error || 'Failed to fetch scan history');
    err.exitCode = 1;
    throw err;
  }

  let history = [...(result.scanHistory || [])].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  if (branch) {
    history = history.filter((s) => s.branch === branch);
  }

  if (since) {
    const sinceDate = new Date(since);
    if (isNaN(sinceDate)) {
      const err = new Error(`Invalid --since date: ${since}`);
      err.exitCode = 1;
      throw err;
    }
    history = history.filter((s) => new Date(s.timestamp) >= sinceDate);
  }

  if (limit > 0) {
    history = history.slice(0, limit);
  }

  return { repo, branch: branch || null, total: history.length, scans: history };
}
