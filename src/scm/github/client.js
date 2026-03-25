import { Octokit } from '@octokit/rest';
import { getGitHubToken, getGitHubBaseUrl } from '../../utils/scmAuth.js';

export function getClient() {
  const token = getGitHubToken();
  if (!token) throw new Error('GitHub token not found. Set GITHUB_TOKEN env var, login via `gh auth login`, or run `codeant set-token github <token>`.');
  const opts = { auth: token };
  const baseUrl = getGitHubBaseUrl();
  if (baseUrl) opts.baseUrl = baseUrl.replace(/\/+$/, '') + '/api/v3';
  return new Octokit(opts);
}

export function splitRepo(name) {
  const [owner, repo] = name.split('/');
  if (!owner || !repo) throw new Error(`Invalid repo name "${name}". Use owner/repo format.`);
  return { owner, repo };
}
