#!/usr/bin/env node

import { program } from 'commander';
import { render } from 'ink';
import React from 'react';
import { createRequire } from 'module';
import Secrets from './commands/secrets.js';
import SetBaseUrl from './commands/setBaseUrl.js';
import GetBaseUrl from './commands/getBaseUrl.js';
import Login from './commands/login.js';
import Logout from './commands/logout.js';
import Review from './commands/review.js';
import { runReviewHeadless } from './reviewHeadless.js';
import Welcome from './components/Welcome.js';
import * as scm from './scm/index.js';
import { setConfigValue } from './utils/config.js';
import { track, shutdown as analyticsShutdown, isTelemetryDisabled } from './utils/analytics.js';

// Read version from package.json
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

// Split comma-separated globs while preserving commas inside {} brace expansions (e.g. "*.{js,ts}")
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

// Show welcome animation if no arguments provided
if (process.argv.length === 2) {
  render(React.createElement(Welcome, { version: pkg.version }));
} else {
  program
    .name('codeant')
    .description('Code review CLI tool')
    .version(pkg.version);

program
  .command('secrets')
  .description('Scan for secrets in your code')
  .option('--all', 'Scan committed + uncommitted changes (default)')
  .option('--committed', 'Scan only unpushed commits')
  .option('--uncommitted', 'Scan only uncommitted changes (staged + unstaged + untracked)')
  .option('--staged', 'Scan only staged files')
  .option('--last-commit', 'Scan last commit')
  .option('--last-n-commits <n>', 'Scan last n commits (max 5)', parseInt)
  .option('--base <branch>', 'Compare against a specific base branch (e.g. --base develop)')
  .option('--base-commit <commit>', 'Compare against a specific commit (e.g. --base-commit HEAD~3)')
  .option('--include <paths>', 'Comma-separated list of file paths glob patterns to include')
  .option('--exclude <paths>', 'Comma-separated list of file paths glob patterns to exclude')
  .action((options) => {
    let scanType = 'all';
    let lastNCommits = 1;
    let baseBranch = null;
    let baseCommit = null;

    if (options.base) {
      scanType = 'base-branch';
      baseBranch = options.base;
    } else if (options.baseCommit) {
      scanType = 'base-commit';
      baseCommit = options.baseCommit;
    // Check !== undefined, not truthy — passing 0 is valid and shouldn't fall through
    } else if (options.lastNCommits !== undefined) {
      scanType = 'last-n-commits';
      lastNCommits = Math.min(Math.max(1, options.lastNCommits), 5);
    } else if (options.committed) {
      scanType = 'committed';
    } else if (options.uncommitted) {
      scanType = 'uncommitted';
    } else if (options.staged) {
      scanType = 'staged-only';
    } else if (options.lastCommit) {
      scanType = 'last-commit';
    }

    const include = options.include
      ? (Array.isArray(options.include) ? options.include : splitGlobs(options.include))
      : [];

    const exclude = options.exclude
      ? (Array.isArray(options.exclude) ? options.exclude : splitGlobs(options.exclude))
      : [];

    render(React.createElement(Secrets, { scanType, include, exclude, lastNCommits, baseBranch, baseCommit }));
  });

program
  .command('review')
  .description('Run AI-powered code review')
  .option('--all', 'Review committed + uncommitted changes (default)')
  .option('--committed', 'Review only unpushed commits')
  .option('--uncommitted', 'Review only uncommitted changes (staged + unstaged + untracked)')
  .option('--staged', 'Review only staged files')
  .option('--last-commit', 'Review last commit')
  .option('--last-n-commits <n>', 'Review last n commits (max 5)', parseInt)
  .option('--base <branch>', 'Compare against a specific base branch (e.g. --base develop)')
  .option('--base-commit <commit>', 'Compare against a specific commit (e.g. --base-commit HEAD~3)')
  .option('--fail-on <level>', 'Fail on issues at or above this level: BLOCKER, CRITICAL, MAJOR, MINOR, INFO (default: CRITICAL)', 'CRITICAL')
  .option('--include <paths>', 'Comma-separated list of file paths glob patterns to include')
  .option('--exclude <paths>', 'Comma-separated list of file paths glob patterns to exclude')
  .option('--headless', 'Output clean JSON with no spinners (for agents and CI)')
  .action(async (options) => {
    let scanType = 'all';
    let lastNCommits = 1;
    let baseBranch = null;
    let baseCommit = null;

    if (options.base) {
      scanType = 'base-branch';
      baseBranch = options.base;
    } else if (options.baseCommit) {
      scanType = 'base-commit';
      baseCommit = options.baseCommit;
    // Check !== undefined, not truthy — passing 0 is valid and shouldn't fall through
    } else if (options.lastNCommits !== undefined) {
      scanType = 'last-n-commits';
      lastNCommits = Math.min(Math.max(1, options.lastNCommits), 5);
    } else if (options.committed) {
      scanType = 'committed';
    } else if (options.uncommitted) {
      scanType = 'uncommitted';
    } else if (options.staged) {
      scanType = 'staged-only';
    } else if (options.lastCommit) {
      scanType = 'last-commit';
    }

    const include = options.include
      ? (Array.isArray(options.include) ? options.include : splitGlobs(options.include))
      : [];

    const exclude = options.exclude
      ? (Array.isArray(options.exclude) ? options.exclude : splitGlobs(options.exclude))
      : [];

    const failOn = options.failOn?.toUpperCase() || 'CRITICAL';

    if (options.headless) {
      const result = await runReviewHeadless({
        workspacePath: process.cwd(),
        scanType,
        lastNCommits,
        include,
        exclude,
        baseBranch,
        baseCommit,
        onProgress: (msg) => console.error(`[progress] ${msg}`),
        onFilesReady: (files, meta) => console.error(`[files] Reviewing ${files.length} file(s)`),
      });
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.error ? 1 : 0);
    } else {
      render(React.createElement(Review, { scanType, lastNCommits, failOn, include, exclude, baseBranch, baseCommit }));
    }
  });

program
  .command('set-base-url <url>')
  .description('Set the API base URL')
  .action((url) => {
    render(React.createElement(SetBaseUrl, { url }));
  });

  program
    .command('get-base-url')
    .description('Show the current API base URL')
    .action(() => {
      render(React.createElement(GetBaseUrl));
    });

  program
    .command('login')
    .description('Login to CodeAnt')
    .action(() => {
      render(React.createElement(Login));
    });

  program
    .command('logout')
    .description('Logout from CodeAnt')
    .action(() => {
      render(React.createElement(Logout));
    });

  // ─── Helper: resolve repo params with auto-detection fallback ───
  function resolveRepoOpts(options) {
    const remote = options.remote || scm.detectRemote();
    const name = options.name || scm.detectRepoName();
    const defaultBranch = options.defaultBranch || scm.detectDefaultBranch();
    if (!remote) { console.error('Error: Could not detect remote. Use --remote (github|gitlab|bitbucket|azure)'); process.exit(1); }
    if (!name) { console.error('Error: Could not detect repo name. Use --name owner/repo'); process.exit(1); }
    return { ...options, remote, name, defaultBranch };
  }

  // Helper: run async command and output JSON
  async function runCmd(fn) {
    try {
      const result = await fn();
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(JSON.stringify({ error: err.message }, null, 2));
      process.exit(1);
    }
  }

  // ─── Token management ───
  program
    .command('set-token <remote> <token>')
    .description('Store auth token for a platform (github|gitlab|bitbucket|azure)')
    .action((remote, token) => {
      const keyMap = { github: 'githubToken', gitlab: 'gitlabToken', bitbucket: 'bitbucketToken', azure: 'azureDevOpsToken' };
      const key = keyMap[remote];
      if (!key) { console.error(`Unknown remote "${remote}". Use: github, gitlab, bitbucket, azure`); process.exit(1); }
      setConfigValue(key, token);
      console.log(`${remote} token saved.`);
    });

  // ─── PR commands ───
  const pr = program.command('pr').description('Pull request tools (GitHub, GitLab, Bitbucket, Azure DevOps)');

  pr.command('list')
    .description('List pull requests / merge requests')
    .option('--name <repo>', 'Repository (owner/repo)')
    .option('--remote <provider>', 'github, gitlab, bitbucket, azure')
    .option('--default-branch <branch>', 'Default branch name')
    .option('--source-branch <branch>', 'Filter by source branch (partial match)')
    .option('--author <login>', 'Filter by author (fuzzy match)')
    .option('--state <state>', 'open or closed (default: open)', 'open')
    .option('--limit <n>', 'Max results (default: 20, max: 100)', parseInt, 20)
    .option('--offset <n>', 'Pagination offset', parseInt, 0)
    .action((options) => {
      const opts = resolveRepoOpts(options);
      runCmd(() => scm.listPullRequests({
        name: opts.name, remote: opts.remote, defaultBranch: opts.defaultBranch,
        sourceBranch: opts.sourceBranch, authorLogin: opts.author,
        state: opts.state, limit: opts.limit, offset: opts.offset,
      }));
    });

  pr.command('get')
    .description('Get detailed PR information including review analysis')
    .option('--name <repo>', 'Repository (owner/repo)')
    .option('--remote <provider>', 'github, gitlab, bitbucket, azure')
    .option('--default-branch <branch>', 'Default branch name')
    .requiredOption('--pr-number <n>', 'PR number', parseInt)
    .action((options) => {
      const opts = resolveRepoOpts(options);
      runCmd(() => scm.getPullRequest({
        name: opts.name, remote: opts.remote, defaultBranch: opts.defaultBranch,
        prNumber: opts.prNumber,
      }));
    });

  pr.command('comments')
    .description('List all comments for a PR')
    .option('--name <repo>', 'Repository (owner/repo)')
    .option('--remote <provider>', 'github, gitlab, bitbucket, azure')
    .option('--default-branch <branch>', 'Default branch name')
    .requiredOption('--pr-number <n>', 'PR number', parseInt)
    .option('--codeant-generated <bool>', 'Filter by CodeAnt authorship (true/false)', (v) => v === 'true')
    .option('--addressed', 'Filter by addressed/resolved status')
    .option('--created-after <date>', 'ISO 8601 date filter')
    .option('--created-before <date>', 'ISO 8601 date filter')
    .action((options) => {
      const opts = resolveRepoOpts(options);
      runCmd(() => scm.listPullRequestComments({
        name: opts.name, remote: opts.remote, defaultBranch: opts.defaultBranch,
        prNumber: opts.prNumber, codeantGenerated: opts.codeantGenerated,
        addressed: opts.addressed, createdAfter: opts.createdAfter, createdBefore: opts.createdBefore,
      }));
    });

  pr.command('resolve')
    .description('Resolve a conversation/comment thread on a PR')
    .option('--name <repo>', 'Repository (owner/repo)')
    .option('--remote <provider>', 'github, gitlab, bitbucket, azure')
    .requiredOption('--pr-number <n>', 'PR number', parseInt)
    .option('--comment-id <id>', 'Comment ID (GitHub, Bitbucket)', parseInt)
    .option('--thread-id <id>', 'Thread/node ID (GitHub GraphQL, Azure)')
    .option('--discussion-id <id>', 'Discussion ID (GitLab)')
    .action((options) => {
      const opts = resolveRepoOpts(options);
      runCmd(() => scm.resolveConversation({
        name: opts.name, remote: opts.remote,
        prNumber: opts.prNumber,
        commentId: opts.commentId,
        threadId: opts.threadId,
        discussionId: opts.discussionId,
      }));
    });

  // ─── Code review commands ───
  const codeReview = program.command('code-review').description('Code review tools');

  codeReview.command('list')
    .description('List code reviews with optional filtering')
    .option('--name <repo>', 'Repository (owner/repo)')
    .option('--remote <provider>', 'github, gitlab, bitbucket, azure')
    .option('--default-branch <branch>', 'Default branch name')
    .option('--pr-number <n>', 'Filter by PR number', parseInt)
    .option('--status <status>', 'Filter by status (PENDING, COMPLETED, FAILED, etc.)')
    .option('--limit <n>', 'Max results (default: 20)', parseInt, 20)
    .option('--offset <n>', 'Pagination offset', parseInt, 0)
    .action((options) => {
      const opts = resolveRepoOpts(options);
      runCmd(() => scm.listCodeReviews({
        name: opts.name, remote: opts.remote, defaultBranch: opts.defaultBranch,
        prNumber: opts.prNumber, status: opts.status,
        limit: opts.limit, offset: opts.offset,
      }));
    });

  codeReview.command('get')
    .description('Get detailed information for a specific code review')
    .option('--name <repo>', 'Repository (owner/repo)')
    .option('--remote <provider>', 'github, gitlab, bitbucket, azure')
    .requiredOption('--pr-number <n>', 'PR number', parseInt)
    .requiredOption('--review-id <id>', 'Code review ID')
    .action((options) => {
      const opts = resolveRepoOpts(options);
      runCmd(() => scm.getCodeReview({
        name: opts.name, remote: opts.remote,
        prNumber: opts.prNumber, reviewId: opts.reviewId,
      }));
    });

  // ─── Comment search ───
  const comments = program.command('comments').description('Comment search tools');

  comments.command('search')
    .description('Search across all CodeAnt comments')
    .option('--name <repo>', 'Repository (owner/repo)')
    .option('--remote <provider>', 'github, gitlab, bitbucket, azure')
    .requiredOption('--query <term>', 'Search term')
    .option('--limit <n>', 'Max results (default: 10, max: 50)', parseInt, 10)
    .option('--include-addressed', 'Include resolved comments (default: false)')
    .option('--created-after <date>', 'ISO 8601 date filter')
    .action((options) => {
      const opts = resolveRepoOpts(options);
      runCmd(() => scm.searchComments({
        name: opts.name, remote: opts.remote,
        query: opts.query, limit: opts.limit,
        includeAddressed: opts.includeAddressed || false,
        createdAfter: opts.createdAfter,
      }));
    });

  // ─── Telemetry control ───
  program
    .command('set-telemetry <enabled>')
    .description('Enable or disable telemetry / PostHog analytics (true or false)')
    .action((enabled) => {
      const val = enabled.toLowerCase();
      if (val !== 'true' && val !== 'false') {
        console.error('Usage: codeant set-telemetry <true|false>');
        process.exit(1);
      }
      setConfigValue('telemetryEnabled', val === 'true');
      console.log(`Telemetry ${val === 'true' ? 'enabled' : 'disabled'}.`);
    });

  program
    .command('get-telemetry')
    .description('Show current telemetry status')
    .action(() => {
      const disabled = isTelemetryDisabled();
      console.log(`Telemetry is currently ${disabled ? 'disabled' : 'enabled'}.`);
    });

  // ─── Analytics tracking (for external callers like Claude Code skills) ───
  program
    .command('track')
    .description('Send an analytics event')
    .requiredOption('--event <name>', 'Event name (e.g. skill_invoked, suggestions_applied)')
    .option('--props <json>', 'JSON string of event properties', '{}')
    .action(async (options) => {
      try {
        const props = JSON.parse(options.props);
        if (typeof props !== 'object' || props === null || Array.isArray(props)) {
          process.stderr.write('--props must be a JSON object\n');
          return;
        }
        track(options.event, props);
        await analyticsShutdown();
      } catch (err) {
        process.stderr.write(`Invalid --props JSON: ${err instanceof Error ? err.message : String(err)}\n`);
      }
    });

  program.parse();
}
