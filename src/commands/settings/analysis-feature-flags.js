import { fetchApi } from '../../utils/fetchApi.js';

export async function runAnalysisFeatureFlagsGet({ repo } = {}) {
  if (!repo) {
    const err = new Error('--repo is required');
    err.exitCode = 1;
    throw err;
  }
  return fetchApi('/extension/analysis/config/feature-flags/get', 'POST', { repo });
}

export async function runAnalysisFeatureFlagsUpdate({ repo, flags } = {}) {
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
    const err = new Error('--flags must be valid JSON (e.g. \'{"sast_analysis":"enabled"}\')');
    err.exitCode = 1;
    throw err;
  }
  return fetchApi('/extension/analysis/config/feature-flags/update', 'POST', { repo, feature_flags });
}
