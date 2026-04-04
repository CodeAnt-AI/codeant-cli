import React, { useEffect } from 'react';
import { Text, Box, useApp } from 'ink';
import { getConfigValue } from '../utils/config.js';

export default function GetApiKey() {
  const { exit } = useApp();

  const apiKey = getConfigValue('apiKeyV2');

  useEffect(() => {
    exit();
  }, []);

  if (!apiKey) {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { color: 'yellow' }, 'No CodeAnt API key configured.'),
      React.createElement(Text, { color: 'gray' }, 'Set one with: codeant set-codeant-api-key <key>')
    );
  }

  const masked = apiKey.slice(0, 4) + '…' + apiKey.slice(-4);

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(Text, { bold: true }, 'CodeAnt API Key: ', masked)
  );
}
