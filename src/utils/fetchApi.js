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

const fetchApi = async (endpoint, method = 'GET', body = null) => {
  const url = endpoint.startsWith('http') ? endpoint : `${getBaseUrl()}${endpoint}`;

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Add auth token from config or env
  const token = process.env.CODEANT_API_TOKEN || getConfigValue('apiKeyV2');
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  // Retry transient network/cold-start failures up to 2 times.
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, options);
      console.error('API Response Status:', response.status);

      if (response.status === 403) {
        throw new Error('Access denied (403). Please run `codeant logout` and then `codeant login` to re-authenticate.');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `HTTP error ${response.status}`);
      }

      return data;
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

export { fetchApi };
