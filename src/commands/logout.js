import React, { useEffect } from 'react';
import { Text, Box, useApp } from 'ink';
import { getConfigValue } from '../utils/config.js';
import { logoutCodeAnt } from '../utils/logout.js';

export default function Logout() {
  const { exit } = useApp();

  const wasLoggedIn = !!getConfigValue('apiKeyV2');
  const [warning, setWarning] = React.useState(null);
  const [done, setDone] = React.useState(!wasLoggedIn);

  useEffect(() => {
    if (!wasLoggedIn) {
      exit();
      return;
    }
    logoutCodeAnt().then((result) => {
      setWarning(result.warning || null);
      setDone(true);
      setTimeout(() => exit(), 100);
    });
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
    React.createElement(Text, { color: done ? 'green' : 'gray' }, done ? '✓ Logged out successfully.' : 'Revoking session...'),
    warning ? React.createElement(Text, { color: 'yellow' }, warning) : null
  );
}
