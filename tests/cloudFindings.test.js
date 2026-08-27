import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveCliTenant, fetchAppApi } = vi.hoisted(() => ({
  resolveCliTenant: vi.fn(),
  fetchAppApi: vi.fn(),
}));

vi.mock('../src/api/tenant.js', () => ({ resolveCliTenant }));
vi.mock('../src/utils/fetchApi.js', () => ({ fetchAppApi }));

const { runCloudFindingGet, runCloudFindings, runCloudHistory } = await import('../src/findings/cloud.js');

const tenant = {
  organization: 'CodeAnt-AI',
  service: 'github',
  providerBaseUrl: 'https://github.com',
  requestBody: { org: 'CodeAnt-AI', organization: 'CodeAnt-AI', service: 'github', github_base_url: 'https://github.com' },
};

describe('cloud findings client', () => {
  beforeEach(() => {
    resolveCliTenant.mockReset();
    fetchAppApi.mockReset();
    resolveCliTenant.mockResolvedValue(tenant);
    fetchAppApi.mockResolvedValue({ scans: [], findings: [] });
  });

  it('loads all provider histories with one resolved authenticated tenant', async () => {
    const result = await runCloudHistory({ provider: 'all' });

    expect(resolveCliTenant).toHaveBeenCalledTimes(1);
    expect(fetchAppApi).toHaveBeenCalledTimes(3);
    expect(fetchAppApi).toHaveBeenCalledWith('/cloud/aws/scan/history', 'POST', expect.objectContaining({
      username: 'CodeAnt-AI',
      github_base_url: 'https://github.com',
    }), tenant);
    expect(Object.keys(result.providers)).toEqual(['aws', 'azure', 'gcp']);
  });

  it('keeps other provider histories when one provider is unavailable', async () => {
    fetchAppApi
      .mockResolvedValueOnce({ scans: [{ scan_id: 'aws-1' }] })
      .mockRejectedValueOnce(new Error('Azure unavailable'))
      .mockResolvedValueOnce({ scans: [{ scan_id: 'gcp-1' }] });

    const result = await runCloudHistory({ provider: 'all', kind: 'container' });
    expect(result.providers.aws.scans).toEqual([{ scan_id: 'aws-1' }]);
    expect(result.providers.azure.error).toBe('Azure unavailable');
    expect(result.providers.gcp.scans).toEqual([{ scan_id: 'gcp-1' }]);
  });

  it('passes Azure scope and UI-compatible finding filters', async () => {
    await runCloudFindings({
      provider: 'azure',
      scanId: 'scan-1',
      tenantId: 'tenant-1',
      cloudService: 'compute',
      severity: 'high',
      status: 'FAIL',
      framework: 'cis',
      subscriptionId: 'sub-1',
      minDaysUnused: 30,
    });

    expect(fetchAppApi).toHaveBeenCalledWith('/cloud/azure/scan/findings', 'POST', expect.objectContaining({
      scan_id: 'scan-1',
      tenant_id: 'tenant-1',
      azure_service: 'compute',
      severity: 'high',
      status: 'FAIL',
      framework: 'cis',
      subscription_id: 'sub-1',
      min_days_unused: 30,
    }), tenant);
  });

  it('requires provider-specific scope and fetches detail by UID', async () => {
    await expect(runCloudFindings({ provider: 'gcp', scanId: 'scan-1' }))
      .rejects.toThrow(/--project-id/);

    await runCloudFindingGet({ provider: 'aws', scanId: 'scan-2', uid: 'finding-1', cloudService: 'iam' });
    expect(fetchAppApi).toHaveBeenLastCalledWith('/cloud/aws/scan/finding_detail', 'POST', expect.objectContaining({
      scan_id: 'scan-2',
      uid: 'finding-1',
      aws_service: 'iam',
    }), tenant);
  });

  it('uses the VM and container result endpoints without CSPM account fields', async () => {
    await runCloudFindings({ provider: 'gcp', kind: 'vm', scanId: 'vm-scan' });
    expect(fetchAppApi).toHaveBeenNthCalledWith(1, '/cloud/gcp/vm-scanning/results', 'POST', expect.objectContaining({
      scan_id: 'vm-scan',
    }), tenant);
    expect(fetchAppApi.mock.calls[0][2]).not.toHaveProperty('project_id');

    await runCloudFindingGet({ provider: 'azure', kind: 'container', scanId: 'container-scan', uid: 'CVE-1' });
    expect(fetchAppApi).toHaveBeenNthCalledWith(2, '/cloud/azure/container-scanning/finding_detail', 'POST', expect.objectContaining({
      scan_id: 'container-scan',
      uid: 'CVE-1',
    }), tenant);
  });
});
