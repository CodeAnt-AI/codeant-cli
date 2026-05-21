import { randomUUID } from 'crypto';
import { getConfigValue, setConfigValue } from './config.js';
import { getBaseUrl } from './baseUrl.js';

const DEFAULT_POLL_INTERVAL = 10_000;
const DEFAULT_TIMEOUT = 10 * 60 * 1000;

export function isAlreadyLoggedIn() {
  return !!getConfigValue('apiKeyV2');
}

export async function startLoginFlow() {
  const token = randomUUID();
  const baseUrl = getBaseUrl();
  const loginUrl = `https://app.codeant.ai?ideLoginToken=${token}`;
  const pollUrl = `${baseUrl}/extension/login/status?apiKey=${token}`;

  let browserOpened = false;
  try {
    const { default: open } = await import('open');
    await open(loginUrl);
    browserOpened = true;
  } catch {
    // Caller can fall back to printing loginUrl.
  }

  return { token, loginUrl, pollUrl, browserOpened };
}

export async function awaitLoginCompletion({
  token,
  pollUrl,
  pollIntervalMs = DEFAULT_POLL_INTERVAL,
  timeoutMs = DEFAULT_TIMEOUT,
  signal,
} = {}) {
  if (!token || !pollUrl) {
    throw new Error('awaitLoginCompletion requires token and pollUrl');
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Login aborted');

    try {
      const response = await fetch(pollUrl);
      const data = await response.json();
      if (data.status === 'yes') {
        setConfigValue('apiKeyV2', token);
        process.env.CODEANT_API_TOKEN = token;
        return { ok: true, token };
      }
    } catch {
      // Network blip — keep polling.
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remaining)));
  }

  throw new Error('Login timed out. Please try again.');
}

export async function runLoginFlow({
  pollIntervalMs = DEFAULT_POLL_INTERVAL,
  timeoutMs = DEFAULT_TIMEOUT,
  signal,
} = {}) {
  const { token, loginUrl, pollUrl, browserOpened } = await startLoginFlow();
  const result = await awaitLoginCompletion({ token, pollUrl, pollIntervalMs, timeoutMs, signal });
  return { ...result, loginUrl, browserOpened };
}
