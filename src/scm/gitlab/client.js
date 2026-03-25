import { Gitlab } from '@gitbeaker/rest';
import { getGitLabToken, getGitLabBaseUrl } from '../../utils/scmAuth.js';

export function getClient() {
  const token = getGitLabToken();
  if (!token) throw new Error('GitLab token not found. Set GITLAB_TOKEN env var, login via `glab auth login`, or run `codeant set-token gitlab <token>`.');
  const opts = { token };
  const host = getGitLabBaseUrl();
  if (host) opts.host = host.replace(/\/+$/, '');
  return new Gitlab(opts);
}

// GitLab uses project ID or "owner/repo" encoded as "owner%2Frepo"
export function projectId(name) {
  return encodeURIComponent(name);
}
