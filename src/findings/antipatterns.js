import { resolveCliTenant } from '../api/tenant.js';
import { runRepos } from '../commands/scans/repos.js';
import { fetchAppApi } from '../utils/fetchApi.js';

function splitRepos(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function runOrganizationAntipatterns(options = {}) {
  const tenant = await resolveCliTenant(options);
  let repos = splitRepos(options.repos);
  if (repos.length === 0) {
    const result = await runRepos({ org: tenant.organization });
    repos = (result.repos || []).map((repo) => repo.full_name || repo.name).filter(Boolean);
  }
  if (repos.length === 0) throw new Error('No repositories are available for this organization.');

  const result = await fetchAppApi(
    '/explorer/quality/antipatterns',
    'POST',
    { ...tenant.requestBody, org: tenant.organization, repos },
    tenant,
  );
  return { tenant: tenant.requestBody, ...result };
}

export { splitRepos };
