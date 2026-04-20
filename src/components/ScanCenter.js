import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import SelectList from './SelectList.js';
import { validateConnection } from '../scans/connectionHandler.js';
import { listRepos } from '../scans/listRepos.js';
import { getScanHistory } from '../scans/getScanHistory.js';
import { fetchScanResults } from '../scans/fetchScanResults.js';
import { fetchAdvancedScanResults } from '../scans/fetchAdvancedScanResults.js';
import { fetchDismissedAlerts } from '../scans/fetchDismissedAlerts.js';

const ce = React.createElement;

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPS = {
  LOADING: 'loading',
  SELECT_CONNECTION: 'select-connection',
  SELECT_REPO: 'select-repo',
  SELECT_SCAN: 'select-scan',
  SELECT_RESULT_TYPE: 'select-result-type',
  SHOWING_RESULTS: 'showing-results',
  ERROR: 'error',
};

const RESULT_TYPES = [
  { label: 'Security Issues (SAST)',  value: 'security_issues',   kind: 'basic' },
  { label: 'Anti-Patterns',           value: 'anti_patterns',     kind: 'basic' },
  { label: 'Docstring Issues',        value: 'docstring',         kind: 'basic' },
  { label: 'Complex Functions',       value: 'complex_functions', kind: 'basic' },
  { label: 'SCA — Dependencies',      value: 'sca',               kind: 'advanced' },
  { label: 'SBOM',                    value: 'sbom',              kind: 'advanced' },
  { label: 'Secrets',                 value: 'secrets',           kind: 'advanced' },
  { label: 'IaC (Infrastructure)',    value: 'iac',               kind: 'advanced' },
  { label: 'Dead Code',               value: 'dead_code',         kind: 'advanced' },
  { label: 'Dismissed Alerts',        value: 'dismissed_alerts',  kind: 'dismissed' },
  { label: 'Dismissed Secrets',       value: 'dismissed_secrets', kind: 'dismissed' },
];

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const RESULTS_PAGE = 15;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function severityColor(sev) {
  if (!sev) return 'gray';
  const s = sev.toLowerCase();
  if (s === 'critical' || s === 'high') return 'red';
  if (s === 'medium' || s === 'warning') return 'yellow';
  if (s === 'low') return 'cyan';
  return 'gray';
}

function severityLabel(sev) {
  if (!sev) return 'INFO';
  return sev.toUpperCase().slice(0, 4);
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner({ label }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 100);
    return () => clearInterval(id);
  }, []);
  return ce(
    Box,
    null,
    ce(Text, { color: 'cyan' }, SPINNER_FRAMES[frame] + ' '),
    ce(Text, null, label)
  );
}

// ─── Breadcrumb ──────────────────────────────────────────────────────────────

function Breadcrumb({ parts }) {
  return ce(
    Box,
    { marginBottom: 1 },
    ...parts.map((p, i) =>
      ce(Text, { key: i, color: i === parts.length - 1 ? 'cyan' : 'gray' },
        (i > 0 ? ' › ' : '') + p)
    )
  );
}

// ─── Results view ────────────────────────────────────────────────────────────

function ResultsView({ issues, resultTypeLabel, breadcrumbParts, onBack }) {
  const [offset, setOffset] = useState(0);

  useInput((input, key) => {
    if (input === 'b' || key.escape) { onBack(); return; }
    if (key.downArrow) setOffset((o) => Math.min(o + 1, Math.max(0, issues.length - RESULTS_PAGE)));
    if (key.upArrow)   setOffset((o) => Math.max(0, o - 1));
  });

  const visible = issues.slice(offset, offset + RESULTS_PAGE);

  const rows = issues.length === 0
    ? [ce(Box, { key: 'empty', marginBottom: 1 }, ce(Text, { color: 'green' }, '✓ No issues found'))]
    : [
        ce(Box, { key: 'counter', marginBottom: 1 },
          ce(Text, { color: 'gray' },
            `Showing ${offset + 1}–${Math.min(offset + RESULTS_PAGE, issues.length)} of ${issues.length} issues`)
        ),
        ...visible.map((issue, i) =>
          ce(
            Box,
            { key: i, flexDirection: 'row', gap: 1 },
            ce(Text, { color: severityColor(issue.severity), bold: true },
              `[${severityLabel(issue.severity)}]`),
            ce(Text, { color: 'gray' },
              (issue.file_path || 'unknown') + (issue.line_number ? `:${issue.line_number}` : '')),
            ce(Text, null,
              issue.check_name || issue.issue_text || issue.message || '')
          )
        ),
      ];

  return ce(
    Box,
    { flexDirection: 'column', paddingX: 1 },
    ce(Breadcrumb, { parts: [...breadcrumbParts, resultTypeLabel] }),
    ...rows,
    ce(
      Box,
      { marginTop: 1, borderStyle: 'single', borderColor: 'gray', paddingX: 1 },
      ce(Text, { color: 'gray' }, '[↑↓] scroll   [b] back')
    )
  );
}

// ─── Error view ──────────────────────────────────────────────────────────────

function ErrorView({ message, onBack, canGoBack }) {
  useInput((input, key) => {
    if (input === 'b' || key.escape || key.return) onBack();
  });
  return ce(
    Box,
    { flexDirection: 'column', paddingX: 1, paddingY: 1 },
    ce(Text, { color: 'red', bold: true }, '✖ Error'),
    ce(Box, { marginTop: 1 },
      ce(Text, null, message)
    ),
    ce(
      Box,
      { marginTop: 1, borderStyle: 'single', borderColor: 'gray', paddingX: 1 },
      ce(Text, { color: 'gray' }, canGoBack ? '[b / Enter] go back' : '[b / Enter] exit')
    )
  );
}

// ─── Main ScanCenter ─────────────────────────────────────────────────────────

export default function ScanCenter() {
  const { exit } = useApp();

  const [step, setStep] = useState(STEPS.LOADING);
  const [loadingMsg, setLoadingMsg] = useState('Validating connection…');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorBackStep, setErrorBackStep] = useState(null);

  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState(null);

  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);

  const [scanHistory, setScanHistory] = useState([]);
  const [selectedScan, setSelectedScan] = useState(null);

  const [selectedResultType, setSelectedResultType] = useState(null);
  const [results, setResults] = useState(null);

  const setError = (msg, backStep) => {
    setErrorMsg(msg);
    setErrorBackStep(backStep);
    setStep(STEPS.ERROR);
  };

  // ── Step 1: validate connection on mount ──
  useEffect(() => {
    (async () => {
      const res = await validateConnection();
      if (!res.success) {
        setError(res.error || 'Failed to validate connection', null);
        return;
      }
      if (!res.connections || res.connections.length === 0) {
        setError('No connected organisations found. Please log in to CodeAnt first.', null);
        return;
      }
      setConnections(res.connections);
      setStep(STEPS.SELECT_CONNECTION);
    })();
  }, []);

  // ── Step 2: connection selected → fetch repos ──
  const handleSelectConnection = async (item) => {
    setSelectedConnection(item.value);
    setStep(STEPS.LOADING);
    setLoadingMsg(`Fetching repos for ${item.value.organizationName}…`);
    const res = await listRepos(item.value.organizationName);
    if (!res.success) {
      setError(res.error || 'Failed to fetch repos', STEPS.SELECT_CONNECTION);
      return;
    }
    setRepos(res.repos || []);
    setStep(STEPS.SELECT_REPO);
  };

  // ── Step 3: repo selected → fetch scan history ──
  const handleSelectRepo = async (item) => {
    setSelectedRepo(item.value);
    setStep(STEPS.LOADING);
    setLoadingMsg(`Loading scan history for ${item.value.full_name}…`);
    const res = await getScanHistory(item.value.full_name);
    if (!res.success) {
      setError(res.error || 'Failed to fetch scan history', STEPS.SELECT_REPO);
      return;
    }
    const history = res.scanHistory || [];
    process.stderr.write('SCAN_HISTORY_SAMPLE: ' + JSON.stringify(history.slice(0, 15), null, 2) + '\n');
    setScanHistory(history);
    setStep(STEPS.SELECT_SCAN);
  };

  // ── Step 4: scan selected → show result type menu ──
  const handleSelectScan = (item) => {
    setSelectedScan(item.value);
    setStep(STEPS.SELECT_RESULT_TYPE);
  };

  // ── Step 5: result type selected → fetch exactly one endpoint ──
  const handleSelectResultType = async (item) => {
    const rt = item.value;
    setSelectedResultType(rt);
    setStep(STEPS.LOADING);
    setLoadingMsg(`Fetching ${item.label}…`);

    const repo = selectedRepo.full_name;
    const commitId = selectedScan.commitId;
    let res;

    if (rt.kind === 'basic') {
      res = await fetchScanResults(repo, commitId, rt.value);
    } else if (rt.kind === 'advanced') {
      res = await fetchAdvancedScanResults(repo, commitId, rt.value);
    } else if (rt.value === 'dismissed_alerts') {
      const r = await fetchDismissedAlerts(repo, 'security');
      res = r.success ? { success: true, issues: r.dismissedAlerts } : r;
    } else if (rt.value === 'dismissed_secrets') {
      const r = await fetchDismissedAlerts(repo, 'secrets');
      res = r.success ? { success: true, issues: r.dismissedAlerts } : r;
    }

    if (!res || !res.success) {
      setError((res && res.error) || 'Failed to fetch results', STEPS.SELECT_RESULT_TYPE);
      return;
    }

    setResults(res);
    setStep(STEPS.SHOWING_RESULTS);
  };

  // ── Back navigation ──
  const goBack = {
    [STEPS.SELECT_CONNECTION]: () => exit(),
    [STEPS.SELECT_REPO]:       () => { setSelectedConnection(null); setStep(STEPS.SELECT_CONNECTION); },
    [STEPS.SELECT_SCAN]:       () => { setSelectedRepo(null); setStep(STEPS.SELECT_REPO); },
    [STEPS.SELECT_RESULT_TYPE]:() => { setSelectedScan(null); setStep(STEPS.SELECT_SCAN); },
    [STEPS.SHOWING_RESULTS]:   () => { setResults(null); setSelectedResultType(null); setStep(STEPS.SELECT_RESULT_TYPE); },
  };

  const breadcrumbParts = [
    selectedConnection?.organizationName,
    selectedRepo?.name,
    selectedScan ? (selectedScan.commitId || '').slice(0, 8) : null,
  ].filter(Boolean);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (step === STEPS.LOADING) {
    return ce(Box, { paddingX: 1, paddingY: 1 }, ce(Spinner, { label: loadingMsg }));
  }

  if (step === STEPS.ERROR) {
    const canGoBack = errorBackStep !== null;
    const onErrorBack = canGoBack
      ? () => { setErrorMsg(''); setStep(errorBackStep); }
      : () => exit();
    return ce(ErrorView, { message: errorMsg, onBack: onErrorBack, canGoBack });
  }

  if (step === STEPS.SELECT_CONNECTION) {
    const items = connections
      .filter((c) => c && c.organizationName)
      .map((c) => ({
        label: c.organizationName,
        sublabel: `${c.service}  ${c.baseUrl}`,
        value: c,
      }));
    return ce(SelectList, {
      title: 'Select a connection',
      items,
      onSelect: handleSelectConnection,
      onBack: goBack[STEPS.SELECT_CONNECTION],
    });
  }

  if (step === STEPS.SELECT_REPO) {
    const items = repos
      .filter((r) => r && (r.name || r.full_name))
      .map((r) => ({
        label: r.name || r.full_name,
        sublabel: r.pushed_at ? `Last push: ${new Date(r.pushed_at).toLocaleDateString()}` : undefined,
        value: r,
      }));
    return ce(
      Box,
      { flexDirection: 'column' },
      ce(Box, { paddingX: 1 }, ce(Breadcrumb, { parts: [selectedConnection.organizationName] })),
      ce(SelectList, {
        title: 'Select a repository',
        items,
        onSelect: handleSelectRepo,
        onBack: goBack[STEPS.SELECT_REPO],
        emptyMessage: 'No repositories found for this organisation.',
      })
    );
  }

  if (step === STEPS.SELECT_SCAN) {
    const items = scanHistory
      .filter((s) => s && typeof s === 'object' && s.latest_commit_sha)
      .slice()
      .sort((a, b) => {
        const da = new Date(a.timestamp || a.date || a.created_at || 0);
        const db = new Date(b.timestamp || b.date || b.created_at || 0);
        return db - da;
      })
      .map((s) => {
        const date = s.timestamp || s.date || s.created_at;
        const branch = s.branch || s.ref || '';
        const commitFull = s.latest_commit_sha || '';
        return {
          label: branch || '(no branch)',
          sublabel: [commitFull || null, date ? new Date(date).toLocaleString() : null].filter(Boolean).join('   '),
          value: { ...s, commitId: commitFull },
        };
      });
    return ce(
      Box,
      { flexDirection: 'column' },
      ce(Box, { paddingX: 1 },
        ce(Breadcrumb, { parts: [selectedConnection.organizationName, selectedRepo.name] })),
      ce(SelectList, {
        title: 'Select a scan',
        items,
        onSelect: handleSelectScan,
        onBack: goBack[STEPS.SELECT_SCAN],
        emptyMessage: 'No scan history found for this repository.',
      })
    );
  }

  if (step === STEPS.SELECT_RESULT_TYPE) {
    const items = RESULT_TYPES.map((rt) => ({
      label: rt.label,
      sublabel: rt.kind === 'basic' ? 'standard analysis'
              : rt.kind === 'advanced' ? 'advanced analysis'
              : 'dismissed',
      value: rt,
    }));
    return ce(
      Box,
      { flexDirection: 'column' },
      ce(Box, { paddingX: 1 }, ce(Breadcrumb, { parts: breadcrumbParts })),
      ce(SelectList, {
        title: 'Select result type',
        items,
        onSelect: handleSelectResultType,
        onBack: goBack[STEPS.SELECT_RESULT_TYPE],
      })
    );
  }

  if (step === STEPS.SHOWING_RESULTS) {
    const issues = results?.issues || [];
    const rtObj = RESULT_TYPES.find((r) => r.value === selectedResultType?.value);
    return ce(ResultsView, {
      issues,
      resultTypeLabel: rtObj?.label || selectedResultType?.value || '',
      breadcrumbParts,
      onBack: goBack[STEPS.SHOWING_RESULTS],
    });
  }

  return null;
}
