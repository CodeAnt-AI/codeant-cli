import { validateConnection } from '../scans/connectionHandler.js';
import { fetchApi } from '../utils/fetchApi.js';

const SERVICE_ALIASES = { azure_devops: 'azuredevops', ado: 'azuredevops' };
const PROVIDER_BASE_FIELDS = {
  github: 'github_base_url',
  gitlab: 'gitlab_base_url',
  bitbucket: 'bitbucket_base_url',
  azuredevops: 'azure_devops_base_url',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function normalizeService(value) {
  const service = String(value || '').trim().toLowerCase();
  return SERVICE_ALIASES[service] || service;
}

function splitValues(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.flatMap((entry) => String(entry).split(',')).map((entry) => entry.trim()).filter(Boolean);
}

export function hotlistFilters(options = {}) {
  return {
    types: splitValues(options.types),
    locations: splitValues(options.locations),
    severities: splitValues(options.severities).map((value) => value.toLowerCase()),
    ticket_statuses: splitValues(options.ticketStatuses),
    compliance: splitValues(options.compliance).map((value) => value.toLowerCase()),
    validation: splitValues(options.validation),
  };
}

export async function resolveHotlistTenant({ org, service, providerBaseUrl } = {}) {
  const validation = await validateConnection();
  if (!validation.success) {
    throw new Error(validation.error || 'Unable to load authenticated CodeAnt organizations.');
  }
  const requestedService = normalizeService(service);
  const candidates = (validation.connections || []).filter((connection) => {
    const orgMatches = !org || connection.organizationName === org;
    const serviceMatches = !requestedService || normalizeService(connection.service) === requestedService;
    return orgMatches && serviceMatches;
  });
  if (candidates.length === 0) {
    throw new Error('No authenticated organization matches --org/--service. Run `codeant scans orgs` to list available connections.');
  }
  if (candidates.length > 1) {
    throw new Error('More than one organization matches. Pass both --org and --service; run `codeant scans orgs` to list values.');
  }

  const connection = candidates[0];
  const normalizedService = normalizeService(connection.service);
  const baseField = PROVIDER_BASE_FIELDS[normalizedService];
  if (!baseField) throw new Error(`Hotlist is not supported for service ${connection.service}.`);
  const organization = org || connection.organizationName;
  const baseUrl = providerBaseUrl || connection.baseUrl;
  if (!baseUrl) {
    throw new Error('The provider base URL is unavailable. Pass --provider-base-url explicitly.');
  }
  return {
    organization,
    service: normalizedService,
    providerBaseUrl: baseUrl,
    requestBody: {
      org: organization,
      organization,
      service: normalizedService,
      [baseField]: baseUrl,
    },
  };
}

async function requestReady(endpoint, body, maxWaitSeconds = 60) {
  const deadline = Date.now() + Math.max(0, Number(maxWaitSeconds) || 0) * 1000;
  while (true) {
    const response = await fetchApi(endpoint, 'POST', body);
    if (response?.state !== 'building') return response;
    if (Date.now() >= deadline) {
      throw new Error('Hotlist is still building. Retry the command in a few seconds or increase --max-wait.');
    }
    const retrySeconds = Math.min(Math.max(Number(response.retry_after_seconds) || 3, 1), 10);
    await sleep(retrySeconds * 1000);
  }
}

function pageLimit(value) {
  const limit = value === undefined ? 30 : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('--limit must be an integer between 1 and 100.');
  }
  return limit;
}

export async function runHotlistList(options = {}) {
  const tenant = await resolveHotlistTenant(options);
  const request = {
    ...tenant.requestBody,
    search: options.search || '',
    filters: hotlistFilters(options),
    limit: pageLimit(options.limit),
    cursor: options.cursor || null,
  };
  let result = await requestReady('/explorer/security/hotlist/query', request, options.maxWaitSeconds);
  if (!options.all) return { tenant: tenant.requestBody, ...result };

  const items = [...(result.items || [])];
  while (result.has_more && result.next_cursor) {
    result = await requestReady(
      '/explorer/security/hotlist/query',
      { ...request, cursor: result.next_cursor },
      options.maxWaitSeconds,
    );
    items.push(...(result.items || []));
  }
  return {
    tenant: tenant.requestBody,
    ...result,
    items,
    returned_count: items.length,
    next_cursor: null,
    has_more: false,
  };
}

export async function runHotlistGet({ findingId, ...options } = {}) {
  if (!/^[0-9a-f]{32}$/i.test(String(findingId || ''))) {
    throw new Error('Finding ID must be the 32-character stable ID shown in Hotlist.');
  }
  const tenant = await resolveHotlistTenant(options);
  const result = await requestReady(
    '/explorer/security/hotlist/finding',
    { ...tenant.requestBody, finding_id: String(findingId).toLowerCase() },
    options.maxWaitSeconds,
  );
  return { tenant: tenant.requestBody, ...result };
}
