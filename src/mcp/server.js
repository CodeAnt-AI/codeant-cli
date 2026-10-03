import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createRequire } from 'module';

import { runOrgs } from '../commands/scans/orgs.js';
import { runRepos } from '../commands/scans/repos.js';
import { runHistory } from '../commands/scans/history.js';
import { runGet } from '../commands/scans/get.js';
import { runResults } from '../commands/scans/results.js';
import { runDismissed, runOverrides } from '../commands/scans/dismissed.js';
import { runStartScan } from '../commands/scans/start-scan.js';
import { runReviewHeadless } from '../reviewHeadless.js';
import * as scm from '../scm/index.js';
import { awaitLoginCompletion, isAlreadyLoggedIn, startLoginFlow } from '../utils/loginFlow.js';
import { runHotlistGet, runHotlistList } from '../hotlist/client.js';
import { logoutCodeAnt } from '../utils/logout.js';
import { runApiRequest } from '../commands/api/request.js';
import { runOrganizationAntipatterns } from '../findings/antipatterns.js';
import { runCloudFindingGet, runCloudFindings, runCloudHistory } from '../findings/cloud.js';
import { runPentestHistory, runPentestIssues, runPentestReport } from '../findings/pentest.js';
import { maxResultChars, shapeCloudFindings, shapeCloudHistory, shapePentestHistory, shapeRepos, tooLarge } from './shape.js';

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

const INSTRUCTIONS = `CodeAnt AI tools for repository scans, organization-wide security findings, cloud security, pentests, pull requests, and local code review.

- Start with codeant_scans_orgs. When it lists more than one connection, pass org and service to the Hotlist, anti-pattern, cloud, pentest, and API tools.
- Repository findings: codeant_scans_repos (use full_name) -> codeant_scans_history or codeant_scans_get -> codeant_scans_results, once per repository. Parallel calls are safe.
- Prioritized findings across the organization: codeant_hotlist_list, then codeant_hotlist_get for one finding.
- Cloud security: codeant_cloud_scan_history -> codeant_cloud_findings_list (pass status "FAIL" to skip passing checks) -> codeant_cloud_finding_get. Pentests: codeant_pentest_history -> codeant_pentest_issues or codeant_pentest_report.
- List tools return one page with a total. Page with limit and offset (cursor and next_cursor for the Hotlist), and narrow with filters instead of requesting everything. Results over the size limit are refused with a hint.
- codeant_review_local and the pull request tools work on the git repository in this server's working directory. Outside a repository, pass name and remote to the pull request tools; local review is unavailable.
- Pull request and comment tools call GitHub, GitLab, Bitbucket, or Azure DevOps directly and need a token for that provider.
- On an authentication error ("Missing API key", "Invalid API key", or access denied), call codeant_login with force: true (a configured token may be stale), show the returned loginUrl to the user, and after they finish signing in call codeant_login again without force to confirm.`;

function textResult(text, hint) {
  if (text.length > maxResultChars()) return fail(tooLarge(text.length, hint));
  return { content: [{ type: 'text', text }] };
}

function ok(value, hint) {
  return textResult(JSON.stringify(value), hint);
}

function fail(err) {
  const body = err instanceof Error ? { error: err.message } : err && typeof err === 'object' ? err : { error: String(err) };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(body) }],
  };
}

function maskToken(token) {
  return token ? `${token.slice(0, 8)}…` : null;
}

function resolveRepoOpts(input) {
  const remote = input.remote || scm.detectRemote();
  const name = input.name || scm.detectRepoName();
  if (!remote) throw new Error('Could not detect remote. Pass `remote` (github|gitlab|bitbucket|azure).');
  if (!name) throw new Error('Could not detect repo name. Pass `name` (owner/repo).');
  return { ...input, remote, name };
}

// Capture stdout from a function that writes JSON to stdout (only `scans start-scan`, a write tool).
// It swaps the global stdout writer, so overlapping calls must not use it.
async function captureStdout(fn) {
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = origWrite;
  }
  return chunks.join('');
}

function hasEnvToken() {
  return !!process.env.CODEANT_API_TOKEN?.trim();
}

// The saved token is read from ~/.codeant/config.json on every request, so a
// `codeant login` in another terminal takes effect without restarting the server.
function warnIfUnauthenticated() {
  if (hasEnvToken() || isAlreadyLoggedIn()) return;
  console.error('[codeant-mcp] No API token configured. Call the codeant_login tool to sign in, or set CODEANT_API_TOKEN.');
}

export function createMcpServer() {
  warnIfUnauthenticated();

  const server = new McpServer({ name: 'codeant', version: pkg.version }, { instructions: INSTRUCTIONS });
  const readOnly = isReadOnly();
  let login = null;
  // codeant_login calls run one at a time so concurrent calls share one sign-in.
  let loginQueue = Promise.resolve();

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
      description: 'List repositories connected to CodeAnt for a given organization, most recently pushed first. Use this to enumerate repos before fanning out org-wide queries (e.g. "secrets across all repos"). Returns one page of slim records (full_name, default_branch, language, pushed_at, ...) with total and next_offset. If `org` is omitted and the user has exactly one org, it is auto-picked.',
      inputSchema: {
        org: z.string().optional().describe('Organization name. Optional when only one org is authenticated.'),
        search: z.string().optional().describe('Case-insensitive substring match on the repository name.'),
        limit: z.number().int().positive().max(1000).optional().describe('Max repositories returned (default 100).'),
        offset: z.number().int().nonnegative().optional().describe('Pagination offset (default 0).'),
        full: z.boolean().optional().describe('Return the complete provider records instead of slim ones. Default false.'),
      },
      annotations: READ,
    },
    async ({ org, ...shape }) => {
      try { return ok(shapeRepos(await runRepos({ org }), shape), 'Use search, or a smaller limit with offset.'); } catch (err) { return fail(err); }
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
        scan: z.string().optional().describe('Specific commit SHA. Either `scan` or `branch` should be provided.'),
        branch: z.string().optional().describe('Resolve the latest scan on this branch.'),
        types: z.string().optional().describe('Comma-separated scan types (default "all"). e.g. "sast,secrets".'),
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
        types: z.string().optional().describe('Comma-separated types: sast,sca,secrets,iac,dead_code,duplicate_code,sbom,anti_patterns,docstring,complex_functions,all (default "all").'),
        severity: z.string().optional().describe('Comma-separated severities (e.g. "critical,high").'),
        path: z.string().optional().describe('File path glob filter.'),
        check: z.string().optional().describe('Filter by check ID or name (regex).'),
        filterDismissed: z.boolean().optional().describe('Exclude dismissed findings (default false). When false, dismissed findings carry metadata.dismissed.'),
        includeFalsePositives: z.boolean().optional().describe('Include false positives, including user-marked ones (default true). When true, they carry metadata.false_positive.'),
        fields: z.string().optional().describe('Project findings to a subset of fields (comma-separated).'),
        limit: z.number().int().positive().max(500).optional().describe('Max findings per page (default 50).'),
        offset: z.number().int().nonnegative().optional().describe('Pagination offset (default 0).'),
      },
      annotations: READ,
    },
    async (input) => {
      try {
        const envelope = await runResults({
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
          limit: input.limit ?? 50,
          offset: input.offset ?? 0,
          failFast: false,
          returnEnvelope: true,
        });
        return ok(envelope, 'Use a smaller limit with offset, filter by types, severity, path, or check, or project fields.');
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
        analysisType: z.enum(['security', 'sast', 'secrets', 'sca', 'iac', 'antipatterns', 'anti_patterns', 'docstring', 'complex_functions', 'dead_code', 'duplicate_code']).optional().describe('Analysis type (default "security"; sast and anti_patterns are aliases).'),
      },
      annotations: READ,
    },
    async ({ repo, analysisType }) => {
      try { return ok(await runDismissed({ repo, analysisType: analysisType ?? 'security' })); } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_scans_overrides',
    {
      title: 'List user issue overrides',
      description: 'List per-finding overrides users set in the CodeAnt app for a repository: Mark/Unmark false positive (security, iac), secrets confidence, and Change Severity (security, sca). Results from codeant_scans_results already apply them; use this to explain why a finding is hidden or re-rated.',
      inputSchema: {
        repo: z.string().describe('Repository in owner/repo form.'),
        analysisType: z.enum(['security', 'secrets', 'iac', 'sca']).optional().describe('Analysis type (default "security").'),
      },
      annotations: READ,
    },
    async ({ repo, analysisType }) => {
      try { return ok(await runOverrides({ repo, analysisType: analysisType ?? 'security' })); } catch (err) { return fail(err); }
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
        types: z.array(z.string()).optional(),
        locations: z.array(z.string()).optional(),
        severities: z.array(z.enum(['critical', 'high', 'medium', 'low', 'unknown'])).optional(),
        ticketStatuses: z.array(z.enum(['created', 'not_created'])).optional(),
        compliance: z.array(z.string()).optional(),
        validation: z.array(z.enum(['exploit_confirmed'])).optional(),
        limit: z.number().int().positive().max(100).optional().describe('Page size (default 10).'),
        cursor: z.string().optional().describe('next_cursor from a previous page.'),
        all: z.boolean().optional().describe('Fetch every matching page. Default false.'),
        maxWaitSeconds: z.number().int().nonnegative().max(600).optional(),
      },
      annotations: READ,
    },
    async (input) => {
      try {
        return ok(await runHotlistList({ ...input, limit: input.limit ?? 10 }), 'Page with limit and cursor instead of all, or add filters such as severities or types.');
      } catch (err) { return fail(err); }
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
      description: 'Fetch anti-pattern findings across selected repositories, or every repository in the organization when repos is omitted. Results are paged; the response carries total.',
      inputSchema: {
        org: z.string().optional(),
        service: z.enum(['github', 'gitlab', 'bitbucket', 'azuredevops']).optional(),
        providerBaseUrl: z.string().url().optional(),
        repos: z.array(z.string()).optional().describe('Repositories in owner/repo form. Omit to query every repository.'),
        limit: z.union([z.literal(25), z.literal(100), z.literal(500)]).optional().describe('Page size (default 25).'),
        offset: z.number().int().nonnegative().optional().describe('Start offset, a multiple of limit (default 0).'),
        all: z.boolean().optional().describe('Fetch every page from offset on instead of one page.'),
      },
      annotations: READ,
    },
    async (input) => {
      try {
        return ok(await runOrganizationAntipatterns({ ...input, limit: input.limit ?? 25 }), 'Page with limit and offset instead of all, or pass fewer repos.');
      } catch (err) { return fail(err); }
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
        limit: z.number().int().positive().max(200).optional().describe('Max scans returned per provider, newest first (default 10).'),
        offset: z.number().int().nonnegative().optional().describe('Pagination offset within each provider (default 0).'),
        full: z.boolean().optional().describe('Keep per-service, compliance, and region rollups on each scan. Default false.'),
      },
      annotations: READ,
    },
    async ({ limit, offset, full, ...input }) => {
      try {
        return ok(shapeCloudHistory(await runCloudHistory(input), { limit: limit ?? 10, offset: offset ?? 0, full }), 'Pass a single provider, a smaller limit, or latest: true.');
      } catch (err) { return fail(err); }
    }
  );

  server.registerTool(
    'codeant_cloud_findings_list',
    {
      title: 'List cloud security findings',
      description: 'Fetch findings for one AWS, Azure, or GCP CSPM, VM, or container scan. Results are paged (limit/offset/all) and carry total; pass status "FAIL" to skip passing CSPM checks. Compliance mappings are omitted unless full is true.',
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
        limit: z.union([z.literal(25), z.literal(100), z.literal(500)]).optional().describe('Page size (default 25).'),
        offset: z.number().int().nonnegative().optional().describe('Start offset, a multiple of limit (default 0).'),
        all: z.boolean().optional().describe('Fetch every page from offset on instead of one page.'),
        full: z.boolean().optional().describe('Keep compliance mappings on each finding. Default false.'),
      },
      annotations: READ,
    },
    async ({ full, ...input }) => {
      try {
        const limit = input.limit ?? 25;
        const result = await runCloudFindings({ ...input, limit });
        return ok(
          shapeCloudFindings(result, { kind: input.kind ?? 'cspm', limit, offset: input.offset ?? 0, all: input.all, full }),
          'Filter by status (for example "FAIL"), severity, or cloudService, or page with limit and offset instead of all.',
        );
      } catch (err) { return fail(err); }
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
      description: 'List pentest engagements visible in the CodeAnt Pentesting UI, newest first, including status and finding counts. Returns one page with total and next_offset.',
      inputSchema: {
        org: z.string().optional(),
        service: z.enum(['github', 'gitlab', 'bitbucket', 'azuredevops']).optional(),
        providerBaseUrl: z.string().url().optional(),
        limit: z.number().int().positive().max(500).optional().describe('Max engagements returned (default 25).'),
        offset: z.number().int().nonnegative().optional().describe('Pagination offset (default 0).'),
        full: z.boolean().optional().describe('Keep credit and billing details on each engagement. Default false.'),
      },
      annotations: READ,
    },
    async ({ limit, offset, full, ...input }) => {
      try {
        return ok(shapePentestHistory(await runPentestHistory(input), { limit: limit ?? 25, offset: offset ?? 0, full }), 'Use a smaller limit with offset.');
      } catch (err) { return fail(err); }
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
      description: 'Call any authenticated GET endpoint on the configured CodeAnt API host, for read APIs no dedicated tool covers. The path must be relative and start with a single "/"; absolute URLs are rejected. Returns { ok, status, tenant, data }; non-2xx responses come back with ok: false.',
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
        sourceBranch: z.string().optional().describe('Source branch. Exact match, except substring on Bitbucket.'),
        author: z.string().optional().describe('Author. Substring of the login on GitHub and Bitbucket, exact username on GitLab, identity ID on Azure DevOps.'),
        state: z.enum(['open', 'closed']).optional().describe('Default "open".'),
        limit: z.number().int().positive().max(100).optional().describe('Max results (default 20).'),
        offset: z.number().int().nonnegative().optional().describe('Pagination offset, rounded down to a multiple of limit on GitHub and GitLab; ignored on Bitbucket and Azure DevOps.'),
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
      description: 'Fetch one PR/MR: provider metadata (title, state, branches, author, dates) and reviewer approval states.',
      inputSchema: {
        prNumber: z.number().int().positive(),
        name: z.string().optional(),
        remote: z.enum(['github', 'gitlab', 'bitbucket', 'azure']).optional(),
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
      description: 'List comments on a PR/MR, optionally only CodeAnt-authored ones or those in a date range. GitLab, Bitbucket, and Azure DevOps comments carry a resolved flag; GitHub comments do not.',
      inputSchema: {
        prNumber: z.number().int().positive(),
        name: z.string().optional(),
        remote: z.enum(['github', 'gitlab', 'bitbucket', 'azure']).optional(),
        codeantGenerated: z.boolean().optional().describe('Only return comments authored by CodeAnt.'),
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
            prNumber: input.prNumber,
            codeantGenerated: input.codeantGenerated,
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
      description: 'Case-insensitive text search over review comments on the 10 most recently updated PRs/MRs of one repository (open ones only on Bitbucket and Azure DevOps). Matches comments from every author; each result has isCodeantComment, prNumber, path, and line.',
      inputSchema: {
        query: z.string(),
        name: z.string().optional(),
        remote: z.enum(['github', 'gitlab', 'bitbucket', 'azure']).optional(),
        limit: z.number().int().positive().max(50).optional().describe('Max matching comments returned (default 10).'),
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
      description: 'Run a CodeAnt AI review on local working-copy changes and return the findings as JSON. Reviews the git repository in the server\'s working directory, so it needs a client that starts the server inside the project. Does not modify files — pair with editor tools to apply fixes. Use this for "review my changes" / "check my staged files" prompts.',
      inputSchema: {
        scope: z
          .enum(['all', 'uncommitted', 'staged-only', 'committed', 'last-commit', 'last-n-commits', 'base-branch', 'base-commit'])
          .optional()
          .describe('Review scope. Default "uncommitted".'),
        lastNCommits: z.number().int().positive().max(5).optional(),
        baseBranch: z.string().optional(),
        baseCommit: z.string().optional(),
        include: z.array(z.string()).optional().describe('Glob patterns to include.'),
        exclude: z.array(z.string()).optional().describe('Glob patterns to exclude.'),
      },
      annotations: READ,
    },
    async (input) => {
      try {
        const result = await runReviewHeadless({
          workspacePath: process.cwd(),
          scanType: input.scope ?? 'uncommitted',
          lastNCommits: input.lastNCommits ?? 1,
          include: input.include ?? [],
          exclude: input.exclude ?? [],
          baseBranch: input.baseBranch ?? null,
          baseCommit: input.baseCommit ?? null,
          onProgress: () => {},
          onFilesReady: () => {},
        });
        return result?.error ? fail(result) : ok(result);
      } catch (err) { return fail(err); }
    }
  );

  // ─── Auth (always registered — login is needed even in read-only mode) ───
  // Sign-in runs in the background so the login URL reaches the user right away,
  // even when no browser can be opened (SSH, containers).
  async function beginLogin() {
    const controller = new AbortController();
    const { token, loginUrl, pollUrl, browserOpened } = await startLoginFlow();
    const attempt = { status: 'pending', loginUrl, browserOpened, controller };
    awaitLoginCompletion({ token, pollUrl, signal: controller.signal })
      .then(() => {
        // A cancelled login (logout or a newer sign-in aborted this one) must not
        // restore its token, even if the in-flight poll had already succeeded.
        if (controller.signal.aborted) {
          attempt.status = 'aborted';
          return;
        }
        attempt.status = 'success';
        attempt.token = token;
        // An explicit CODEANT_API_TOKEN would otherwise keep taking precedence over the new login.
        if (hasEnvToken()) process.env.CODEANT_API_TOKEN = token;
      })
      .catch((err) => {
        attempt.status = controller.signal.aborted ? 'aborted' : 'failed';
        attempt.error = err.message;
      });
    return attempt;
  }

  function pendingLogin(attempt) {
    return {
      status: 'pending',
      loginUrl: attempt.loginUrl,
      browserOpened: attempt.browserOpened,
      message: attempt.browserOpened
        ? 'A browser window opened for CodeAnt sign-in. If it did not appear, open loginUrl. After signing in, call codeant_login again to confirm; sign-in is detected within about 10 seconds.'
        : 'Open loginUrl in a browser to sign in to CodeAnt, then call codeant_login again to confirm; sign-in is detected within about 10 seconds. The link expires in 10 minutes.',
    };
  }

  async function handleLogin({ force }) {
    try {
      if (login && !force) {
        if (login.status === 'pending') return ok(pendingLogin(login));
        const finished = login;
        login = null;
        if (finished.status === 'success') return ok({ status: 'success', token: maskToken(finished.token) });
        return fail(new Error(`${finished.error} Call codeant_login again to start a new sign-in.`));
      }
      if (!force && (hasEnvToken() || isAlreadyLoggedIn())) return ok({ alreadyLoggedIn: true });
      login?.controller.abort();
      login = await beginLogin();
      return ok(pendingLogin(login));
    } catch (err) { return fail(err); }
  }

  server.registerTool(
    'codeant_login',
    {
      title: 'Sign in to CodeAnt AI',
      description: 'Start browser sign-in to CodeAnt AI. Returns immediately with { status: "pending", loginUrl, browserOpened }: show loginUrl to the user (the browser may not open, for example over SSH), then call codeant_login again after they finish to get { status: "success" }. The link expires after 10 minutes. The token is saved to ~/.codeant/config.json (apiKeyV2), which the CodeAnt CLI shares, and later calls use it without a restart. Returns { alreadyLoggedIn: true } if a token is already configured; pass force: true when tools reject that token.',
      inputSchema: {
        force: z.boolean().optional().describe('Start a new sign-in even if a token is already configured, for example when tools reject it as invalid. Default false.'),
      },
      annotations: { ...WRITE_NON_DESTRUCTIVE, idempotentHint: true },
    },
    ({ force }) => {
      const run = loginQueue.then(() => handleLogin({ force }));
      loginQueue = run.catch(() => {});
      return run;
    }
  );

  server.registerTool(
    'codeant_logout',
    {
      title: 'Sign out of CodeAnt AI',
      description: 'Revoke the API token on the server, clear it from ~/.codeant/config.json (which also signs out the CodeAnt CLI), unset CODEANT_API_TOKEN on the running MCP process, and cancel a pending codeant_login. Returns { wasLoggedIn: false } immediately if no token was configured.',
      inputSchema: {},
      annotations: { ...WRITE_NON_DESTRUCTIVE, idempotentHint: true },
    },
    async () => {
      try {
        login?.controller.abort();
        login = null;
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
        description: 'Trigger a new scan run for a repository. WRITE OPERATION — only enabled when CODEANT_READ_ONLY=0.',
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
        try {
          const text = await captureStdout(() => runStartScan(input));
          return textResult(text || '{}');
        } catch (err) { return fail(err); }
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
  }

  return server;
}

export async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
