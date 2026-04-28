import { fetchApi } from '../utils/fetchApi.js';

export async function startScan({ repo, branch, commitId, includeFiles, excludeFiles }) {
  try {
    const body = { repo, branch, commit_id: commitId };
    if (includeFiles && includeFiles.length > 0) body.include_files = includeFiles;
    if (excludeFiles && excludeFiles.length > 0) body.exclude_files = excludeFiles;

    const response = await fetchApi('/extension/analysis/run', 'POST', body);

    if (!response) {
      return { success: false, error: 'Failed to connect to CodeAnt server' };
    }
    if (response.status === 'error') {
      return { success: false, error: response.message || 'Failed to start scan' };
    }

    return { success: true, ...response };
  } catch (error) {
    return { success: false, error: error.message || 'Failed to start scan' };
  }
}
