import { getScanHistory } from '../../../scans/getScanHistory.js';

function withExitCode(code, message) {
  const err = new Error(message);
  err.exitCode = code;
  return err;
}

/**
 * Resolve the scan to use.
 * Precedence: --scan (explicit SHA) > --branch (latest on branch) > global latest.
 *
 * @param {{ repo: string, scan?: string, branch?: string }} opts
 * @returns {Promise<{ commit_id, branch, timestamp, status, resolved_by }>}
 */
export async function resolveScan({ repo, scan, branch }) {
  if (scan) {
    const { success, scanHistory, error } = await getScanHistory(repo);
    const history = success ? (scanHistory ?? []) : [];
    const hit = history.find((s) => s.latest_commit_sha === scan);
    return {
      commit_id: scan,
      branch: hit?.branch ?? branch ?? null,
      timestamp: hit?.timestamp ?? null,
      status: hit?.status ?? 'done',
      resolved_by: 'explicit',
    };
  }

  const { success, scanHistory, error } = await getScanHistory(repo);
  if (!success) throw withExitCode(1, `scan history: ${error}`);

  const sorted = [...(scanHistory ?? [])].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
  const filtered = branch ? sorted.filter((s) => s.branch === branch) : sorted;
  const pick = filtered[0];

  if (!pick) {
    throw withExitCode(2, branch ? `no scans for branch "${branch}"` : 'no scans found');
  }

  return {
    commit_id: pick.latest_commit_sha,
    branch: pick.branch ?? branch ?? null,
    timestamp: pick.timestamp,
    status: pick.status ?? 'done',
    resolved_by: branch ? 'branch' : 'latest',
  };
}
