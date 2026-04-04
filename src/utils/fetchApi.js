import { getConfigValue } from './config.js';
import { getBaseUrl } from './baseUrl.js';

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

  try {
    const response = await fetch(url, options);

    if (response.status === 403) {
      throw new Error('Access denied (403). Please run `codeant logout` and then `codeant login` to re-authenticate.');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `HTTP error ${response.status}`);
    }

    return data;
  } catch (err) {
    console.error(`API Error: ${err.message}`);
    throw err;
  }
};

export { fetchApi };
