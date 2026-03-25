import React, { useEffect } from 'react';
import { Text, Box, useApp } from 'ink';
import { setConfigValue, CONFIG_FILE } from '../utils/config.js';

export default function SetBaseUrl({ url }) {
  const { exit } = useApp();

  useEffect(() => {
    if (!url) {
      exit(new Error('URL is required'));
      return;
    }

    try {
      setConfigValue('baseUrl', url);
      exit();
    } catch (err) {
      exit(err);
    }
  }, []);

  if (!url) {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { color: 'red' }, '✗ Error: URL is required'),
      React.createElement(Text, { color: 'gray' }, 'Usage: codeant set-base-url <url>')
    );
  }

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(Text, { color: 'green' }, '✓ Base URL set to: ', url),
    React.createElement(Text, { color: 'gray' }, 'Saved to: ', CONFIG_FILE)
  );
}
