import React, { useEffect } from 'react';
import { Text, Box, useApp } from 'ink';
import { getConfigValue, setConfigValue } from '../utils/config.js';

export default function Logout() {
  const { exit } = useApp();

  const wasLoggedIn = !!getConfigValue('apiKeyV2');

  useEffect(() => {
    if (wasLoggedIn) {
      setConfigValue('apiKeyV2', null);
    }
    exit();
  }, []);

  if (!wasLoggedIn) {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { color: 'yellow' }, 'Not logged in.')
    );
  }

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(Text, { color: 'green' }, '✓ Logged out successfully.')
  );
}
