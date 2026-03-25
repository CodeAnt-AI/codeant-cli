import pkg from 'bitbucket';
const { Bitbucket } = pkg;
import { getBitbucketToken, getBitbucketBaseUrl } from '../../utils/scmAuth.js';

export function getClient() {
  const token = getBitbucketToken();
  if (!token) throw new Error('Bitbucket token not found. Set BITBUCKET_TOKEN env var or run `codeant set-token bitbucket <token>`.');
  const opts = { auth: { token } };
  const baseUrl = getBitbucketBaseUrl();
  if (baseUrl) opts.baseUrl = baseUrl.replace(/\/+$/, '');
  return new Bitbucket(opts);
}

export function splitRepo(name) {
  const [workspace, repo_slug] = name.split('/');
  if (!workspace || !repo_slug) throw new Error(`Invalid repo name "${name}". Use workspace/repo format.`);
  return { workspace, repo_slug };
}
