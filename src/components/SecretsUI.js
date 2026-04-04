import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

// ── Constants ────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const DIVIDER = '─'.repeat(55);
const STEPS = ['Init', 'Fetch', 'Scan'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function padEnd(str, len) {
  return str + ' '.repeat(Math.max(0, len - str.length));
}

function formatElapsed(startTime) {
  return ((Date.now() - startTime) / 1000).toFixed(1) + 's';
}

// ── Animated Components ──────────────────────────────────────────────────────

function Spinner({ color = 'cyan' }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);
  return React.createElement(Text, { color }, SPINNER_FRAMES[frame]);
}

function ElapsedTime({ startTime }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(timer);
  }, []);
  return React.createElement(Text, { color: 'gray' }, formatElapsed(startTime));
}

function StepProgress({ currentStep }) {
  const items = STEPS.map((step, i) => {
    if (i < currentStep) {
      return React.createElement(Text, { key: step, color: 'green' }, `✓ ${step}`);
    } else if (i === currentStep) {
      return React.createElement(
        Box, { key: step },
        React.createElement(Spinner, { color: 'cyan' }),
        React.createElement(Text, { color: 'cyan' }, ` ${step}`),
      );
    } else {
      return React.createElement(Text, { key: step, color: 'gray', dimColor: true }, `· ${step}`);
    }
  });
  return React.createElement(Box, { gap: 2 }, ...items);
}

// ── Loading Screen ───────────────────────────────────────────────────────────

function SecretsLoading({ message, step, startTime, fileCount, meta }) {
  const els = [
    React.createElement(
      Box, { key: 'status', gap: 1 },
      React.createElement(Spinner, {}),
      React.createElement(Text, { color: 'white', bold: true }, message),
      startTime != null && React.createElement(ElapsedTime, { startTime }),
    ),
    React.createElement(
      Box, { key: 'steps', marginTop: 1 },
      React.createElement(StepProgress, { currentStep: step }),
    ),
  ];

  // Show file list and coverage info when we have metadata (during scan step)
  if (meta && step >= 2) {
    const scanned = meta.scanned_files || [];
    const total = meta.total_changed || 0;
    const skipped = meta.skipped || [];

    els.push(React.createElement(Text, { key: 'meta-sp' }, ''));
    els.push(React.createElement(
      Text, { key: 'meta-hdr', color: 'gray', dimColor: true }, DIVIDER,
    ));

    // Coverage line
    if (total > 0) {
      const coverageColor = scanned.length === total ? 'green' : 'yellow';
      els.push(React.createElement(
        Text, { key: 'coverage', color: coverageColor },
        `Scanning ${scanned.length} of ${total} changed file${total !== 1 ? 's' : ''}`,
      ));
    }

    // File list
    if (scanned.length > 0) {
      els.push(React.createElement(Text, { key: 'files-sp' }, ''));
      scanned.forEach((file, i) => {
        const isLast = i === scanned.length - 1;
        const branch = isLast ? '└─' : '├─';
        els.push(React.createElement(
          Text, { key: `file-${i}`, color: 'white' },
          `  ${branch} ${file}`,
        ));
      });
    }

    // Skipped summary
    if (skipped.length > 0) {
      els.push(React.createElement(Text, { key: 'skip-sp' }, ''));
      const reasons = {};
      skipped.forEach(s => {
        const r = s.reason.split(' (')[0];
        reasons[r] = (reasons[r] || 0) + 1;
      });
      const parts = Object.entries(reasons).map(([r, n]) => `${n} ${r}`);
      els.push(React.createElement(
        Text, { key: 'skipped', color: 'gray', dimColor: true },
        `Skipped: ${parts.join(' · ')}`,
      ));
    }
  }

  return React.createElement(
    Box, { flexDirection: 'column', paddingX: 1, paddingY: 1 }, ...els,
  );
}

// ── Public Render Functions ──────────────────────────────────────────────────

export function renderInitializing(startTime) {
  return React.createElement(SecretsLoading, {
    message: 'Initializing...',
    step: 0,
    startTime,
  });
}

export function renderFetchingDiff(startTime) {
  return React.createElement(SecretsLoading, {
    message: 'Fetching changes...',
    step: 1,
    startTime,
  });
}

export function renderScanning(startTime, fileCount, meta) {
  return React.createElement(SecretsLoading, {
    message: 'Scanning for secrets...',
    step: 2,
    startTime,
    fileCount,
    meta,
  });
}

export function renderNoFiles(scanType, lastNCommits, baseBranch, baseCommit) {
  const hints = {
    'staged-only': 'Stage some changes first with "git add".',
    'branch-diff': 'No changes found compared to the base branch.',
    'uncommitted': 'No uncommitted changes found.',
    'committed': 'No unpushed commits found.',
    'all': 'No changes found between your branch and the base.',
    'last-commit': 'No files found in the last commit.',
    'last-n-commits': `No changes found in the last ${lastNCommits} commit(s).`,
    'base-branch': `No changes found compared to ${baseBranch}.`,
    'base-commit': `No changes found compared to commit ${baseCommit}.`,
  };
  return React.createElement(
    Box, { flexDirection: 'column', paddingX: 1, paddingY: 1 },
    React.createElement(Text, { color: 'cyan', bold: true }, 'CodeAnt Secrets'),
    React.createElement(Text, { color: 'gray', dimColor: true }, DIVIDER),
    React.createElement(Text, {}, ''),
    React.createElement(Text, { color: 'yellow' }, '  No changes to scan.'),
    React.createElement(Text, { color: 'gray' }, `  ${hints[scanType] || 'No files found.'}`),
    React.createElement(Text, {}, ''),
  );
}

export function renderError(error) {
  return React.createElement(
    Box, { flexDirection: 'column', paddingX: 1, paddingY: 1 },
    React.createElement(Text, { color: 'cyan', bold: true }, 'CodeAnt Secrets'),
    React.createElement(Text, { color: 'gray', dimColor: true }, DIVIDER),
    React.createElement(Text, {}, ''),
    React.createElement(Text, { color: 'red', bold: true }, `  ✗ ${error}`),
    React.createElement(Text, {}, ''),
  );
}

export function renderNotLoggedIn() {
  return React.createElement(
    Box, { flexDirection: 'column', paddingX: 1, paddingY: 1 },
    React.createElement(Text, { color: 'cyan', bold: true }, 'CodeAnt Secrets'),
    React.createElement(Text, { color: 'gray', dimColor: true }, DIVIDER),
    React.createElement(Text, {}, ''),
    React.createElement(Text, { color: 'red', bold: true }, '  ✗ Not logged in'),
    React.createElement(Text, { color: 'gray' }, '  Run "codeant login" to authenticate.'),
    React.createElement(Text, {}, ''),
  );
}

export function renderDone(secrets, startTime, fileCount, meta) {
  const allSecrets = secrets.flatMap(file =>
    file.secrets.map(s => ({ ...s, file_path: file.file_path }))
  );

  const elapsed = startTime ? formatElapsed(startTime) : null;

  // Group by file
  const grouped = {};
  allSecrets.forEach(s => {
    const file = s.file_path || 'Unknown';
    (grouped[file] ??= []).push(s);
  });
  const sortedFiles = Object.keys(grouped).sort();
  sortedFiles.forEach(f =>
    grouped[f].sort((a, b) => (a.line_number || 0) - (b.line_number || 0))
  );

  const els = [];

  // ── Header ──
  els.push(React.createElement(
    Box, { key: 'hdr', gap: 1 },
    React.createElement(Text, { color: 'cyan', bold: true }, 'CodeAnt Secrets'),
    elapsed && React.createElement(Text, { color: 'gray' }, elapsed),
  ));
  els.push(React.createElement(
    Text, { key: 'div1', color: 'gray', dimColor: true }, DIVIDER,
  ));

  if (allSecrets.length === 0) {
    // ── Clean pass ──
    els.push(React.createElement(Text, { key: 'sp' }, ''));
    els.push(React.createElement(
      Text, { key: 'ok', color: 'green', bold: true }, '  ✓ No secrets found',
    ));
    els.push(React.createElement(Text, { key: 'sp2' }, ''));
  } else {
    // ── Secrets grouped by file ──
    els.push(React.createElement(Text, { key: 'sp1' }, ''));

    sortedFiles.forEach((file, fi) => {
      const fileSecrets = grouped[file];

      els.push(React.createElement(
        Text, { key: `f-${fi}`, color: 'white', bold: true }, `  ${file}`,
      ));

      fileSecrets.forEach((secret, si) => {
        const isLast = si === fileSecrets.length - 1;
        const branch = isLast ? '└─' : '├─';
        const lineStr = secret.line_number ? `L${secret.line_number}` : '';

        els.push(React.createElement(
          Box, { key: `s-${fi}-${si}` },
          React.createElement(Text, { color: 'gray' }, `    ${branch} `),
          React.createElement(Text, { color: 'gray' }, padEnd(lineStr, 6)),
          React.createElement(Text, { color: 'white' }, secret.type || ''),
        ));
      });

      els.push(React.createElement(Text, { key: `g-${fi}` }, ''));
    });
  }

  // ── Footer ──
  els.push(React.createElement(
    Text, { key: 'div2', color: 'gray', dimColor: true }, DIVIDER,
  ));

  // Coverage line
  const totalChanged = meta?.total_changed || 0;
  const scannedCount = meta?.scanned_files?.length || fileCount;
  if (totalChanged > 0) {
    const coverageColor = scannedCount === totalChanged ? 'green' : 'yellow';
    els.push(React.createElement(
      Text, { key: 'coverage', color: coverageColor },
      `Scanned ${scannedCount} of ${totalChanged} changed file${totalChanged !== 1 ? 's' : ''}`,
    ));
  } else if (fileCount) {
    els.push(React.createElement(
      Text, { key: 'coverage', color: 'gray' },
      `${fileCount} file${fileCount !== 1 ? 's' : ''} scanned`,
    ));
  }

  // Skipped files summary
  const skipped = meta?.skipped || [];
  if (skipped.length > 0) {
    const reasons = {};
    skipped.forEach(s => {
      const r = s.reason.split(' (')[0];
      reasons[r] = (reasons[r] || 0) + 1;
    });
    const parts = Object.entries(reasons).map(([r, n]) => `${n} ${r}`);
    els.push(React.createElement(
      Text, { key: 'skipped', color: 'gray', dimColor: true },
      `Skipped: ${parts.join(' · ')}`,
    ));
  }

  // Secret stats line
  if (allSecrets.length > 0) {
    els.push(React.createElement(
      Text, { key: 'stats', color: 'gray' },
      `${allSecrets.length} secret${allSecrets.length !== 1 ? 's' : ''} found`,
    ));
  }

  // Status line
  if (allSecrets.length > 0) {
    els.push(React.createElement(
      Text, { key: 'status', color: 'red', bold: true },
      `✗ ${allSecrets.length} secret${allSecrets.length !== 1 ? 's' : ''} found — remove before committing`,
    ));
  } else {
    els.push(React.createElement(
      Text, { key: 'status', color: 'green', bold: true },
      '✓ All clear',
    ));
  }

  return React.createElement(
    Box, { flexDirection: 'column', paddingX: 1, paddingY: 1 }, ...els,
  );
}


// ── Bypass Prompt ───────────────────────────────────────────────────────────

function BypassPrompt({ secrets, onSelect }) {
  const [selected, setSelected] = React.useState(0);
  const [mode, setMode] = React.useState('menu'); // 'menu' | 'typing'
  const [customReason, setCustomReason] = React.useState('');
  const allSecrets = secrets.flatMap(file =>
    file.secrets.map(s => ({ ...s, file_path: file.file_path }))
  );

  const options = [
    { label: "It's a false positive", value: 'false_positive' },
    { label: "It's used in tests", value: 'used_in_tests' },
    { label: "I'll fix it later", value: 'fix_later' },
    { label: 'Other (type your reason)', value: 'other' },
    { label: 'Cancel \u2014 block this push', value: 'cancel' },
  ];

  useInput((input, key) => {
    if (mode === 'menu') {
      if (key.upArrow) {
        setSelected(s => (s - 1 + options.length) % options.length);
      } else if (key.downArrow) {
        setSelected(s => (s + 1) % options.length);
      } else if (key.return) {
        if (options[selected].value === 'other') {
          setMode('typing');
        } else {
          onSelect(options[selected].value);
        }
      }
    } else {
      // typing mode
      if (key.return) {
        const reason = customReason.trim();
        if (reason) {
          onSelect('other:' + reason);
        }
      } else if (key.escape) {
        setMode('menu');
        setCustomReason('');
      } else if (key.backspace || key.delete) {
        setCustomReason(s => s.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setCustomReason(s => s + input);
      }
    }
  });

  const els = [];
  els.push(React.createElement(Text, { key: 'div-top', color: 'gray', dimColor: true }, DIVIDER));
  els.push(React.createElement(
    Text, { key: 'title', color: 'yellow', bold: true },
    `${allSecrets.length} secret(s) detected. Select an action:`,
  ));
  els.push(React.createElement(Text, { key: 'sp' }, ''));

  if (mode === 'menu') {
    options.forEach((opt, i) => {
      const prefix = i === selected ? '> ' : '  ';
      const color = i === selected ? 'cyan' : 'white';
      els.push(React.createElement(
        Text, { key: `opt-${i}`, color, bold: i === selected },
        `${prefix}${opt.label}`,
      ));
    });
  } else {
    els.push(React.createElement(Text, { key: 'typing-label', color: 'cyan' }, '  Type your reason (Enter to submit, Esc to go back):'));
    els.push(React.createElement(Text, { key: 'typing-sp' }, ''));
    els.push(React.createElement(
      Text, { key: 'typing-input', color: 'white' },
      `  > ${customReason}\u2588`,
    ));
  }

  els.push(React.createElement(Text, { key: 'sp2' }, ''));
  els.push(React.createElement(Text, { key: 'div-bot', color: 'gray', dimColor: true }, DIVIDER));

  return React.createElement(Box, { flexDirection: 'column', paddingX: 1, paddingY: 1 }, ...els);
}

export function renderBypassPrompt(secrets, onSelect) {
  return React.createElement(BypassPrompt, { secrets, onSelect });
}
