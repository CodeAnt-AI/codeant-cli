import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { fetchApi } = vi.hoisted(() => ({ fetchApi: vi.fn() }));
vi.mock('../src/utils/fetchApi.js', () => ({ fetchApi, fetchApiResponse: fetchApi, fetchAppApi: fetchApi }));

const { runSecretsHeadless } = await import('../src/secretsHeadless.js');

const FAKE_KEY = ['AKIA', 'Z7Q3RT5LMXW2KPDN'].join('');

describe('runSecretsHeadless', () => {
  let repo;

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'codeant-secrets-headless-'));
    const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.email', 'dev@example.com');
    git('config', 'user.name', 'Dev');
    writeFileSync(join(repo, 'README.md'), '# repo\n');
    git('add', '.');
    git('commit', '-qm', 'init');
    writeFileSync(join(repo, 'config.js'), `export const awsKey = '${FAKE_KEY}';\n`);
    git('add', 'config.js');
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it('finds staged secrets locally, masks them, and makes no API calls', async () => {
    const result = await runSecretsHeadless({ workspacePath: repo, scanType: 'staged-only' });

    expect(fetchApi).not.toHaveBeenCalled();
    expect(result.noFiles).toBe(false);
    expect(result.total).toBeGreaterThan(0);
    expect(result.findings[0].file_path).toBe('config.js');
    expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
  });

  it('reports noFiles when nothing matches the include filter', async () => {
    const result = await runSecretsHeadless({ workspacePath: repo, scanType: 'staged-only', include: ['*.py'] });

    expect(result).toMatchObject({ findings: [], total: 0 });
  });
});
