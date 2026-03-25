import { getConfigValue } from './config.js';

const NEW_BASE_URL = 'https://service.codeant.ai';

const getBaseUrl = () => {
  const url = process.env.CODEANT_API_URL || getConfigValue('baseUrl') || NEW_BASE_URL;
  if (url === 'https://api.codeant.ai') return NEW_BASE_URL;
  return url;
};

export { getBaseUrl };
