import { setTimeout as sleep } from 'node:timers/promises';

import { resolveCliTenant } from '../api/tenant.js';
import { fetchAppApi } from '../utils/fetchApi.js';
import { fetchPaginated } from './paginate.js';

const PROVIDERS = new Set(['aws', 'azure', 'gcp']);
const KINDS = new Set(['cspm', 'vm', 'container']);
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'unknown'];
const POLL_INTERVAL_MS = 15_000;

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

async function request(provider, kind, action, options = {}, extra = {}, resolvedTenant = null, pageKey = null) {
  const tenant = resolvedTenant || await resolveCliTenant(options);
  const path = endpoint(provider, kind, action);
  const body = { ...tenant.requestBody, username: tenant.organization, ...extra };
  const data = pageKey
    ? await fetchPaginated(path, body, tenant, pageKey, options)
    : await fetchAppApi(path, 'POST', body, tenant);
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
  // VM/container scans can exceed the API's 1 MB response cap, so they are paged.
  if (kind !== 'cspm') {
    return request(provider, kind, 'results/paginated', options, { scan_id: scanId }, null, 'findings');
  }
  return request(provider, kind, 'findings', options, {
    scan_id: scanId,
    ...providerScope(provider, options),
    ...optionalFilters(provider, options),
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

function scanSummary(scan, failOn) {
  const { findings, total, limit, offset, ...summary } = scan;
  if (!failOn) return summary;
  const blocking = SEVERITIES.slice(0, SEVERITIES.indexOf(failOn) + 1);
  return {
    ...summary,
    fail_on: failOn,
    threshold_breached: blocking.some((severity) => summary.severity_rollup?.[severity] > 0),
  };
}

export async function runCloudScanStart(options = {}) {
  const provider = normalizeProvider(options.provider);
  if (normalizeKind(options.kind) !== 'container') {
    throw new Error('Only --kind container scans can be started from the CLI.');
  }
  const failOn = options.failOn && String(options.failOn).trim().toLowerCase();
  if (failOn && !SEVERITIES.includes(failOn)) {
    throw new Error(`--fail-on must be one of: ${SEVERITIES.join(', ')}.`);
  }
  if (failOn && !options.wait) throw new Error('--fail-on requires --wait.');
  const target = {};
  if (provider === 'aws') target.region = requireValue(options.region, '--region for AWS container scans');
  if (options.configId) target.config_id = options.configId;
  if (options.repositories) {
    target.repositories = String(options.repositories).split(',').map((name) => name.trim()).filter(Boolean);
  }

  const tenant = await resolveCliTenant(options);
  const started = await request(provider, 'container', 'start', options, target, tenant);
  if (!options.wait) return started;

  const timeout = options.timeout ?? 1800;
  const deadline = Date.now() + timeout * 1000;
  for (;;) {
    const scan = await request(provider, 'container', 'results/paginated', options, { scan_id: started.scan_id, limit: 25 }, tenant);
    if (scan.status !== 'running') return scanSummary(scan, failOn);
    if (Date.now() >= deadline) {
      const err = new Error(`Scan ${started.scan_id} is still running after ${timeout}s. Check it later with: codeant findings cloud list --provider ${provider} --kind container --scan-id ${started.scan_id}`);
      err.exitCode = 4;
      throw err;
    }
    await sleep(Math.min(POLL_INTERVAL_MS, deadline - Date.now()));
  }
}

export { normalizeKind, normalizeProvider };
