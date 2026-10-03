import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const mocks = vi.hoisted(() => ({
  store: {},
  open: vi.fn(),
  resolveScan: vi.fn(),
  fetchSastResults: vi.fn(),
  listRepos: vi.fn(),
  runReviewHeadless: vi.fn(),
  runHotlistList: vi.fn(),
  runHotlistGet: vi.fn(),
  runOrganizationAntipatterns: vi.fn(),
  runCloudHistory: vi.fn(),
  runCloudFindings: vi.fn(),
  runCloudFindingGet: vi.fn(),
  runPentestHistory: vi.fn(),
  runPentestIssues: vi.fn(),
  runPentestReport: vi.fn(),
}));

vi.mock('open', () => ({ default: mocks.open }));
vi.mock('../../src/utils/config.js', () => ({
  loadConfig: () => mocks.store,
  saveConfig: () => {},
  getConfigValue: (key) => mocks.store[key],
  setConfigValue: (key, value) => { mocks.store[key] = value; },
  CONFIG_FILE: '/tmp/codeant-test-config.json',
}));
vi.mock('../../src/utils/baseUrl.js', () => ({
  getBaseUrl: () => 'https://api.codeant.test',
  getDashboardUrl: async () => 'https://app.codeant.test',
}));
vi.mock('../../src/commands/scans/lib/resolveScan.js', () => ({ resolveScan: mocks.resolveScan }));
vi.mock('../../src/scans/fetchScanResults.js', () => ({
  fetchSastResults: mocks.fetchSastResults,
  fetchAntiPatternsResults: vi.fn(),
  fetchDocstringResults: vi.fn(),
  fetchComplexFunctionsResults: vi.fn(),
}));
vi.mock('../../src/scans/fetchAdvancedScanResults.js', () => ({
  fetchScaResults: vi.fn(),
  fetchSbomResults: vi.fn(),
  fetchSecretsResults: vi.fn(),
  fetchIacResults: vi.fn(),
  fetchDeadCodeResults: vi.fn(),
  fetchDuplicateCodeResults: vi.fn(),
}));
vi.mock('../../src/scans/listRepos.js', () => ({ listRepos: mocks.listRepos }));
vi.mock('../../src/reviewHeadless.js', () => ({ runReviewHeadless: mocks.runReviewHeadless }));
vi.mock('../../src/hotlist/client.js', () => ({
  runHotlistList: mocks.runHotlistList,
  runHotlistGet: mocks.runHotlistGet,
}));
vi.mock('../../src/findings/antipatterns.js', () => ({
  runOrganizationAntipatterns: mocks.runOrganizationAntipatterns,
}));
vi.mock('../../src/findings/cloud.js', () => ({
  runCloudHistory: mocks.runCloudHistory,
  runCloudFindings: mocks.runCloudFindings,
  runCloudFindingGet: mocks.runCloudFindingGet,
}));
vi.mock('../../src/findings/pentest.js', () => ({
  runPentestHistory: mocks.runPentestHistory,
  runPentestIssues: mocks.runPentestIssues,
  runPentestReport: mocks.runPentestReport,
}));

const { createMcpServer } = await import('../../src/mcp/server.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});
const parse = (result) => JSON.parse(result.content[0].text);
const call = (client, name, args = {}) => client.callTool({ name, arguments: args });

const READ_TOOLS = [
  'codeant_api_get',
  'codeant_cloud_finding_get',
  'codeant_cloud_findings_list',
  'codeant_cloud_scan_history',
  'codeant_comments_search',
  'codeant_findings_antipatterns',
  'codeant_hotlist_get',
  'codeant_hotlist_list',
  'codeant_login',
  'codeant_logout',
  'codeant_pentest_history',
  'codeant_pentest_issues',
  'codeant_pentest_report',
  'codeant_pr_comments',
  'codeant_pr_get',
  'codeant_pr_list',
  'codeant_review_local',
  'codeant_scans_dismissed',
  'codeant_scans_get',
  'codeant_scans_history',
  'codeant_scans_orgs',
  'codeant_scans_overrides',
  'codeant_scans_repos',
  'codeant_scans_results',
];
const WRITE_TOOLS = ['codeant_api_request', 'codeant_pr_resolve', 'codeant_scans_start'];

let fetchCalls;
let fetchRoutes;
let clients;

async function connect() {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'codeant-test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  clients.push(client);
  return client;
}

function routeFetch(pathFragment, handler) {
  fetchRoutes.push([pathFragment, handler]);
}

function sastIssue(repo) {
  return { file_path: `${repo}/src/app.js`, line_number: 3, check_id: 'sql-injection', severity: 'HIGH', message: 'SQL injection' };
}

beforeEach(() => {
  for (const key of Object.keys(mocks.store)) delete mocks.store[key];
  for (const mock of Object.values(mocks)) if (typeof mock?.mockReset === 'function') mock.mockReset();
  delete process.env.CODEANT_API_TOKEN;
  delete process.env.CODEANT_READ_ONLY;
  delete process.env.CODEANT_MCP_MAX_RESULT_CHARS;
  process.env.CODEANT_TELEMETRY_DISABLED = '1';
  clients = [];
  fetchCalls = [];
  fetchRoutes = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    fetchCalls.push({ url: String(url), authorization: options.headers?.Authorization });
    const route = fetchRoutes.find(([fragment]) => String(url).includes(fragment));
    return route ? route[1](url, options) : json({ status: 'error', message: `unrouted ${url}` }, 404);
  }));
  routeFetch('/extension/scans2/validate', () => json({
    status: 'success',
    data: { email: 'dev@acme.test', orgs: [{ organization_name: 'acme', base_url: 'https://github.com', service: 'github' }] },
  }));
});

afterEach(async () => {
  await Promise.all(clients.map((client) => client.close()));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MCP server registration', () => {
  it('registers the read-only tools by default and adds write tools only when CODEANT_READ_ONLY=0', async () => {
    const readOnly = await connect();
    const { tools } = await readOnly.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(READ_TOOLS);

    process.env.CODEANT_READ_ONLY = '0';
    const writable = await connect();
    const { tools: allTools } = await writable.listTools();
    expect(allTools.map((tool) => tool.name).sort()).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
  });

  it('keeps the MCPB manifest tool list in sync with the registered tools', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../mcpb/manifest.json', import.meta.url), 'utf8'));
    expect(manifest.tools.map((tool) => tool.name).sort()).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
  });

  it('gives agents server instructions for discovery, pagination, and auth recovery', async () => {
    const client = await connect();
    const instructions = client.getInstructions();
    expect(instructions).toContain('codeant_scans_orgs');
    expect(instructions).toContain('codeant_login');
    expect(instructions).toMatch(/limit/);
  });
});

describe('codeant_scans_results concurrency', () => {
  it('answers parallel calls with their own results and never writes to stdout', async () => {
    mocks.resolveScan.mockImplementation(async ({ repo }) => ({
      commit_id: `sha-${repo}`, branch: 'main', timestamp: '2026-10-01T00:00:00Z', status: 'done', resolved_by: 'latest',
    }));
    mocks.fetchSastResults.mockImplementation(async (repo) => {
      await sleep(repo === 'acme/slow' ? 60 : 10);
      return { success: true, issues: [sastIssue(repo)] };
    });
    const client = await connect();
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // The call that starts first finishes first: the order that broke the old stdout capture.
    const [fast, slow, orgs] = await Promise.all([
      call(client, 'codeant_scans_results', { repo: 'acme/fast', types: 'sast' }),
      call(client, 'codeant_scans_results', { repo: 'acme/slow', types: 'sast' }),
      call(client, 'codeant_scans_orgs'),
    ]);
    write.mockRestore();

    expect(write).not.toHaveBeenCalled();
    expect(parse(slow)).toMatchObject({ repo: 'acme/slow', findings: [{ file_path: 'acme/slow/src/app.js' }] });
    expect(parse(fast)).toMatchObject({ repo: 'acme/fast', findings: [{ file_path: 'acme/fast/src/app.js' }] });
    expect(parse(orgs).connections[0].organizationName).toBe('acme');
  });
});

describe('authentication', () => {
  it('reads the saved token on every call instead of pinning the startup token', async () => {
    mocks.store.apiKeyV2 = 'token-A';
    const client = await connect();
    await call(client, 'codeant_scans_orgs');
    mocks.store.apiKeyV2 = 'token-B';
    await call(client, 'codeant_scans_orgs');

    const validateCalls = fetchCalls.filter((entry) => entry.url.includes('/extension/scans2/validate'));
    expect(validateCalls.map((entry) => entry.authorization)).toEqual(['Bearer token-A', 'Bearer token-B']);
  });

  it('returns the login URL immediately and survives a browser that cannot be opened', async () => {
    mocks.open.mockImplementation(async () => {
      const child = new EventEmitter();
      setImmediate(() => child.emit('error', Object.assign(new Error('spawn open ENOENT'), { code: 'ENOENT' })));
      return child;
    });
    routeFetch('/extension/login/status', () => json({ status: 'no' }));
    routeFetch('/extension/logout', () => json({ status: 'logged_out' }));
    const client = await connect();

    const started = Date.now();
    const result = await call(client, 'codeant_login');
    expect(Date.now() - started).toBeLessThan(3000);
    expect(parse(result)).toMatchObject({ status: 'pending', browserOpened: false });
    expect(parse(result).loginUrl).toMatch(/^https:\/\/app\.codeant\.test\?ideLoginToken=cli___/);

    await sleep(20);
    expect(parse(await call(client, 'codeant_login'))).toMatchObject({ status: 'pending' });
    expect((await client.listTools()).tools.length).toBe(READ_TOOLS.length);
    await call(client, 'codeant_logout');
  }, 10_000);

  it('shares one sign-in between concurrent codeant_login calls', async () => {
    mocks.open.mockImplementation(async () => {
      const child = new EventEmitter();
      setImmediate(() => child.emit('spawn'));
      return child;
    });
    routeFetch('/extension/login/status', () => json({ status: 'no' }));
    routeFetch('/extension/logout', () => json({ status: 'logged_out' }));
    const client = await connect();

    const [first, second] = await Promise.all([call(client, 'codeant_login'), call(client, 'codeant_login')]);
    expect(parse(first).loginUrl).toBe(parse(second).loginUrl);
    expect(mocks.open).toHaveBeenCalledTimes(1);
    await call(client, 'codeant_logout');
  }, 10_000);

  it('reports a completed sign-in once, then reports that the user is logged in', async () => {
    mocks.open.mockImplementation(async () => {
      const child = new EventEmitter();
      setImmediate(() => child.emit('spawn'));
      return child;
    });
    routeFetch('/extension/login/status', () => json({ status: 'yes' }));
    const client = await connect();

    expect(parse(await call(client, 'codeant_login'))).toMatchObject({ status: 'pending', browserOpened: true });
    await sleep(50);
    expect(mocks.store.apiKeyV2).toMatch(/^cli___/);
    expect(process.env.CODEANT_API_TOKEN).toBeUndefined();
    expect(parse(await call(client, 'codeant_login'))).toMatchObject({ status: 'success' });
    expect(parse(await call(client, 'codeant_login'))).toEqual({ alreadyLoggedIn: true });
  }, 10_000);
});

describe('codeant_review_local', () => {
  it('flags a failed review as an error instead of an empty issue list', async () => {
    mocks.runReviewHeadless.mockResolvedValue({ issues: [], meta: null, error: 'Could not find a .git directory.', noFiles: false });
    const client = await connect();
    const result = await call(client, 'codeant_review_local');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Could not find a .git directory.');
  });
});

describe('response size', () => {
  it('returns slim, paged repository records by default', async () => {
    const raw = (name, pushed) => ({
      id: 1, node_id: 'x', name, full_name: `acme/${name}`, private: true, visibility: 'private',
      default_branch: 'main', language: 'JavaScript', description: null, archived: false, pushed_at: pushed,
      owner: { login: 'acme' }, permissions: { admin: true }, hooks_url: 'https://api.github.com/x', topics: [],
    });
    mocks.listRepos.mockResolvedValue({ success: true, repos: [raw('api', '2026-10-03'), raw('web', '2026-10-02'), raw('cli', '2026-10-01')] });
    const client = await connect();

    const page = parse(await call(client, 'codeant_scans_repos', { org: 'acme', limit: 2 }));
    expect(page).toMatchObject({ org: 'acme', total: 3, offset: 0, limit: 2, next_offset: 2 });
    expect(page.repos.map((repo) => repo.full_name)).toEqual(['acme/api', 'acme/web']);
    expect(Object.keys(page.repos[0]).sort()).toEqual(
      ['archived', 'default_branch', 'description', 'full_name', 'language', 'name', 'private', 'pushed_at', 'visibility'],
    );

    const search = parse(await call(client, 'codeant_scans_repos', { org: 'acme', search: 'CLI' }));
    expect(search.repos.map((repo) => repo.full_name)).toEqual(['acme/cli']);

    const full = parse(await call(client, 'codeant_scans_repos', { org: 'acme', full: true }));
    expect(full.repos[0]).toHaveProperty('owner');
  });

  it('pages pentest history and drops credit details unless full is requested', async () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      id: `pt-${i}`, status: 'completed', findings: { high: 1 },
      credit_unlock: { applied_by_email: 'someone@example.com' },
    }));
    mocks.runPentestHistory.mockResolvedValue({ tenant: {}, status: 'success', history });
    const client = await connect();

    const page = parse(await call(client, 'codeant_pentest_history'));
    expect(page).toMatchObject({ total: 30, offset: 0, limit: 25, next_offset: 25 });
    expect(page.history).toHaveLength(25);
    expect(page.history[0]).not.toHaveProperty('credit_unlock');
    expect(parse(await call(client, 'codeant_pentest_history', { offset: 25, full: true })).history[0])
      .toHaveProperty('credit_unlock');
  });

  it('drops per-service rollups from cloud scan history and keeps the newest scans per provider', async () => {
    const scans = Array.from({ length: 12 }, (_, i) => ({
      scan_id: `s-${i}`, status: 'completed', severity_rollup: { high: i },
      per_service: { ec2: {} }, service_rollup: { ec2: {} }, compliance_rollup: { cis: {} }, regions: ['us-east-1'],
    }));
    mocks.runCloudHistory.mockResolvedValue({ tenant: {}, providers: { aws: { provider: 'aws', kind: 'cspm', scans, total: 12 } } });
    const client = await connect();

    const result = parse(await call(client, 'codeant_cloud_scan_history', { provider: 'all' }));
    expect(result.providers.aws.scans).toHaveLength(10);
    expect(result.providers.aws).toMatchObject({ total: 12, offset: 0, limit: 10, next_offset: 10 });
    expect(Object.keys(result.providers.aws.scans[0]).sort()).toEqual(['scan_id', 'severity_rollup', 'status']);

    const rest = parse(await call(client, 'codeant_cloud_scan_history', { provider: 'all', offset: 10 }));
    expect(rest.providers.aws.scans.map((scan) => scan.scan_id)).toEqual(['s-10', 's-11']);
    expect(rest.providers.aws.next_offset).toBeNull();
  });

  it('pages CSPM findings in the MCP layer and drops compliance mappings by default', async () => {
    const findings = Array.from({ length: 60 }, (_, i) => ({ uid: `u-${i}`, status: 'FAIL', severity: 'High', compliance: ['cis-1.1'] }));
    mocks.runCloudFindings.mockResolvedValue({ tenant: {}, provider: 'aws', kind: 'cspm', findings, total: 60 });
    const client = await connect();

    const page = parse(await call(client, 'codeant_cloud_findings_list', { provider: 'aws', scanId: 'scan-1' }));
    expect(page).toMatchObject({ total: 60, offset: 0, limit: 25, next_offset: 25 });
    expect(page.findings).toHaveLength(25);
    expect(page.findings[0]).not.toHaveProperty('compliance');
  });

  it('uses small default page sizes for Hotlist, anti-pattern, and repository findings', async () => {
    mocks.runHotlistList.mockResolvedValue({ items: [] });
    mocks.runOrganizationAntipatterns.mockResolvedValue({ antipatterns: [], total: 0 });
    mocks.resolveScan.mockResolvedValue({ commit_id: 'sha', branch: 'main', timestamp: null, status: 'done', resolved_by: 'latest' });
    mocks.fetchSastResults.mockResolvedValue({ success: true, issues: [] });
    const client = await connect();

    await call(client, 'codeant_hotlist_list');
    await call(client, 'codeant_findings_antipatterns');
    const results = parse(await call(client, 'codeant_scans_results', { repo: 'acme/api', types: 'sast' }));

    expect(mocks.runHotlistList).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
    expect(mocks.runOrganizationAntipatterns).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
    expect(results.pagination.limit).toBe(50);
  });

  it('refuses oversized results with a hint instead of flooding the client', async () => {
    mocks.runPentestReport.mockResolvedValue({ report: 'x'.repeat(100_000) });
    const client = await connect();

    const result = await call(client, 'codeant_pentest_report', { reportId: 'pt-1' });
    expect(result.isError).toBe(true);
    expect(parse(result).error).toMatch(/too large/i);
    expect(parse(result).hint).toMatch(/CODEANT_MCP_MAX_RESULT_CHARS/);
  });
});

describe('SCM errors', () => {
  it('tells Azure DevOps users which setting provides the organization URL', async () => {
    process.env.AZURE_DEVOPS_TOKEN = 'token';
    delete process.env.AZURE_DEVOPS_ORG_URL;
    const client = await connect();
    const result = await call(client, 'codeant_pr_list', { name: 'project/repo', remote: 'azure' });
    delete process.env.AZURE_DEVOPS_TOKEN;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('AZURE_DEVOPS_ORG_URL');
    expect(result.content[0].text).not.toContain('set-azure-org');
  });
});
