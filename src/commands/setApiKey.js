import React, { useEffect } from 'react';
import { Text, Box, useApp } from 'ink';
import { setConfigValue, CONFIG_FILE } from '../utils/config.js';

export default function SetApiKey({ apiKey }) {
  const { exit } = useApp();

  useEffect(() => {
    if (!apiKey) {
      exit(new Error('API key is required'));
      return;
    }

    try {
      setConfigValue('apiKeyV2', apiKey);
      exit();
    } catch (err) {
      exit(err);
    }
  }, []);

  if (!apiKey) {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { color: 'red' }, '✗ Error: API key is required'),
      React.createElement(Text, { color: 'gray' }, 'Usage: codeant set-codeant-api-key <key>')
    );
  }

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(Text, { color: 'green' }, '✓ CodeAnt API key saved.'),
    React.createElement(Text, { color: 'gray' }, 'Saved to: ', CONFIG_FILE)
  );
}
