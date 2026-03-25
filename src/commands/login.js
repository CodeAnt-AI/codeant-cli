import React, { useState, useEffect } from 'react';
import { Text, Box, useApp } from 'ink';
import { getConfigValue, setConfigValue } from '../utils/config.js';
import { getBaseUrl } from '../utils/baseUrl.js';
import { randomUUID } from 'crypto';

const POLL_INTERVAL = 10000; // 10 seconds
const TIMEOUT = 10 * 60 * 1000; // 10 minutes

export default function Login() {
  const { exit } = useApp();
  const [status, setStatus] = useState('opening');
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check if already logged in
    const existingToken = getConfigValue('apiKey');
    if (existingToken) {
      setStatus('already_logged_in');
      setTimeout(() => exit(), 100);
      return;
    }

    const token = randomUUID();
    const baseUrl = getBaseUrl();
    const loginUrl = `https://app.codeant.ai?ideLoginToken=${token}`;
    const pollUrl = `${baseUrl}/extension/login/status?apiKey=${token}`;

    // Open browser
    import('open').then(({ default: open }) => {
      open(loginUrl);
      setStatus('waiting');
    }).catch(() => {
      // Fallback: just show the URL
      console.log(`\nOpen this URL in your browser:\n${loginUrl}\n`);
      setStatus('waiting');
    });

    // Poll for login status
    let timeoutId;
    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(pollUrl);
        const data = await response.json();

        if (data.status === 'yes') {
          clearInterval(intervalId);
          clearTimeout(timeoutId);

          // Save the API key
          setConfigValue('apiKey', token);

          setStatus('success');
          setTimeout(() => exit(), 100);
        }
      } catch (err) {
        // Silently continue polling
      }
    }, POLL_INTERVAL);

    // Timeout after 10 minutes
    timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      setError('Login timed out. Please try again.');
      setStatus('error');
      setTimeout(() => exit(new Error('Login timed out')), 100);
    }, TIMEOUT);

    // Cleanup
    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, []);

  if (status === 'already_logged_in') {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { color: 'yellow' }, 'Already logged in.'),
      React.createElement(Text, { color: 'gray' }, 'Run "codeant logout" first to re-authenticate.')
    );
  }

  if (status === 'opening') {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(Text, null, 'Opening browser...')
    );
  }

  if (status === 'waiting') {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { color: 'cyan' }, 'Waiting for login...'),
      React.createElement(Text, { color: 'gray' }, 'Complete the login in your browser.'),
      React.createElement(Text, { color: 'gray' }, 'Checking every 10 seconds. Timeout in 10 minutes.')
    );
  }

  if (status === 'success') {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { color: 'green' }, '✓ Login successful!')
    );
  }

  if (status === 'error') {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { color: 'red' }, '✗ ', error)
    );
  }

  return null;
}
