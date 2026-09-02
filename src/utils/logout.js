import { getConfigValue, setConfigValue } from './config.js';
import { fetchApiResponse } from './fetchApi.js';

const DEFAULT_LOGOUT_REVOCATION_TIMEOUT_MS = 3_000;

export async function logoutCodeAnt({
  revocationTimeoutMs = DEFAULT_LOGOUT_REVOCATION_TIMEOUT_MS,
} = {}) {
  const token = process.env.CODEANT_API_TOKEN?.trim() || getConfigValue('apiKeyV2');
  if (!token) return { wasLoggedIn: false, serverRevoked: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), revocationTimeoutMs);
  let serverRevoked = false;
  let warning;
  try {
    await fetchApiResponse('/extension/logout', {
      method: 'POST',
      body: {},
      signal: controller.signal,
    });
    serverRevoked = true;
  } catch (error) {
    warning = `The local token was cleared, but server revocation could not be confirmed: ${error.message}`;
  } finally {
    clearTimeout(timeout);
    setConfigValue('apiKeyV2', null);
    delete process.env.CODEANT_API_TOKEN;
  }
  return { wasLoggedIn: true, serverRevoked, warning };
}
