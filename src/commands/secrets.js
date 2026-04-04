import { useState, useEffect } from 'react';
import { useApp } from 'ink';
import SecretsApiHelper from '../utils/secretsApiHelper.js';
import { detectSecrets } from '../utils/secretsDetector.js';
import { fetchApi } from '../utils/fetchApi.js';
import { detectRemote, detectRepoName, detectBaseUrl } from '../scm/index.js';
import {
  renderInitializing,
  renderFetchingDiff,
  renderScanning,
  renderNoFiles,
  renderError,
  renderDone,
  renderBypassPrompt,
} from '../components/SecretsUI.js';

export default function Secrets({ scanType = 'all', include = [], exclude = [], lastNCommits = 1, baseBranch = null, baseCommit = null, hook = false }) {
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

  // Build secrets payload for API calls
  function buildSecretsPayload() {
    return secrets.flatMap(file =>
      file.secrets.map(s => ({ type: s.type, file_path: file.file_path, line_number: s.line_number }))
    );
  }

  // Build remote info using existing scm detection
  function getRemoteBody() {
    const service = detectRemote();
    const repo = detectRepoName();
    if (!service || !repo) return null;
    return { service, repo, base_url: detectBaseUrl() };
  }

  // Fire-and-forget block event + exit 1
  function reportBlockAndExit() {
    const remote = getRemoteBody();
    if (remote) {
      fetchApi('/extension/push-protection/event', 'POST', {
        ...remote,
        secrets: buildSecretsPayload(),
      }).catch(() => {});
    }
    setTimeout(() => { process.exitCode = 1; exit(new Error('Secrets detected')); }, 100);
  }

  // Handle bypass selection
  async function handleBypassSelect(reason) {
    if (reason === 'cancel') {
      reportBlockAndExit();
      return;
    }
    const remote = getRemoteBody();
    if (remote) {
      try {
        await fetchApi('/extension/push-protection/bypass', 'POST', {
          ...remote,
          secrets: buildSecretsPayload(),
          reason: reason.startsWith('other:') ? 'other' : reason,
          custom_reason: reason.startsWith('other:') ? reason.slice(6) : undefined,
        });
      } catch {
        reportBlockAndExit();
        return;
      }
    }
    setTimeout(() => exit(), 100);
  }

  useEffect(() => {
    if (status === 'done') {
      const hasSecrets = secrets.some(file => file.secrets.length > 0);
      if (hasSecrets) {
        if (hook && process.stdin.isTTY) {
          setStatus('prompt_bypass');
        } else {
          reportBlockAndExit();
        }
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
  if (status === 'prompt_bypass') return renderBypassPrompt(secrets, handleBypassSelect);
  if (status === 'done') return renderDone(secrets, startTime, fileCount, scanMeta);

  return null;
}
