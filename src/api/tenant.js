import { validateConnection } from '../scans/connectionHandler.js';

const SERVICE_ALIASES = { azure_devops: 'azuredevops', ado: 'azuredevops' };
const PROVIDER_BASE_FIELDS = {
  github: 'github_base_url',
  gitlab: 'gitlab_base_url',
  bitbucket: 'bitbucket_base_url',
  azuredevops: 'azure_devops_base_url',
};

export function normalizeService(value) {
  const service = String(value || '').trim().toLowerCase();
  return SERVICE_ALIASES[service] || service;
}

export async function resolveCliTenant({ org, service, providerBaseUrl } = {}) {
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
  if (!baseField) throw new Error(`Application APIs are not supported for service ${connection.service}.`);
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
