import { execSync } from 'child_process';
import * as github from './github/index.js';
import * as gitlab from './gitlab/index.js';
import * as bitbucket from './bitbucket/index.js';
import * as azure from './azure/index.js';

const platforms = { github, gitlab, bitbucket, azure };

function getProvider(remote) {
  const provider = platforms[remote];
  if (!provider) throw new Error(`Unknown remote "${remote}". Supported: github, gitlab, bitbucket, azure`);
  return provider;
}

// ─── Shared origin parsing (single source of truth) ───

function parseOriginUrl(origin) {
  // Parse host from SSH (git@host:owner/repo) or HTTPS (https://host/owner/repo)
  let host = null;
  const sshMatch = origin.match(/^[^@]+@([^:]+):/);
  const httpsMatch = origin.match(/^https?:\/\/([^/]+)/);
  if (sshMatch) host = sshMatch[1];
  else if (httpsMatch) host = httpsMatch[1];
  return host;
}

const HOST_TO_PLATFORM = {
  'github.com': 'github',
  'gitlab.com': 'gitlab',
  'bitbucket.org': 'bitbucket',
  'dev.azure.com': 'azure',
  'visualstudio.com': 'azure',
};

function detectPlatformFromHost(host) {
  if (!host) return null;
  // Exact match or subdomain match against known hosts
  for (const [publicHost, platform] of Object.entries(HOST_TO_PLATFORM)) {
    if (host === publicHost || host.endsWith('.' + publicHost)) return platform;
  }
  // Heuristic for self-hosted: check if hostname contains platform name
  if (host.includes('github')) return 'github';
  if (host.includes('gitlab')) return 'gitlab';
  if (host.includes('bitbucket')) return 'bitbucket';
  if (host.includes('azure') || host.includes('visualstudio')) return 'azure';
  return null;
}

function getOrigin() {
  try {
    return execSync('git remote get-url origin', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {}
  return null;
}

// Auto-detect remote from git origin URL
export function detectRemote() {
  const origin = getOrigin();
  if (!origin) return null;
  const host = parseOriginUrl(origin);
  return detectPlatformFromHost(host);
}

// Auto-detect repo name from git origin URL
export function detectRepoName() {
  const origin = getOrigin();
  if (!origin) return null;
  // Handle SSH: git@github.com:owner/repo.git
  // Handle HTTPS: https://github.com/owner/repo.git
  const match = origin.match(/[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
  return match ? match[1] : null;
}

// Auto-detect default branch
export function detectDefaultBranch() {
  try {
    const ref = execSync('git symbolic-ref refs/remotes/origin/HEAD', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return ref.replace('refs/remotes/origin/', '');
  } catch {}
  try {
    execSync('git show-ref --verify refs/heads/main', { stdio: ['pipe', 'pipe', 'pipe'] });
    return 'main';
  } catch {}
  try {
    execSync('git show-ref --verify refs/heads/master', { stdio: ['pipe', 'pipe', 'pipe'] });
    return 'master';
  } catch {}
  return null;
}

export function listPullRequests(opts) { return getProvider(opts.remote).listPullRequests(opts); }
export function getPullRequest(opts) { return getProvider(opts.remote).getPullRequest(opts); }
export function listPullRequestComments(opts) { return getProvider(opts.remote).listPullRequestComments(opts); }
export function listCodeReviews(opts) { return getProvider(opts.remote).listCodeReviews(opts); }
export function getCodeReview(opts) { return getProvider(opts.remote).getCodeReview(opts); }
export function searchComments(opts) { return getProvider(opts.remote).searchComments(opts); }
export function resolveConversation(opts) { return getProvider(opts.remote).resolveConversation(opts); }

// Auto-detect base URL (git host) from origin
export function detectBaseUrl() {
  const origin = getOrigin();
  if (!origin) return '';
  const host = parseOriginUrl(origin); return host ? 'https://' + host : '';
}
