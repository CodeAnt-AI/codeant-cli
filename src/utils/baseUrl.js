import { getConfigValue } from './config.js';

const DEFAULT_BASE_URL = 'https://api.codeant.ai';
const DEFAULT_BASE_URLS = new Set([
  DEFAULT_BASE_URL,
  'https://dev-api.codeant.ai',
]);

const getBaseUrl = () => {
  return process.env.CODEANT_API_URL || getConfigValue('baseUrl') || DEFAULT_BASE_URL;
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
