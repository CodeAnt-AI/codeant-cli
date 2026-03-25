import React, { useEffect } from 'react';
import { Text, Box, useApp } from 'ink';
import { getBaseUrl } from '../utils/baseUrl.js';

export default function GetBaseUrl() {
  const { exit } = useApp();

  const activeUrl = getBaseUrl();
  const source = process.env.CODEANT_API_URL ? 'env' : 'config';

  useEffect(() => {
    exit();
  }, []);

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(Text, { bold: true }, 'Base URL: ', activeUrl),
    React.createElement(Text, { color: 'gray' }, 'Source: ', source)
  );
}
