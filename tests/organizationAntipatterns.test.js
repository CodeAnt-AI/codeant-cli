import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveCliTenant, runRepos, fetchAppApi } = vi.hoisted(() => ({
  resolveCliTenant: vi.fn(),
  runRepos: vi.fn(),
  fetchAppApi: vi.fn(),
}));

vi.mock('../src/api/tenant.js', () => ({ resolveCliTenant }));
vi.mock('../src/commands/scans/repos.js', () => ({ runRepos }));
vi.mock('../src/utils/fetchApi.js', () => ({ fetchAppApi }));

const { runOrganizationAntipatterns, splitRepos } = await import('../src/findings/antipatterns.js');

const tenant = {
  organization: 'CodeAnt-AI',
  service: 'github',
  providerBaseUrl: 'https://github.com',
  requestBody: { org: 'CodeAnt-AI', organization: 'CodeAnt-AI', service: 'github', github_base_url: 'https://github.com' },
};

describe('organization anti-pattern findings', () => {
  beforeEach(() => {
    resolveCliTenant.mockReset();
    runRepos.mockReset();
    fetchAppApi.mockReset();
    resolveCliTenant.mockResolvedValue(tenant);
    fetchAppApi.mockResolvedValue({ antipatterns: [], total_issues: 0 });
  });

  it('accepts comma-separated or repeated repository values', () => {
    expect(splitRepos(['CodeAnt-AI/a,CodeAnt-AI/b', 'CodeAnt-AI/c']))
      .toEqual(['CodeAnt-AI/a', 'CodeAnt-AI/b', 'CodeAnt-AI/c']);
  });

  it('discovers every organization repository when none are supplied', async () => {
    runRepos.mockResolvedValue({ repos: [{ full_name: 'CodeAnt-AI/a' }, { full_name: 'CodeAnt-AI/b' }] });

    await runOrganizationAntipatterns({ org: 'CodeAnt-AI', service: 'github' });

    expect(runRepos).toHaveBeenCalledWith({ org: 'CodeAnt-AI' });
    expect(fetchAppApi).toHaveBeenCalledWith('/explorer/quality/antipatterns', 'POST', expect.objectContaining({
      repos: ['CodeAnt-AI/a', 'CodeAnt-AI/b'],
      org: 'CodeAnt-AI',
    }), tenant);
  });

  it('uses explicitly selected repositories without discovery', async () => {
    await runOrganizationAntipatterns({ repos: 'CodeAnt-AI/a,CodeAnt-AI/b' });
    expect(runRepos).not.toHaveBeenCalled();
    expect(fetchAppApi).toHaveBeenCalledWith(expect.any(String), 'POST', expect.objectContaining({
      repos: ['CodeAnt-AI/a', 'CodeAnt-AI/b'],
    }), tenant);
  });
});
