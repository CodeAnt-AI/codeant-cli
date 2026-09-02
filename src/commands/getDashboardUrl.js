import React, { useState, useEffect } from 'react';
import { Text, Box, useApp } from 'ink';
import { getConfigValue } from '../utils/config.js';
import { getBaseUrl, getDashboardUrl as resolveDashboardUrl } from '../utils/baseUrl.js';

export default function GetDashboardUrl() {
  const { exit } = useApp();
  const [state, setState] = useState({ status: 'loading' });

  const envValue = process.env.CODEANT_DASHBOARD_URL;
  const configValue = getConfigValue('dashboardUrl');
  const source = envValue ? 'env' : configValue ? 'config' : 'upstream (queried from API base URL)';

  useEffect(() => {
    (async () => {
      try {
        const url = await resolveDashboardUrl();
        setState({ status: 'resolved', url });
      } catch (err) {
        setState({ status: 'error', message: err.message });
      }
      exit();
    })();
  }, []);

  if (state.status === 'loading') {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(Text, null, 'Querying dashboard URL...')
    );
  }

  if (state.status === 'error') {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { color: 'red' }, '✗ ', state.message),
      React.createElement(Text, { color: 'gray' }, 'Base URL: ', getBaseUrl())
    );
  }

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(Text, { bold: true }, 'Dashboard URL: ', state.url),
    React.createElement(Text, { color: 'gray' }, 'Source: ', source)
  );
}
