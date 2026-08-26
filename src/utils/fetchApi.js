import { Agent, setGlobalDispatcher } from 'undici';
import { getConfigValue } from './config.js';
import { getBaseUrl } from './baseUrl.js';

// Undici's default TCP connect timeout (10s) is too short for cold-start
// Lambda / API-Gateway TLS handshakes under burst load (the headless review
// fan-outs 8 requests at once). Bump to 60s globally + retry on transient
// network errors so cold starts don't break the run.
setGlobalDispatcher(
  new Agent({
    connect: { timeout: 60_000 },
    connections: 32,
  })
);

const RETRYABLE_CAUSES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function responseMessage(data, status) {
  if (typeof data?.error?.message === 'string') return data.error.message;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.error === 'string') return data.error;
  return `HTTP error ${status}`;
}

function appendQuery(url, query) {
  if (!query || typeof query !== 'object') return url;
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) parsed.searchParams.append(key, String(item));
    } else {
      parsed.searchParams.set(key, String(value));
    }
  }
  return parsed.toString();
}

async function parseResponse(response) {
  if (response.status === 204 || response.status === 205) return null;
  const text = await response.text();
  if (!text) return null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('json') || /^[\s]*[\[{]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch {
      // A mislabeled response should still be inspectable by the caller.
    }
  }
  return text;
}

const fetchApiResponse = async (endpoint, {
  method = 'GET',
  body = null,
  headers = {},
  query = null,
  allowHttpError = false,
  tenant = null,
} = {}) => {
  const baseUrl = getBaseUrl();
  const resolvedUrl = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
  const url = appendQuery(resolvedUrl, query);
  const normalizedMethod = String(method || 'GET').toUpperCase();

  const options = {
    method: normalizedMethod,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  // Add auth token from config or env
  const token = process.env.CODEANT_API_TOKEN || getConfigValue('apiKeyV2');
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  if (tenant) {
    options.headers['X-CodeAnt-CLI-Org'] = tenant.organization;
    options.headers['X-CodeAnt-CLI-Service'] = tenant.service;
    options.headers['X-CodeAnt-CLI-Base-URL'] = tenant.providerBaseUrl;
  }

  if (body !== null && body !== undefined && !['GET', 'HEAD'].includes(normalizedMethod)) {
    options.body = JSON.stringify(body);
  }

  // Retry transient network/cold-start failures up to 2 times.
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, options);
      // console.error('API Response Status:', response.status);

      if (response.status === 403) {
        throw new Error('Access denied (403). Please run `codeant logout` and then `codeant login` to re-authenticate.');
      }

      const data = await parseResponse(response);

      if (!response.ok && !allowHttpError) {
        const error = new Error(responseMessage(data, response.status));
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return {
        ok: response.ok,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data,
      };
    } catch (err) {
      lastErr = err;
      const cause = err?.cause?.code || err?.cause?.message || err?.cause || '';
      const retryable = RETRYABLE_CAUSES.has(err?.cause?.code) && attempt < MAX_ATTEMPTS;
      if (retryable) {
        console.error(`API Retry ${attempt}/${MAX_ATTEMPTS - 1} after ${cause}`);
        await sleep(1000 * attempt);
        continue;
      }
      console.error(`API Error: ${err.message}${cause ? ` (cause: ${cause})` : ''}`);
      throw err;
    }
  }
  throw lastErr;
};

const fetchApi = async (endpoint, method = 'GET', body = null) => {
  const response = await fetchApiResponse(endpoint, { method, body });
  return response.data;
};

const fetchAppApi = async (endpoint, method = 'GET', body = null, tenant) => {
  const response = await fetchApiResponse(endpoint, { method, body, tenant });
  return response.data;
};

export { fetchApi, fetchApiResponse, fetchAppApi };
