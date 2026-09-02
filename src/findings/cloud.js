import { resolveCliTenant } from '../api/tenant.js';
import { fetchAppApi } from '../utils/fetchApi.js';

const PROVIDERS = new Set(['aws', 'azure', 'gcp']);
const KINDS = new Set(['cspm', 'vm', 'container']);

function normalizeProvider(value, { allowAll = false } = {}) {
  const provider = String(value || '').trim().toLowerCase();
  if (allowAll && (!provider || provider === 'all')) return 'all';
  if (!PROVIDERS.has(provider)) {
    throw new Error(`--provider must be one of: ${[...PROVIDERS].join(', ')}.`);
  }
  return provider;
}

function requireValue(value, option) {
  if (!String(value || '').trim()) throw new Error(`${option} is required.`);
  return String(value).trim();
}

function normalizeKind(value) {
  const kind = String(value || 'cspm').trim().toLowerCase();
  if (!KINDS.has(kind)) throw new Error(`--kind must be one of: ${[...KINDS].join(', ')}.`);
  return kind;
}

function endpoint(provider, kind, action) {
  if (kind === 'vm') return `/cloud/${provider}/vm-scanning/${action}`;
  if (kind === 'container') return `/cloud/${provider}/container-scanning/${action}`;
  return `/cloud/${provider}/scan/${action}`;
}

function providerScope(provider, options = {}) {
  if (provider === 'azure') {
    return { tenant_id: requireValue(options.tenantId, '--tenant-id for Azure findings') };
  }
  if (provider === 'gcp') {
    return { project_id: requireValue(options.projectId, '--project-id for GCP findings') };
  }
  return options.accountId ? { account_id: options.accountId } : {};
}

function optionalFilters(provider, options = {}) {
  const filters = {};
  const service = options.cloudService;
  if (service) filters[`${provider}_service`] = service;
  if (options.severity) filters.severity = options.severity;
  if (options.status) filters.status = options.status;
  if (options.framework) filters.framework = options.framework;
  if (options.minDaysUnused !== undefined) filters.min_days_unused = options.minDaysUnused;
  if (provider === 'aws' && options.exploitAttemptedOnly) filters.exploit_attempted_only = true;
  if (provider === 'azure' && options.subscriptionId) filters.subscription_id = options.subscriptionId;
  return filters;
}

async function request(provider, kind, action, options = {}, extra = {}, resolvedTenant = null) {
  const tenant = resolvedTenant || await resolveCliTenant(options);
  const data = await fetchAppApi(
    endpoint(provider, kind, action),
    'POST',
    {
      ...tenant.requestBody,
      username: tenant.organization,
      ...extra,
    },
    tenant,
  );
  return { tenant: tenant.requestBody, provider, kind, ...data };
}

export async function runCloudHistory(options = {}) {
  const provider = normalizeProvider(options.provider, { allowAll: true });
  const kind = normalizeKind(options.kind);
  if (options.latest && kind !== 'cspm') {
    throw new Error('--latest is supported only for --kind cspm; VM and container history already returns scan records.');
  }
  const action = options.latest ? 'latest' : 'history';
  const providers = provider === 'all' ? [...PROVIDERS] : [provider];
  const tenant = await resolveCliTenant(options);
  if (provider !== 'all') return request(provider, kind, action, options, {}, tenant);
  const settled = await Promise.allSettled(
    providers.map((item) => request(item, kind, action, options, {}, tenant)),
  );
  const results = settled.map((result, index) => (
    result.status === 'fulfilled'
      ? result.value
      : { provider: providers[index], kind, error: result.reason?.message || String(result.reason) }
  ));
  return {
    tenant: tenant.requestBody,
    providers: Object.fromEntries(results.map((result) => [result.provider, result])),
  };
}

export async function runCloudFindings(options = {}) {
  const provider = normalizeProvider(options.provider);
  const kind = normalizeKind(options.kind);
  const scanId = requireValue(options.scanId, '--scan-id');
  return request(provider, kind, kind === 'cspm' ? 'findings' : 'results', options, {
    scan_id: scanId,
    ...(kind === 'cspm' ? providerScope(provider, options) : {}),
    ...(kind === 'cspm' ? optionalFilters(provider, options) : {}),
  });
}

export async function runCloudFindingGet(options = {}) {
  const provider = normalizeProvider(options.provider);
  const kind = normalizeKind(options.kind);
  const scanId = requireValue(options.scanId, '--scan-id');
  const uid = requireValue(options.uid, '--uid');
  return request(provider, kind, 'finding_detail', options, {
    scan_id: scanId,
    uid,
    ...(kind === 'cspm' ? providerScope(provider, options) : {}),
    ...(kind === 'cspm' && options.cloudService ? { [`${provider}_service`]: options.cloudService } : {}),
  });
}

export { normalizeKind, normalizeProvider };
