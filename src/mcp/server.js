import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createRequire } from 'module';

import { runOrgs } from '../commands/scans/orgs.js';
import { runRepos } from '../commands/scans/repos.js';
import { runHistory } from '../commands/scans/history.js';
import { runGet } from '../commands/scans/get.js';
import { buildResultsEnvelope } from '../commands/scans/results.js';
import { runDismissed } from '../commands/scans/dismissed.js';
import { runStartScan } from '../commands/scans/start-scan.js';
import { runReviewHeadless } from '../reviewHeadless.js';
import { runSecretsHeadless } from '../secretsHeadless.js';
import * as scm from '../scm/index.js';
import { isAlreadyLoggedIn, runLoginFlow } from '../utils/loginFlow.js';
import { getConfigValue } from '../utils/config.js';
import { runHotlistGet, runHotlistList } from '../hotlist/client.js';
import { logoutCodeAnt } from '../utils/logout.js';
import { runApiRequest } from '../commands/api/request.js';
import { runOrganizationAntipatterns } from '../findings/antipatterns.js';
import { runCloudFindingGet, runCloudFindings, runCloudHistory } from '../findings/cloud.js';
import { runPentestHistory, runPentestIssues, runPentestReport } from '../findings/pentest.js';
import { runAnalysisFeatureFlagsGet, runAnalysisFeatureFlagsUpdate } from '../commands/settings/analysis-feature-flags.js';
import { runRecurringScanslist, runRecurringScansCreate, runRecurringScansUpdate } from '../commands/settings/recurring-scans.js';
import { runBranchesAll, runBranchesDefault } from '../commands/settings/branches.js';
import { runCveReportingList } from '../commands/settings/cve-reporting.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE_NON_DESTRUCTIVE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

// Write-side tools are gated behind CODEANT_READ_ONLY. Default = read-only.
function isReadOnly() {
  const v = process.env.CODEANT_READ_ONLY;
  if (v === undefined) return true;
  return v !== '0' && v.toLowerCase() !== 'false';
}

function ok(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function fail(err) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
  };
}

function resolveRepoOpts(input) {
  const remote = input.remote || scm.detectRemote();
  const name = input.name || scm.detectRepoName();
  const defaultBranch = input.defaultBranch || scm.detectDefaultBranch();
  if (!remote) throw new Error('Could not detect remote. Pass `remote` (github|gitlab|bitbucket|azure).');
  if (!name) throw new Error('Could not detect repo name. Pass `name` (owner/repo).');
  return { ...input, remote, name, defaultBranch };
}

// The settings runners take JSON config as strings (they come from CLI flags).
function jsonString(value) {
  return value === undefined ? undefined : JSON.stringify(value);
}

// Shared by the local review and local secrets tools.
const LOCAL_SCOPE_SCHEMA = {
  scope: z
    .enum(['all', 'uncommitted', 'staged-only', 'committed', 'last-commit', 'last-n-commits', 'base-branch', 'base-commit'])
    .optional()
    .describe('Which local changes to include. Default "uncommitted".'),
  lastNCommits: z.number().int().positive().max(5).optional(),
  baseBranch: z.string().optional(),
  baseCommit: z.string().optional(),
  include: z.array(z.string()).optional().describe('Glob patterns to include.'),
  exclude: z.array(z.string()).optional().describe('Glob patterns to exclude.'),
};

function localScopeOptions(input) {
  return {
    workspacePath: process.cwd(),
    scanType: input.scope ?? 'uncommitted',
    lastNCommits: input.lastNCommits ?? 1,
    include: input.include ?? [],
    exclude: input.exclude ?? [],
    baseBranch: input.baseBranch ?? null,
    baseCommit: input.baseCommit ?? null,
  };
}

async function ensureAuthenticated() {
  const envToken = process.env.CODEANT_API_TOKEN;
  if (envToken && envToken.trim()) return;
  if (isAlreadyLoggedIn()) {
    process.env.CODEANT_API_TOKEN = getConfigValue('apiKeyV2');
    return;
  }

  console.error('[codeant-mcp] No API token configured. Call the codeant_login tool to sign in, or set CODEANT_API_TOKEN.');
}

export function createMcpServer() {
  const server = new McpServer({ name: 'codeant', version: pkg.version });
  const readOnly = isReadOnly();

  // ─── Scans: discovery ────────────────────────────────────────────────────
  server.registerTool(
    'codeant_scans_orgs',
    {
      title: 'List CodeAnt organizations',
      description: 'List the CodeAnt organizations the current user is authenticated to. Use this first when the user has not specified an org.',
      inputSchema: {},
      annotations: READ,
    },
    async () => {
      try { return ok(await runOrgs()); } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_scans_repos',
    {
      title: 'List repositories in a CodeAnt org',
      description: 'List repositories connected to CodeAnt for a given organization. Use this to enumerate repos before fanning out org-wide queries (e.g. "secrets across all repos"). If `org` is omitted and the user has exactly one org, it is auto-picked.',
      inputSchema: {
        org: z.string().optional().describe('Organization name. Optional when only one org is authenticated.'),
      },
      annotations: READ,
    },
    async ({ org }) => {
      try { return ok(await runRepos({ org })); } catch (err) { return fail(err); }
    }
  );

  // ─── Scans: history + metadata ───────────────────────────────────────────
  server.registerTool(
    'codeant_scans_history',
    {
      title: 'List scan history for a repo',
      description: 'Show recent scan runs for a single repository. Use this to find a scan ID/commit SHA to drill into, or to answer "when did this repo last get scanned".',
      inputSchema: {
        repo: z.string().describe('Repository in owner/repo form.'),
        branch: z.string().optional().describe('Filter by branch name.'),
        since: z.string().optional().describe('ISO 8601 date; only return scans newer than this.'),
        limit: z.number().int().positive().max(100).optional().describe('Max scans returned (default 20).'),
      },
      annotations: READ,
    },
    async ({ repo, branch, since, limit }) => {
      try { return ok(await runHistory({ repo, branch, since, limit: limit ?? 20 })); } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_scans_get',
    {
      title: 'Get scan metadata summary',
      description: 'Get summary metadata for a single scan (severity + category counts only — no findings). Use this to size up a scan before pulling full results.',
      inputSchema: {
        repo: z.string().describe('Repository in owner/repo form.'),
        scan: z.string().optional().describe('Specific commit SHA. Takes precedence over `branch`.'),
        branch: z.string().optional().describe('Resolve the latest scan on this branch. Omit both `scan` and `branch` to use the latest scan on any branch.'),
        types: z.string().optional().describe('Comma-separated types: sast,sca,secrets,iac,dead_code,sbom,anti_patterns,docstring,complex_functions,all (default "all").'),
      },
      annotations: READ,
    },
    async ({ repo, scan, branch, types }) => {
      try { return ok(await runGet({ repo, scan, branch, types: types ?? 'all' })); } catch (err) { return fail(err); }
    }
  );

  // ─── Scans: findings ─────────────────────────────────────────────────────
  server.registerTool(
    'codeant_scans_results',
    {
      title: 'Fetch scan findings',
      description: 'Fetch full findings (SAST, SCA, secrets, IaC, dead code, anti-patterns, etc.) for a single scan on a single repository. Returns the raw findings as JSON. For org-wide queries, call `codeant_scans_repos` first and fan out per-repo.',
      inputSchema: {
        repo: z.string().describe('Repository in owner/repo form.'),
        scan: z.string().optional().describe('Specific commit SHA.'),
        branch: z.string().optional().describe('Resolve the latest scan on this branch.'),
        types: z.string().optional().describe('Comma-separated types: sast,sca,secrets,iac,dead_code,sbom,anti_patterns,docstring,complex_functions,all (default "all").'),
        severity: z.string().optional().describe('Comma-separated severities (e.g. "critical,high").'),
        path: z.string().optional().describe('File path glob filter.'),
        check: z.string().optional().describe('Filter by check ID or name (regex).'),
        filterDismissed: z.boolean().optional().describe('Exclude dismissed findings (default false).'),
        includeFalsePositives: z.boolean().optional().describe('Include false positives (default true).'),
        fields: z.string().optional().describe('Project findings to a subset of fields (comma-separated).'),
        limit: z.number().int().positive().max(500).optional().describe('Max findings per page (default 100).'),
        offset: z.number().int().nonnegative().optional().describe('Pagination offset (default 0).'),
      },
      annotations: READ,
    },
    async (input) => {
      try {
        return ok(
          await buildResultsEnvelope({
            repo: input.repo,
            scan: input.scan,
            branch: input.branch,
            types: input.types ?? 'all',
            severity: input.severity,
            path: input.path,
            check: input.check,
            filterDismissed: input.filterDismissed ?? false,
            includeFalsePositives: input.includeFalsePositives ?? true,
            fields: input.fields,
            limit: input.limit ?? 100,
            offset: input.offset ?? 0,
            failFast: false,
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    'codeant_scans_dismissed',
    {
      title: 'List dismissed alerts',
      description: 'List dismissed alerts (false positives, accepted risk, etc.) for a repository. Useful when triaging to avoid re-surfacing already-handled findings.',
      inputSchema: {
        repo: z.string().describe('Repository in owner/repo form.'),
        analysisType: z.enum(['security', 'secrets']).optional().describe('Analysis type (default "security").'),
      },
      annotations: READ,
    },
    async ({ repo, analysisType }) => {
      try { return ok(await runDismissed({ repo, analysisType: analysisType ?? 'security' })); } catch (err) { return fail(err); }
    }
  );

  // ─── Organization Hotlist findings (read-only) ──────────────────────────
  server.registerTool(
    'codeant_hotlist_list',
    {
      title: 'List prioritized Hotlist findings',
      description: 'Query the organization-wide Hotlist using the same stable IDs, ranking, filters, and pagination as the CodeAnt app. Use this for cross-repository security prioritization and agent triage.',
      inputSchema: {
        org: z.string().optional().describe('Organization name. Auto-picked when exactly one connection matches.'),
        service: z.enum(['github', 'gitlab', 'bitbucket', 'azuredevops']).optional(),
        providerBaseUrl: z.string().url().optional().describe('Override only for a self-hosted provider.'),
        search: z.string().optional(),
        types: z.array(z.string()).optional().describe('Finding types: SAST, SCA, Secrets, IaC, Infrastructure, AI Exploitation.'),
        locations: z.array(z.string()).optional().describe('Repositories or cloud accounts.'),
        severities: z.array(z.enum(['critical', 'high', 'medium', 'low', 'unknown'])).optional(),
        ticketStatuses: z.array(z.enum(['created', 'not_created'])).optional(),
        compliance: z.array(z.string()).optional(),
        validation: z.array(z.enum(['exploit_confirmed'])).optional(),
        limit: z.number().int().positive().max(100).optional(),
        cursor: z.string().optional(),
        all: z.boolean().optional().describe('Fetch every matching page. Default false.'),
        maxWaitSeconds: z.number().int().nonnegative().max(600).optional(),
      },
      annotations: READ,
    },
    async (input) => {
      try { return ok(await runHotlistList(input)); } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_hotlist_get',
    {
      title: 'Get a Hotlist finding',
      description: 'Fetch one complete Hotlist finding by its 32-character stable ID. Use the ID displayed in the app or returned by codeant_hotlist_list.',
      inputSchema: {
        findingId: z.string().regex(/^[0-9a-f]{32}$/i),
        org: z.string().optional(),
        service: z.enum(['github', 'gitlab', 'bitbucket', 'azuredevops']).optional(),
        providerBaseUrl: z.string().url().optional(),
        maxWaitSeconds: z.number().int().nonnegative().max(600).optional(),
      },
      annotations: READ,
    },
    async (input) => {
      try { return ok(await runHotlistGet(input)); } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_findings_antipatterns',
    {
      title: 'List organization anti-pattern findings',
      description: 'Fetch anti-pattern findings across selected repositories, or every repository in the organization when repos is omitted.',
      inputSchema: {
        org: z.string().optional(),
        service: z.enum(['github', 'gitlab', 'bitbucket', 'azuredevops']).optional(),
        providerBaseUrl: z.string().url().optional(),
        repos: z.array(z.string()).optional().describe('Repositories in owner/repo form. Omit to query every repository.'),
      },
      annotations: READ,
    },
    async (input) => {
      try { return ok(await runOrganizationAntipatterns(input)); } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_cloud_scan_history',
    {
      title: 'List cloud security scan history',
      description: 'List AWS, Azure, or GCP CSPM, VM, or container scans visible in the CodeAnt Cloud Security UI. Cloud findings are organization/account scoped, not repository scoped.',
      inputSchema: {
        org: z.string().optional(),
        service: z.enum(['github', 'gitlab', 'bitbucket', 'azuredevops']).optional(),
        providerBaseUrl: z.string().url().optional(),
        provider: z.enum(['aws', 'azure', 'gcp', 'all']).optional().describe('Default all.'),
        kind: z.enum(['cspm', 'vm', 'container']).optional().describe('Default cspm.'),
        latest: z.boolean().optional().describe('Return latest scans instead of complete history. CSPM only.'),
      },
      annotations: READ,
    },
    async (input) => {
      try { return ok(await runCloudHistory(input)); } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_cloud_findings_list',
    {
      title: 'List cloud security findings',
      description: 'Fetch findings for one AWS, Azure, or GCP CSPM, VM, or container scan using the same endpoint as the app.',
      inputSchema: {
        org: z.string().optional(),
        service: z.enum(['github', 'gitlab', 'bitbucket', 'azuredevops']).optional(),
        providerBaseUrl: z.string().url().optional(),
        provider: z.enum(['aws', 'azure', 'gcp']),
        kind: z.enum(['cspm', 'vm', 'container']).optional().describe('Default cspm.'),
        scanId: z.string(),
        accountId: z.string().optional().describe('Optional AWS account ID.'),
        tenantId: z.string().optional().describe('Required for Azure.'),
        projectId: z.string().optional().describe('Required for GCP.'),
        cloudService: z.string().optional(),
        severity: z.string().optional(),
        status: z.string().optional(),
        framework: z.string().optional(),
        subscriptionId: z.string().optional(),
        exploitAttemptedOnly: z.boolean().optional(),
        minDaysUnused: z.number().int().nonnegative().optional(),
      },
      annotations: READ,
    },
    async (input) => {
      try { return ok(await runCloudFindings(input)); } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_cloud_finding_get',
    {
      title: 'Get cloud security finding detail',
      description: 'Fetch complete detail for one CSPM, VM, or container finding UID.',
      inputSchema: {
        org: z.string().optional(),
        service: z.enum(['github', 'gitlab', 'bitbucket', 'azuredevops']).optional(),
        providerBaseUrl: z.string().url().optional(),
        provider: z.enum(['aws', 'azure', 'gcp']),
        kind: z.enum(['cspm', 'vm', 'container']).optional().describe('Default cspm.'),
        scanId: z.string(),
        uid: z.string(),
        accountId: z.string().optional(),
        tenantId: z.string().optional().describe('Required for Azure.'),
        projectId: z.string().optional().describe('Required for GCP.'),
        cloudService: z.string().optional(),
      },
      annotations: READ,
    },
    async (input) => {
      try { return ok(await runCloudFindingGet(input)); } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_pentest_history',
    {
      title: 'List pentest engagements',
      description: 'List every pentest engagement visible in the CodeAnt Pentesting UI, including status and finding counts.',
      inputSchema: {
        org: z.string().optional(),
        service: z.enum(['github', 'gitlab', 'bitbucket', 'azuredevops']).optional(),
        providerBaseUrl: z.string().url().optional(),
      },
      annotations: READ,
    },
    async (input) => {
      try { return ok(await runPentestHistory(input)); } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_pentest_issues',
    {
      title: 'List pentest issues',
      description: 'Fetch all available open issues for one pentest engagement. The backend applies the same entitlement redaction as the UI.',
      inputSchema: {
        org: z.string().optional(),
        service: z.enum(['github', 'gitlab', 'bitbucket', 'azuredevops']).optional(),
        providerBaseUrl: z.string().url().optional(),
        reportId: z.string(),
        variant: z.enum(['prod', 'test']).optional(),
      },
      annotations: READ,
    },
    async (input) => {
      try { return ok(await runPentestIssues(input)); } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_pentest_report',
    {
      title: 'Get pentest report',
      description: 'Fetch the full customer report for one pentest engagement. The backend applies the same entitlement redaction as the UI.',
      inputSchema: {
        org: z.string().optional(),
        service: z.enum(['github', 'gitlab', 'bitbucket', 'azuredevops']).optional(),
        providerBaseUrl: z.string().url().optional(),
        reportId: z.string(),
        variant: z.enum(['prod', 'test']).optional(),
      },
      annotations: READ,
    },
    async (input) => {
      try { return ok(await runPentestReport(input)); } catch (err) { return fail(err); }
    }
  );

  // Generic GET keeps newly-added read APIs available without a CLI release.
  // Non-GET requests are registered below only when write mode is enabled.
  server.registerTool(
    'codeant_api_get',
    {
      title: 'Call a CodeAnt GET API',
      description: 'Call any authenticated GET endpoint on the configured CodeAnt API host, for read APIs that have no dedicated tool yet. The path must be relative and start with `/`; absolute URLs are rejected. Most existing CodeAnt app endpoints are POST — prefer the dedicated codeant_* tools for scans, findings, and analysis settings.',
      inputSchema: {
        path: z.string().startsWith('/'),
        org: z.string().optional().describe('Organization name. Required when the login has multiple matching connections.'),
        service: z.enum(['github', 'gitlab', 'bitbucket', 'azuredevops']).optional(),
        providerBaseUrl: z.string().url().optional().describe('Override only for a self-hosted provider.'),
        query: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
        headers: z.array(z.string()).optional().describe('Optional repeatable "Name: value" headers. Authorization cannot be overridden.'),
      },
      annotations: READ,
    },
    async (input) => {
      try { return ok(await runApiRequest({ method: 'GET', ...input })); } catch (err) { return fail(err); }
    }
  );

  // ─── Pull requests (SCM, read-only) ──────────────────────────────────────
  server.registerTool(
    'codeant_pr_list',
    {
      title: 'List pull requests',
      description: 'List pull requests / merge requests on the current repo (auto-detected from git remote unless `name`+`remote` are provided).',
      inputSchema: {
        name: z.string().optional().describe('Repository in owner/repo form. Auto-detected if omitted.'),
        remote: z.enum(['github', 'gitlab', 'bitbucket', 'azure']).optional().describe('Auto-detected if omitted.'),
        defaultBranch: z.string().optional(),
        sourceBranch: z.string().optional(),
        author: z.string().optional().describe('Filter by author login (fuzzy).'),
        state: z.enum(['open', 'closed']).optional().describe('Default "open".'),
        limit: z.number().int().positive().max(100).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: READ,
    },
    async (input) => {
      try {
        const opts = resolveRepoOpts(input);
        return ok(
          await scm.listPullRequests({
            name: opts.name,
            remote: opts.remote,
            defaultBranch: opts.defaultBranch,
            sourceBranch: opts.sourceBranch,
            authorLogin: opts.author,
            state: opts.state ?? 'open',
            limit: opts.limit ?? 20,
            offset: opts.offset ?? 0,
          })
        );
      } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_pr_get',
    {
      title: 'Get pull request details',
      description: 'Fetch detailed information for a single PR/MR including review analysis.',
      inputSchema: {
        prNumber: z.number().int().positive(),
        name: z.string().optional(),
        remote: z.enum(['github', 'gitlab', 'bitbucket', 'azure']).optional(),
        defaultBranch: z.string().optional(),
      },
      annotations: READ,
    },
    async (input) => {
      try {
        const opts = resolveRepoOpts(input);
        return ok(
          await scm.getPullRequest({
            name: opts.name,
            remote: opts.remote,
            defaultBranch: opts.defaultBranch,
            prNumber: input.prNumber,
          })
        );
      } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_pr_comments',
    {
      title: 'List PR comments',
      description: 'List comments on a PR/MR with optional filters (CodeAnt-authored only, resolved/unresolved, date range).',
      inputSchema: {
        prNumber: z.number().int().positive(),
        name: z.string().optional(),
        remote: z.enum(['github', 'gitlab', 'bitbucket', 'azure']).optional(),
        defaultBranch: z.string().optional(),
        codeantGenerated: z.boolean().optional().describe('Only return comments authored by CodeAnt.'),
        addressed: z.boolean().optional().describe('Filter by addressed/resolved status.'),
        createdAfter: z.string().optional().describe('ISO 8601.'),
        createdBefore: z.string().optional().describe('ISO 8601.'),
      },
      annotations: READ,
    },
    async (input) => {
      try {
        const opts = resolveRepoOpts(input);
        return ok(
          await scm.listPullRequestComments({
            name: opts.name,
            remote: opts.remote,
            defaultBranch: opts.defaultBranch,
            prNumber: input.prNumber,
            codeantGenerated: input.codeantGenerated,
            addressed: input.addressed,
            createdAfter: input.createdAfter,
            createdBefore: input.createdBefore,
          })
        );
      } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_comments_search',
    {
      title: 'Search CodeAnt review comments',
      description: 'Search across CodeAnt review comments by free-text query. Returns matching comments with repo, PR, and file context.',
      inputSchema: {
        query: z.string(),
        name: z.string().optional(),
        remote: z.enum(['github', 'gitlab', 'bitbucket', 'azure']).optional(),
        limit: z.number().int().positive().max(50).optional(),
        includeAddressed: z.boolean().optional(),
        createdAfter: z.string().optional().describe('ISO 8601.'),
      },
      annotations: READ,
    },
    async (input) => {
      try {
        const opts = resolveRepoOpts(input);
        return ok(
          await scm.searchComments({
            name: opts.name,
            remote: opts.remote,
            query: input.query,
            limit: input.limit ?? 10,
            includeAddressed: input.includeAddressed ?? false,
            createdAfter: input.createdAfter,
          })
        );
      } catch (err) { return fail(err); }
    }
  );

  // ─── Local review (read-only — does not modify files) ────────────────────
  server.registerTool(
    'codeant_review_local',
    {
      title: 'Review local working-copy changes',
      description: 'Run a CodeAnt AI review on local working-copy changes and return the findings as JSON. Does not modify files — pair with editor tools to apply fixes. Use this for "review my changes" / "check my staged files" prompts.',
      inputSchema: LOCAL_SCOPE_SCHEMA,
      annotations: READ,
    },
    async (input) => {
      try {
        const result = await runReviewHeadless({
          ...localScopeOptions(input),
          onProgress: () => {},
          onFilesReady: () => {},
        });
        return ok(result);
      } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_secrets_local',
    {
      title: 'Scan local changes for secrets',
      description: 'Scan local working-copy changes for hard-coded secrets (API keys, tokens, private keys) using the same rules as `codeant secrets`. Runs entirely on this machine and does not modify files or report to CodeAnt. Secret values are masked in the output. Use this for "check my changes for secrets" prompts; for secrets already found by a cloud scan use codeant_scans_results with types="secrets".',
      inputSchema: LOCAL_SCOPE_SCHEMA,
      annotations: { ...READ, openWorldHint: false },
    },
    async (input) => {
      try { return ok(await runSecretsHeadless(localScopeOptions(input))); } catch (err) { return fail(err); }
    }
  );

  // ─── Analysis settings (read) ────────────────────────────────────────────
  server.registerTool(
    'codeant_analysis_settings_get',
    {
      title: 'Get analysis settings for a repo',
      description: 'Get the analysis feature flags for a repository — which static analyzers (SAST, SCA, secrets, IaC, dead code, etc.) are enabled. Use this to explain why a scan category is empty.',
      inputSchema: {
        repo: z.string().describe('Repository in owner/repo form.'),
      },
      annotations: READ,
    },
    async ({ repo }) => {
      try { return ok(await runAnalysisFeatureFlagsGet({ repo })); } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_recurring_scans_list',
    {
      title: 'List recurring scan schedules',
      description: 'List recurring scan schedules, optionally filtered by repository, status, or schedule ID.',
      inputSchema: {
        repo: z.string().optional().describe('Repository in owner/repo form.'),
        status: z.string().optional().describe('Filter by status (e.g. ACTIVE).'),
        scheduleId: z.string().optional(),
      },
      annotations: READ,
    },
    async (input) => {
      try { return ok(await runRecurringScanslist(input)); } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_branches_list',
    {
      title: 'List repository branches',
      description: 'List the branches CodeAnt knows for a repository and its configured default branch. Use this to pick a `branch` for codeant_scans_results or codeant_scans_start. Large repos have hundreds of branches — pass `search` to narrow the list.',
      inputSchema: {
        repo: z.string().describe('Repository in owner/repo form.'),
        search: z.string().optional().describe('Case-insensitive substring filter on branch names.'),
        limit: z.number().int().positive().max(1000).optional().describe('Max branches returned (default 50).'),
      },
      annotations: READ,
    },
    async ({ repo, search, limit = 50 }) => {
      try {
        const [defaultBranch, all] = await Promise.all([runBranchesDefault({ repo }), runBranchesAll({ repo })]);
        if (!Array.isArray(all?.branches)) return ok({ repo, default: defaultBranch, all });
        const needle = search?.toLowerCase();
        const matches = needle ? all.branches.filter((b) => String(b).toLowerCase().includes(needle)) : all.branches;
        return ok({
          repo,
          default: defaultBranch?.branch ?? defaultBranch,
          total: matches.length,
          truncated: matches.length > limit,
          branches: matches.slice(0, limit),
        });
      } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_cve_reporting_list',
    {
      title: 'List CVE report configurations',
      description: 'List scheduled CVE report configurations, optionally filtered by repository, status, or report ID.',
      inputSchema: {
        repo: z.string().optional().describe('Repository in owner/repo form.'),
        status: z.string().optional().describe('Filter by status (e.g. ACTIVE).'),
        reportId: z.string().optional(),
      },
      annotations: READ,
    },
    async (input) => {
      try { return ok(await runCveReportingList(input)); } catch (err) { return fail(err); }
    }
  );

  // ─── Auth (always registered — login is needed even in read-only mode) ───
  server.registerTool(
    'codeant_login',
    {
      title: 'Sign in to CodeAnt AI',
      description: 'Opens the configured CodeAnt dashboard in the user\'s browser and waits up to 10 minutes for them to complete sign-in. Tell the user to check their browser and finish the flow there. On success the API token is saved to ~/.codeant/config.json (apiKeyV2) and set on the running MCP process, so subsequent tool calls are authenticated without restart. Returns { alreadyLoggedIn: true } immediately if a token is already configured, unless `force` is true.',
      inputSchema: {
        force: z.boolean().optional().describe('Re-authenticate even if a token is already configured. Default false.'),
      },
      annotations: { ...WRITE_NON_DESTRUCTIVE, idempotentHint: true },
    },
    async ({ force }) => {
      try {
        const envToken = process.env.CODEANT_API_TOKEN;
        if (!force && ((envToken && envToken.trim()) || isAlreadyLoggedIn())) {
          return ok({ alreadyLoggedIn: true });
        }
        const { token, loginUrl } = await runLoginFlow();
        const masked = token ? `${token.slice(0, 8)}…` : null;
        return ok({ status: 'success', loginUrl, token: masked });
      } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_logout',
    {
      title: 'Sign out of CodeAnt AI',
      description: 'Clears the saved API token from ~/.codeant/config.json and unsets CODEANT_API_TOKEN on the running MCP process. Returns { wasLoggedIn: false } immediately if no token was configured.',
      inputSchema: {},
      annotations: { ...WRITE_NON_DESTRUCTIVE, idempotentHint: true },
    },
    async () => {
      try {
        const result = await logoutCodeAnt();
        return ok({
          ...result,
          status: result.wasLoggedIn ? 'logged_out' : 'not_logged_in',
        });
      } catch (err) { return fail(err); }
    }
  );

  // ─── Write-side tools (gated behind CODEANT_READ_ONLY=0) ─────────────────
  if (!readOnly) {
    server.registerTool(
      'codeant_api_request',
      {
        title: 'Call a CodeAnt write API',
        description: 'Call an authenticated POST, PUT, PATCH, or DELETE endpoint on the configured CodeAnt API host. WRITE OPERATION — only enabled when CODEANT_READ_ONLY=0. Absolute URLs are rejected.',
        inputSchema: {
          method: z.enum(['POST', 'PUT', 'PATCH', 'DELETE']),
          path: z.string().startsWith('/'),
          org: z.string().optional().describe('Organization name. Required when the login has multiple matching connections.'),
          service: z.enum(['github', 'gitlab', 'bitbucket', 'azuredevops']).optional(),
          providerBaseUrl: z.string().url().optional().describe('Override only for a self-hosted provider.'),
          query: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
          body: z.unknown().optional(),
          headers: z.array(z.string()).optional(),
        },
        annotations: WRITE_NON_DESTRUCTIVE,
      },
      async (input) => {
        try { return ok(await runApiRequest(input)); } catch (err) { return fail(err); }
      }
    );

    server.registerTool(
      'codeant_scans_start',
      {
        title: 'Trigger a new scan',
        description: 'Trigger a new scan run for a repository. Repo, branch, and commit are auto-detected from the MCP server\'s working directory when omitted; the resolved values are returned. WRITE OPERATION — only enabled when CODEANT_READ_ONLY=0.',
        inputSchema: {
          repo: z.string().optional().describe('owner/repo (auto-detected from git remote if omitted).'),
          branch: z.string().optional(),
          commit: z.string().optional(),
          include: z.string().optional().describe('Comma-separated globs.'),
          exclude: z.string().optional().describe('Comma-separated globs.'),
        },
        annotations: WRITE_NON_DESTRUCTIVE,
      },
      async (input) => {
        try { return ok(await runStartScan(input)); } catch (err) { return fail(err); }
      }
    );

    server.registerTool(
      'codeant_pr_resolve',
      {
        title: 'Resolve a PR conversation',
        description: 'Resolve a conversation/comment thread on a PR. WRITE OPERATION — only enabled when CODEANT_READ_ONLY=0.',
        inputSchema: {
          prNumber: z.number().int().positive(),
          name: z.string().optional(),
          remote: z.enum(['github', 'gitlab', 'bitbucket', 'azure']).optional(),
          commentId: z.number().int().optional(),
          threadId: z.string().optional(),
          discussionId: z.string().optional(),
        },
        annotations: { ...WRITE_NON_DESTRUCTIVE, idempotentHint: true },
      },
      async (input) => {
        try {
          const opts = resolveRepoOpts(input);
          return ok(
            await scm.resolveConversation({
              name: opts.name,
              remote: opts.remote,
              prNumber: input.prNumber,
              commentId: input.commentId,
              threadId: input.threadId,
              discussionId: input.discussionId,
            })
          );
        } catch (err) { return fail(err); }
      }
    );

    server.registerTool(
      'codeant_analysis_settings_update',
      {
        title: 'Update analysis settings for a repo',
        description: 'Enable or disable analysis feature flags for a repository (e.g. {"sast_analysis":"enabled"}). Call codeant_analysis_settings_get first to see the current keys. WRITE OPERATION — only enabled when CODEANT_READ_ONLY=0.',
        inputSchema: {
          repo: z.string().describe('Repository in owner/repo form.'),
          flags: z.record(z.unknown()).describe('Feature flags to set, keyed by flag name.'),
        },
        annotations: WRITE_NON_DESTRUCTIVE,
      },
      async ({ repo, flags }) => {
        try { return ok(await runAnalysisFeatureFlagsUpdate({ repo, flags: jsonString(flags) })); } catch (err) { return fail(err); }
      }
    );

    server.registerTool(
      'codeant_recurring_scans_create',
      {
        title: 'Create a recurring scan schedule',
        description: 'Create a recurring scan schedule. WRITE OPERATION — only enabled when CODEANT_READ_ONLY=0.',
        inputSchema: {
          name: z.string(),
          repo: z.string().optional().describe('Repository in owner/repo form.'),
          scheduleConfig: z.record(z.unknown()).optional().describe('e.g. {"frequency":"weekly"}'),
          scanConfig: z.record(z.unknown()).optional(),
          description: z.string().optional(),
          notificationConfig: z.record(z.unknown()).optional(),
          createdBy: z.string().optional(),
        },
        annotations: WRITE_NON_DESTRUCTIVE,
      },
      async (input) => {
        try {
          return ok(await runRecurringScansCreate({
            ...input,
            scheduleConfig: jsonString(input.scheduleConfig),
            scanConfig: jsonString(input.scanConfig),
            notificationConfig: jsonString(input.notificationConfig),
          }));
        } catch (err) { return fail(err); }
      }
    );

    server.registerTool(
      'codeant_recurring_scans_update',
      {
        title: 'Update a recurring scan schedule',
        description: 'Update a recurring scan schedule, including pausing it with status INACTIVE. WRITE OPERATION — only enabled when CODEANT_READ_ONLY=0.',
        inputSchema: {
          scheduleId: z.string(),
          repo: z.string().describe('Repository in owner/repo form.'),
          status: z.string().optional().describe('e.g. ACTIVE, INACTIVE'),
          name: z.string().optional(),
          description: z.string().optional(),
          scheduleConfig: z.record(z.unknown()).optional(),
          scanConfig: z.record(z.unknown()).optional(),
          notificationConfig: z.record(z.unknown()).optional(),
        },
        annotations: { ...WRITE_NON_DESTRUCTIVE, idempotentHint: true },
      },
      async (input) => {
        try {
          return ok(await runRecurringScansUpdate({
            ...input,
            scheduleConfig: jsonString(input.scheduleConfig),
            scanConfig: jsonString(input.scanConfig),
            notificationConfig: jsonString(input.notificationConfig),
          }));
        } catch (err) { return fail(err); }
      }
    );
  }

  return server;
}

export async function startMcpServer() {
  await ensureAuthenticated();
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
