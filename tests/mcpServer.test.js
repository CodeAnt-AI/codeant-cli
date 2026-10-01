import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { buildResultsEnvelope, runStartScan, runOrgs, runBranchesAll, runBranchesDefault } = vi.hoisted(() => ({
  buildResultsEnvelope: vi.fn(),
  runStartScan: vi.fn(),
  runOrgs: vi.fn(),
  runBranchesAll: vi.fn(),
  runBranchesDefault: vi.fn(),
}));

vi.mock('../src/commands/scans/results.js', () => ({ buildResultsEnvelope }));
vi.mock('../src/commands/scans/start-scan.js', () => ({ runStartScan }));
vi.mock('../src/commands/scans/orgs.js', () => ({ runOrgs }));
vi.mock('../src/commands/settings/branches.js', () => ({ runBranchesAll, runBranchesDefault }));

const { createMcpServer } = await import('../src/mcp/server.js');

const manifest = JSON.parse(readFileSync(new URL('../mcpb/manifest.json', import.meta.url), 'utf8'));
const AUTH_TOOLS = new Set(['codeant_login', 'codeant_logout']);

async function connect(readOnly) {
  process.env.CODEANT_READ_ONLY = readOnly ? '1' : '0';
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function parse(result) {
  return JSON.parse(result.content[0].text);
}

describe('MCP server', () => {
  const prevReadOnly = process.env.CODEANT_READ_ONLY;

  beforeEach(() => {
    buildResultsEnvelope.mockReset();
    runStartScan.mockReset();
    runOrgs.mockReset();
  });

  afterEach(() => {
    if (prevReadOnly === undefined) delete process.env.CODEANT_READ_ONLY;
    else process.env.CODEANT_READ_ONLY = prevReadOnly;
  });

  it('registers exactly the tools listed in the MCPB manifest when writes are enabled', async () => {
    const client = await connect(false);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(manifest.tools.map((t) => t.name).sort());
  });

  it('hides every write tool in read-only mode', async () => {
    const client = await connect(true);
    const { tools } = await client.listTools();
    const writable = tools.filter((t) => !AUTH_TOOLS.has(t.name) && !t.annotations?.readOnlyHint);
    expect(writable.map((t) => t.name)).toEqual([]);
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining([
      'codeant_secrets_local',
      'codeant_analysis_settings_get',
      'codeant_recurring_scans_list',
      'codeant_branches_list',
      'codeant_cve_reporting_list',
    ]));
  });

  it('serves concurrent scan results without touching process.stdout', async () => {
    const originalWrite = process.stdout.write;
    let stdoutPatched = false;
    buildResultsEnvelope.mockImplementation(async ({ repo }) => {
      await new Promise((r) => setTimeout(r, 20));
      if (process.stdout.write !== originalWrite) stdoutPatched = true;
      return { repo, findings: [] };
    });
    runOrgs.mockResolvedValue({ connections: [], email: 'dev@example.com' });

    const client = await connect(true);
    const [a, b, orgs] = await Promise.all([
      client.callTool({ name: 'codeant_scans_results', arguments: { repo: 'acme/a' } }),
      client.callTool({ name: 'codeant_scans_results', arguments: { repo: 'acme/b' } }),
      client.callTool({ name: 'codeant_scans_orgs', arguments: {} }),
    ]);

    expect(parse(a).repo).toBe('acme/a');
    expect(parse(b).repo).toBe('acme/b');
    expect(parse(orgs).email).toBe('dev@example.com');
    expect(stdoutPatched).toBe(false);
    expect(process.stdout.write).toBe(originalWrite);
  });

  it('filters and caps the branch list', async () => {
    runBranchesDefault.mockResolvedValue({ branch: 'main' });
    runBranchesAll.mockResolvedValue({ branches: ['main', 'feat/Scan-a', 'feat/scan-b', 'fix/other', 'feat/scan-c'] });

    const client = await connect(true);
    const result = await client.callTool({ name: 'codeant_branches_list', arguments: { repo: 'acme/a', search: 'SCAN', limit: 2 } });

    expect(parse(result)).toEqual({
      repo: 'acme/a',
      default: 'main',
      total: 3,
      truncated: true,
      branches: ['feat/Scan-a', 'feat/scan-b'],
    });
  });

  it('returns structured start-scan results', async () => {
    runStartScan.mockResolvedValue({ repo: 'acme/a', branch: 'main', commit: 'abc123', message: 'Analysis started' });

    const client = await connect(false);
    const result = await client.callTool({ name: 'codeant_scans_start', arguments: { repo: 'acme/a', branch: 'main', commit: 'abc123' } });

    expect(result.isError).toBeFalsy();
    expect(parse(result)).toEqual({ repo: 'acme/a', branch: 'main', commit: 'abc123', message: 'Analysis started' });
  });
});
