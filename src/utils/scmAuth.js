import { execSync } from 'child_process';
import { getConfigValue } from './config.js';

/**
 * Resolves auth tokens and base URLs for each SCM platform.
 * Priority: env var → platform CLI → ~/.codeant/config.json → auto-detect from git origin
 */

function tryExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

// ─── Auto-detect host from git remote origin ───

const PUBLIC_HOSTS = {
  'github.com': 'github',
  'gitlab.com': 'gitlab',
  'bitbucket.org': 'bitbucket',
  'dev.azure.com': 'azure',
  'visualstudio.com': 'azure',
};

let _originInfo = undefined; // cached

function getOriginInfo() {
  if (_originInfo !== undefined) return _originInfo;
  _originInfo = null;
  try {
    const origin = execSync('git remote get-url origin', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

    // Parse host from SSH (git@host:owner/repo) or HTTPS (https://host/owner/repo)
    let host = null;
    const sshMatch = origin.match(/^[^@]+@([^:]+):/);
    const httpsMatch = origin.match(/^https?:\/\/([^/]+)/);
    if (sshMatch) host = sshMatch[1];
    else if (httpsMatch) host = httpsMatch[1];

    if (!host) return _originInfo;

    // Determine platform from host
    let platform = null;
    for (const [publicHost, p] of Object.entries(PUBLIC_HOSTS)) {
      if (host === publicHost || host.endsWith('.' + publicHost)) {
        platform = p;
        break;
      }
    }
    // Heuristic for self-hosted: check if hostname contains platform name
    if (!platform) {
      if (host.includes('github')) platform = 'github';
      else if (host.includes('gitlab')) platform = 'gitlab';
      else if (host.includes('bitbucket')) platform = 'bitbucket';
      else if (host.includes('azure') || host.includes('visualstudio')) platform = 'azure';
    }

    const isPublic = Object.keys(PUBLIC_HOSTS).some(h => host === h);
    const baseUrl = isPublic ? null : `https://${host}`;

    _originInfo = { host, platform, baseUrl, origin };
  } catch {}
  return _originInfo;
}

function detectBaseUrlForPlatform(platform) {
  const info = getOriginInfo();
  if (info && info.platform === platform && info.baseUrl) return info.baseUrl;
  return null;
}

// ─── Token resolvers ───

export function getGitHubToken() {
  return process.env.GITHUB_TOKEN
    || process.env.GH_TOKEN
    || tryExec('gh auth token')
    || getConfigValue('githubToken')
    || null;
}

export function getGitLabToken() {
  return process.env.GITLAB_TOKEN
    || tryExec('glab auth token 2>/dev/null')
    || getConfigValue('gitlabToken')
    || null;
}

export function getBitbucketToken() {
  return process.env.BITBUCKET_TOKEN
    || getConfigValue('bitbucketToken')
    || null;
}

export function getAzureDevOpsToken() {
  return process.env.AZURE_DEVOPS_TOKEN
    || process.env.AZURE_DEVOPS_PAT
    || getConfigValue('azureDevOpsToken')
    || null;
}

export function getTokenForRemote(remote) {
  switch (remote) {
    case 'github': return getGitHubToken();
    case 'gitlab': return getGitLabToken();
    case 'bitbucket': return getBitbucketToken();
    case 'azure': return getAzureDevOpsToken();
    default: throw new Error(`Unknown remote: ${remote}. Use: github, gitlab, bitbucket, azure`);
  }
}

// ─── Base URL resolvers for self-hosted instances ───
// Priority: env var → config → auto-detect from git origin

export function getGitHubBaseUrl() {
  return process.env.GITHUB_API_URL
    || process.env.GH_ENTERPRISE_URL
    || getConfigValue('githubBaseUrl')
    || detectBaseUrlForPlatform('github');
}

export function getGitLabBaseUrl() {
  return process.env.GITLAB_URL
    || process.env.GITLAB_HOST
    || getConfigValue('gitlabBaseUrl')
    || detectBaseUrlForPlatform('gitlab');
}

export function getBitbucketBaseUrl() {
  return process.env.BITBUCKET_URL
    || process.env.BITBUCKET_SERVER_URL
    || getConfigValue('bitbucketBaseUrl')
    || detectBaseUrlForPlatform('bitbucket');
}
