import { getConfigValue } from './config.js';

//
const NEW_BASE_URL = 'https://service.codeant.ai';

const getBaseUrl = () => {
  const url = process.env.CODEANT_API_URL || getConfigValue('baseUrl') || NEW_BASE_URL;
  if (url === 'https://api.codeant.ai') return NEW_BASE_URL;
  return url;
};

const getDashboardUrl = async () => {
  try {
    const response = await fetch(`${getBaseUrl()}/extension/get/dashboard`);
    // console.log('Fetching dashboard URL from:', `${getBaseUrl()}/extension/get/dashboard`);
    const data = await response.json();
    return data.dashboard_url || 'https://app.codeant.ai';
  } catch {
    return 'https://app.codeant.ai';
  }
};

export { getBaseUrl, getDashboardUrl };
