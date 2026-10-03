import { randomUUID } from 'crypto';
import { getConfigValue, setConfigValue } from './config.js';
import { getBaseUrl, getDashboardUrl } from './baseUrl.js';

const DEFAULT_POLL_INTERVAL = 10_000;
const DEFAULT_TIMEOUT = 10 * 60 * 1000;
const BROWSER_SPAWN_TIMEOUT = 2_000;

export function isAlreadyLoggedIn() {
  return !!getConfigValue('apiKeyV2');
}

export async function startLoginFlow() {
  const token = `cli___${randomUUID()}`;
  const baseUrl = getBaseUrl();
  const dashboardUrl = await getDashboardUrl();
  const loginUrl = `${dashboardUrl}?ideLoginToken=${token}`;
  const pollUrl = `${baseUrl}/extension/login/status?apiKey=${token}`;

  const browserOpened = await openBrowser(loginUrl);
  return { token, loginUrl, pollUrl, browserOpened };
}

// `open` returns the launcher process without an 'error' listener, so a missing
// launcher (SSH, containers) would otherwise crash the MCP server.
async function openBrowser(url) {
  try {
    const { default: open } = await import('open');
    const child = await open(url);
    return await new Promise((resolve) => {
      child.once('error', () => resolve(false));
      child.once('spawn', () => resolve(true));
      setTimeout(() => resolve(true), BROWSER_SPAWN_TIMEOUT).unref?.();
    });
  } catch {
    return false;
  }
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
      // Do not save the token if the login was aborted while this poll was in flight.
      if (data.status === 'yes' && !signal?.aborted) {
        setConfigValue('apiKeyV2', token);
        return { ok: true, token };
      }
    } catch {
      // Network blip — keep polling.
    }

    if (signal?.aborted) throw new Error('Login aborted');

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => {
      const onAbort = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, Math.min(pollIntervalMs, remaining));
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  if (signal?.aborted) throw new Error('Login aborted');
  throw new Error('Login timed out. Please try again.');
}
