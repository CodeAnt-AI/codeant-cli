import { useState, useEffect } from 'react';
import { useApp } from 'ink';
import SecretsApiHelper from '../utils/secretsApiHelper.js';
import { detectSecrets } from '../utils/secretsDetector.js';
import {
  renderInitializing,
  renderFetchingDiff,
  renderScanning,
  renderNoFiles,
  renderError,
  renderDone,
} from '../components/SecretsUI.js';

export default function Secrets({ scanType = 'all', include = [], exclude = [], lastNCommits = 1, baseBranch = null, baseCommit = null }) {
  const { exit } = useApp();
  const [status, setStatus] = useState('initializing');
  const [secrets, setSecrets] = useState([]);
  const [error, setError] = useState(null);
  const [fileCount, setFileCount] = useState(0);
  const [scanMeta, setScanMeta] = useState(null);
  const [startTime] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function scanSecrets() {
      try {
        if (cancelled) return;
        setStatus('fetching_diff');

        const helper = new SecretsApiHelper(process.cwd());
        await helper.init();

        if (cancelled) return;
        const requestBody = await helper.buildSecretsApiRequest(scanType, include, exclude, { lastNCommits, baseBranch, baseCommit });
        if (cancelled) return;

        const meta = requestBody._meta || null;
        setScanMeta(meta);
        delete requestBody._meta;

        if (requestBody.files.length === 0) {
          if (!cancelled) setStatus('no_files');
          return;
        }

        setFileCount(requestBody.files.length);
        setStatus('scanning');

        // Local detection — no API call needed
        const detectedSecrets = detectSecrets(requestBody.files);

        if (cancelled) return;
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
    return () => { cancelled = true; };
  }, [scanType, include, exclude, lastNCommits, baseBranch, baseCommit]);

  useEffect(() => {
    if (status === 'done') {
      const hasSecrets = secrets.some(file =>
        file.secrets.length > 0
      );
      if (hasSecrets) {
        setTimeout(() => { process.exitCode = 1; exit(new Error('Secrets detected')); }, 100);
      } else {
        setTimeout(() => exit(), 100);
      }
    } else if (status === 'no_files') {
      setTimeout(() => exit(), 100);
    } else if (status === 'error') {
      setTimeout(() => exit(new Error(error)), 100);
    }
  }, [status, secrets]);

  if (status === 'initializing') return renderInitializing(startTime);
  if (status === 'fetching_diff') return renderFetchingDiff(startTime);
  if (status === 'scanning') return renderScanning(startTime, fileCount, scanMeta);
  if (status === 'no_files') return renderNoFiles(scanType, lastNCommits, baseBranch, baseCommit);
  if (status === 'error') return renderError(error);
  if (status === 'done') return renderDone(secrets, startTime, fileCount, scanMeta);

  return null;
}
