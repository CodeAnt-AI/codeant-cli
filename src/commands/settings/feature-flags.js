import { fetchApi } from '../../utils/fetchApi.js';

export async function runFeatureFlagsGet({ repo, v2 = false } = {}) {
  if (!repo) {
    const err = new Error('--repo is required');
    err.exitCode = 1;
    throw err;
  }
  const version = v2 ? 'v2' : 'v1';
  return fetchApi(`/extension/config/feature-flags/${version}/get`, 'POST', { repo });
}

export async function runFeatureFlagsUpdate({ repo, flags, v2 = false } = {}) {
  if (!repo) {
    const err = new Error('--repo is required');
    err.exitCode = 1;
    throw err;
  }
  if (!flags) {
    const err = new Error('--flags is required');
    err.exitCode = 1;
    throw err;
  }
  let feature_flags;
  try {
    feature_flags = JSON.parse(flags);
  } catch {
    const err = new Error('--flags must be valid JSON (e.g. \'{"pr_review":"enable"}\')');
    err.exitCode = 1;
    throw err;
  }
  const version = v2 ? 'v2' : 'v1';
  return fetchApi(`/extension/config/feature-flags/${version}/update`, 'POST', { repo, feature_flags });
}
