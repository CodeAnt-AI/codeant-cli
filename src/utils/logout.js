import { getConfigValue, setConfigValue } from './config.js';
import { fetchApi } from './fetchApi.js';

export async function logoutCodeAnt() {
  const token = process.env.CODEANT_API_TOKEN?.trim() || getConfigValue('apiKeyV2');
  if (!token) return { wasLoggedIn: false, serverRevoked: false };

  let serverRevoked = false;
  let warning;
  try {
    await fetchApi('/extension/logout', 'POST', {});
    serverRevoked = true;
  } catch (error) {
    warning = `The local token was cleared, but server revocation could not be confirmed: ${error.message}`;
  } finally {
    setConfigValue('apiKeyV2', null);
    delete process.env.CODEANT_API_TOKEN;
  }
  return { wasLoggedIn: true, serverRevoked, warning };
}
