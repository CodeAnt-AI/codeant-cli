import { useState, useEffect } from 'react';
import { useApp } from 'ink';
import { getConfigValue } from '../utils/config.js';
import { fetchApi } from '../utils/fetchApi.js';
import SecretsApiHelper from '../utils/secretsApiHelper.js';
import {
  renderInitializing,
  renderFetchingDiff,
  renderScanning,
  renderNoFiles,
  renderError,
  renderNotLoggedIn,
  renderDone,
} from '../components/SecretsUI.js';

export default function Secrets({ scanType = 'all', failOn = 'CRITICAL', include = [], exclude = [], lastNCommits = 1, baseBranch = null, baseCommit = null }) {
  const { exit } = useApp();
  const [status, setStatus] = useState('initializing');
  const [secrets, setSecrets] = useState([]);
  const [error, setError] = useState(null);
  const [fileCount, setFileCount] = useState(0);
  const [scanMeta, setScanMeta] = useState(null);
  const [startTime] = useState(() => Date.now());

  const apiKey = getConfigValue('apiKey');

  // Handle not logged in state
  useEffect(() => {
    if (!apiKey) {
      if (process.stdin.isTTY) {
        return;
      }
      const id = setTimeout(() => exit(new Error('Not logged in')), 0);
      return () => clearTimeout(id);
    }
  }, [apiKey, exit]);

  if (!apiKey) {
    return renderNotLoggedIn();
  }

  // Helper to check if a secret should cause failure based on failOn level
  const shouldFailOn = (confidenceScore) => {
    const score = confidenceScore?.toUpperCase();
    if (score === 'FALSE_POSITIVE') return false;
    if (failOn === 'HIGH') return score === 'HIGH';
    if (failOn === 'MEDIUM') return score === 'HIGH' || score === 'MEDIUM';
    return true; // 'all' - fail on any non-false-positive
  };

  useEffect(() => {
    let cancelled = false;

    async function scanSecrets() {
      try {
        if (cancelled) return;
        setStatus('fetching_diff');

        // Initialize git helper and get files
        const helper = new SecretsApiHelper(process.cwd());
        await helper.init();

        if (cancelled) return;
        const requestBody = await helper.buildSecretsApiRequest(scanType, include, exclude, { lastNCommits, baseBranch, baseCommit });
        if (cancelled) return;

        const meta = requestBody._meta || null;
        setScanMeta(meta);

        // Strip _meta before sending to API
        delete requestBody._meta;

        if (requestBody.files.length === 0) {
          if (!cancelled) setStatus('no_files');
          return;
        }

        setFileCount(requestBody.files.length);
        setStatus('scanning');

        // Call the secrets detection API
        const response = await fetchApi(
          '/extension/pr-review/secrets-detection',
          'POST',
          requestBody
        );

        if (cancelled) return;
        const detectedSecrets = response.secretsDetected || [];

        // Filter to only include files with actual secrets
        const filesWithSecrets = detectedSecrets.filter(
          file => file.secrets && file.secrets.length > 0
        );

        if (!cancelled) {
          setSecrets(filesWithSecrets);
          setStatus('done');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setStatus('error');
        }
      }
    }

    scanSecrets();

    return () => {
      cancelled = true;
    };
  }, [scanType, include, exclude, lastNCommits, baseBranch, baseCommit]);

  // Handle exit after status changes
  useEffect(() => {
    if (status === 'done') {
      // Check if any secrets should cause failure based on failOn level
      const hasBlockingSecrets = secrets.some(file =>
        file.secrets.some(secret => shouldFailOn(secret.confidence_score))
      );

      if (hasBlockingSecrets) {
        setTimeout(() => {
          process.exitCode = 1;
          exit(new Error('Secrets detected'));
        }, 100);
      } else {
        setTimeout(() => exit(), 100);
      }
    } else if (status === 'no_files') {
      setTimeout(() => exit(), 100);
    } else if (status === 'error') {
      setTimeout(() => exit(new Error(error)), 100);
    }
  }, [status, secrets]);

  // ── Renders ──────────────────────────────────────────────────────────────

  if (status === 'initializing') return renderInitializing(startTime);
  if (status === 'fetching_diff') return renderFetchingDiff(startTime);
  if (status === 'scanning') return renderScanning(startTime, fileCount, scanMeta);
  if (status === 'no_files') return renderNoFiles(scanType, lastNCommits, baseBranch, baseCommit);
  if (status === 'error') return renderError(error);
  if (status === 'done') return renderDone(secrets, failOn, shouldFailOn, startTime, fileCount, scanMeta);

  return null;
}
