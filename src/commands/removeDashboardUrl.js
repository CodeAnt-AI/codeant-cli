import React, { useEffect } from 'react';
import { Text, Box, useApp } from 'ink';
import { getConfigValue, setConfigValue } from '../utils/config.js';

export default function RemoveDashboardUrl() {
  const { exit } = useApp();

  const hadValue = !!getConfigValue('dashboardUrl');

  useEffect(() => {
    if (hadValue) {
      setConfigValue('dashboardUrl', null);
    }
    exit();
  }, []);

  if (!hadValue) {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { color: 'yellow' }, 'No dashboard URL override was set.')
    );
  }

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(Text, { color: 'green' }, '✓ Dashboard URL override removed.'),
    React.createElement(Text, { color: 'gray' }, 'It will be auto-detected from the API base URL on next login.')
  );
}
