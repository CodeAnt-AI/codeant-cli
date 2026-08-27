import { getConfigValue } from './config.js';

//
const NEW_BASE_URL = 'https://service.codeant.ai';
const DEFAULT_BASE_URLS = new Set([
  'https://service.codeant.ai',
  'https://api.codeant.ai',
  'https://dev-api.codeant.ai',
]);

const getBaseUrl = () => {
  const url = process.env.CODEANT_API_URL || getConfigValue('baseUrl') || NEW_BASE_URL;
  if (url === 'https://api.codeant.ai') return NEW_BASE_URL;
  return url;
};

const isDefaultBaseUrl = () => {
  const configuredUrl = process.env.CODEANT_API_URL || getConfigValue('baseUrl');
  return !configuredUrl || DEFAULT_BASE_URLS.has(configuredUrl);
};

const getDashboardUrl = async () => {
  const override = process.env.CODEANT_DASHBOARD_URL || getConfigValue('dashboardUrl');
  if (override) return override;

  const usingDefaultBaseUrl = isDefaultBaseUrl();

  try {
    const response = await fetch(`${getBaseUrl()}/extension/get/dashboard`);
    const data = await response.json();
    // On a custom base URL, never silently trust an auto-detected app.codeant.ai —
    // that's the SaaS dashboard, and a self-hosted instance's OAuth apps won't
    // recognize it as a valid redirect target. Require an explicit override instead.
    if (data.dashboard_url && (usingDefaultBaseUrl || data.dashboard_url !== 'https://app.codeant.ai')) {
      return data.dashboard_url;
    }
  } catch {
    // fall through to the error below
  }

  throw new Error(
    `Could not determine the dashboard URL for base URL "${getBaseUrl()}". ` +
    `Set it explicitly with: codeant set-dashboard-url <your web app URL>`
  );
};

export { getBaseUrl, getDashboardUrl };
