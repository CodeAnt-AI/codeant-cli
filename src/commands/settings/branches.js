import { fetchApi } from '../../utils/fetchApi.js';

export async function runBranchesAll({ repo } = {}) {
  if (!repo) {
    const err = new Error('--repo is required');
    err.exitCode = 1;
    throw err;
  }
  return fetchApi('/extension/branches/all', 'POST', { repo });
}

export async function runBranchesDefault({ repo } = {}) {
  if (!repo) {
    const err = new Error('--repo is required');
    err.exitCode = 1;
    throw err;
  }
  return fetchApi('/extension/branches/default', 'POST', { repo });
}

export async function runBranchesUpdateDefault({ repo, branch } = {}) {
  if (!repo) {
    const err = new Error('--repo is required');
    err.exitCode = 1;
    throw err;
  }
  if (!branch) {
    const err = new Error('--branch is required');
    err.exitCode = 1;
    throw err;
  }
  return fetchApi('/extension/branches/update-default', 'POST', { repo, branch });
}
