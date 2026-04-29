import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { detectRepoName } from '../../scm/index.js';
import { startScan } from '../../scans/startScan.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Mirrors splitGlobs in src/index.js (not exported) — preserves commas inside {} brace expansions
function splitGlobs(input) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of String(input)) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

async function resolveCurrentBranch() {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD');
    return stdout.trim();
  } catch {
    return null;
  }
}

async function resolveRemoteCommit(branch) {
  try {
    const { stdout } = await execFileAsync('git', ['ls-remote', 'origin', `refs/heads/${branch}`]);
    const sha = stdout.trim().split(/\s+/)[0];
    if (!sha) {
      const err = new Error(`Branch "${branch}" not found on remote origin. Pass --commit <sha> explicitly.`);
      err.exitCode = 1;
      throw err;
    }
    return sha;
  } catch (err) {
    if (err.exitCode) throw err;
    const wrapped = new Error(`Could not resolve commit for branch "${branch}": ${err.message}. Pass --commit <sha> explicitly.`);
    wrapped.exitCode = 1;
    throw wrapped;
  }
}

export async function runStartScan({ repo, branch, commit, include, exclude } = {}) {
  const resolvedRepo = repo || detectRepoName();
  if (!resolvedRepo) {
    const err = new Error('Could not detect repo name. Use --repo owner/repo');
    err.exitCode = 1;
    throw err;
  }

  const resolvedBranch = branch || await resolveCurrentBranch();
  if (!resolvedBranch) {
    const err = new Error('Could not detect current branch. Use --branch <name>');
    err.exitCode = 1;
    throw err;
  }

  const commitId = commit || await resolveRemoteCommit(resolvedBranch);

  const includeFiles = include ? splitGlobs(include) : [];
  const excludeFiles = exclude ? splitGlobs(exclude) : [];

  const result = await startScan({
    repo: resolvedRepo,
    branch: resolvedBranch,
    commitId,
    includeFiles: includeFiles.length ? includeFiles : undefined,
    excludeFiles: excludeFiles.length ? excludeFiles : undefined,
  });

  if (!result.success) {
    const err = new Error(result.error || 'Failed to start scan');
    err.exitCode = 1;
    throw err;
  }

  console.log(result.message || 'Analysis started');
}
