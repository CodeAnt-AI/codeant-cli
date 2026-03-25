import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

// ── Constants ────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const DIVIDER = '─'.repeat(55);
const STEPS = ['Init', 'Fetch', 'Analyze', 'Reflect'];

const SEVERITY_COLORS = {
  BLOCKER: 'red',
  CRITICAL: 'red',
  MAJOR: 'yellow',
  MINOR: 'cyan',
  INFO: 'gray',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function mapLabelToSeverity(label) {
  const mapping = {
    'security': 'CRITICAL',
    'performance': 'MAJOR',
    'maintainability': 'MINOR',
    'code quality': 'MINOR',
    'best practice': 'MINOR',
    'bug': 'MAJOR',
  };
  // Guard against non-string labels from model output to avoid runtime crash
  if (typeof label !== 'string') return 'MINOR';
  return mapping[label.toLowerCase().replace(/[^\w\s]/g, '')] || 'MINOR';
}

function getSeverityColor(sev) {
  return SEVERITY_COLORS[sev] || 'gray';
}

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

function ReviewLoading({ message, step, startTime, meta }) {
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

  // Show file list and coverage info when we have metadata (during analyze/reflect)
  if (meta && step >= 2) {
    const reviewed = meta.reviewed_files || [];
    const total = meta.total_changed || 0;
    const skipped = meta.skipped || [];

    els.push(React.createElement(Text, { key: 'meta-sp' }, ''));
    els.push(React.createElement(
      Text, { key: 'meta-hdr', color: 'gray', dimColor: true }, DIVIDER,
    ));

    // Coverage line
    if (total > 0) {
      const coverageColor = reviewed.length === total ? 'green' : 'yellow';
      els.push(React.createElement(
        Text, { key: 'coverage', color: coverageColor },
        `Reviewing ${reviewed.length} of ${total} changed file${total !== 1 ? 's' : ''}`,
      ));
    }

    // File list
    if (reviewed.length > 0) {
      els.push(React.createElement(Text, { key: 'files-sp' }, ''));
      reviewed.forEach((file, i) => {
        const isLast = i === reviewed.length - 1;
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
      // Group skip reasons
      const reasons = {};
      skipped.forEach(s => {
        const r = s.reason.split(' (')[0]; // normalize "too large (1234 lines...)" → "too large"
        reasons[r] = (reasons[r] || 0) + 1;
      });
      const parts = Object.entries(reasons).map(([r, n]) => `${n} ${r}`);
      els.push(React.createElement(
        Text, { key: 'skipped', color: 'gray', dimColor: true },
        `Skipped: ${parts.join(' · ')}`,
      ));
    }

    // Cap warning
    if (meta.capped) {
      els.push(React.createElement(
        Text, { key: 'cap', color: 'yellow', dimColor: true },
        `Note: max ${meta.max_files} files per review`,
      ));
    }
  }

  return React.createElement(
    Box, { flexDirection: 'column', paddingX: 1, paddingY: 1 }, ...els,
  );
}

// ── Public Render Functions ──────────────────────────────────────────────────

export function renderInitializing(startTime) {
  return React.createElement(ReviewLoading, {
    message: 'Initializing...',
    step: 0,
    startTime,
  });
}

export function renderFetchingDiff(startTime) {
  return React.createElement(ReviewLoading, {
    message: 'Fetching changes...',
    step: 1,
    startTime,
  });
}

export function renderReviewing(currentMessage, startTime, meta) {
  const step = currentMessage?.toLowerCase().includes('reflector') ? 3 : 2;
  return React.createElement(ReviewLoading, {
    message: currentMessage || 'Analyzing code...',
    step,
    startTime,
    meta,
  });
}

export function renderNoFiles(scanType, lastNCommits) {
  const hints = {
    'staged-only': 'Stage some changes first with "git add".',
    'branch-diff': 'No changes found compared to the base branch.',
    'uncommitted': 'No uncommitted changes found.',
    'last-commit': 'No files found in the last commit.',
    'last-n-commits': `No changes found in the last ${lastNCommits} commit(s).`,
    'all': 'No changes found between your branch and the base.',
    'committed': 'No unpushed commits found.',
  };
  return React.createElement(
    Box, { flexDirection: 'column', paddingX: 1, paddingY: 1 },
    React.createElement(Text, { color: 'cyan', bold: true }, 'CodeAnt Review'),
    React.createElement(Text, { color: 'gray', dimColor: true }, DIVIDER),
    React.createElement(Text, {}, ''),
    React.createElement(Text, { color: 'yellow' }, '  No changes to review.'),
    React.createElement(Text, { color: 'gray' }, `  ${hints[scanType] || 'No files found.'}`),
    React.createElement(Text, {}, ''),
  );
}

export function renderError(error) {
  return React.createElement(
    Box, { flexDirection: 'column', paddingX: 1, paddingY: 1 },
    React.createElement(Text, { color: 'cyan', bold: true }, 'CodeAnt Review'),
    React.createElement(Text, { color: 'gray', dimColor: true }, DIVIDER),
    React.createElement(Text, {}, ''),
    React.createElement(Text, { color: 'red', bold: true }, `  ✗ ${error}`),
    React.createElement(Text, {}, ''),
  );
}

export function renderNotLoggedIn() {
  return React.createElement(
    Box, { flexDirection: 'column', paddingX: 1, paddingY: 1 },
    React.createElement(Text, { color: 'cyan', bold: true }, 'CodeAnt Review'),
    React.createElement(Text, { color: 'gray', dimColor: true }, DIVIDER),
    React.createElement(Text, {}, ''),
    React.createElement(Text, { color: 'red', bold: true }, '  ✗ Not logged in'),
    React.createElement(Text, { color: 'gray' }, '  Run "codeant login" to authenticate.'),
    React.createElement(Text, {}, ''),
  );
}

export function renderDone(issues, summary, failOn, startTime, fileCount, meta) {
  const severityOrder = ['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER'];
  const failOnIndex = severityOrder.indexOf(failOn);

  if (failOnIndex === -1) {
    return React.createElement(
      Box, { flexDirection: 'column', paddingX: 1, paddingY: 1 },
      React.createElement(Text, { color: 'red', bold: true }, `✗ Invalid failOn value: ${failOn}`),
    );
  }

  const blockingIssues = issues.filter(i =>
    severityOrder.indexOf(mapLabelToSeverity(i.label)) >= failOnIndex
  );
  const hasBlocking = blockingIssues.length > 0;
  const elapsed = startTime ? formatElapsed(startTime) : null;

  // Count by severity
  const counts = {};
  issues.forEach(i => {
    const sev = mapLabelToSeverity(i.label);
    counts[sev] = (counts[sev] || 0) + 1;
  });

  // Group issues by file
  const grouped = {};
  issues.forEach(i => {
    const file = i.relevant_file || 'Unknown';
    (grouped[file] ??= []).push(i);
  });
  const sortedFiles = Object.keys(grouped).sort();
  sortedFiles.forEach(f =>
    grouped[f].sort((a, b) => (a.start_line || 0) - (b.start_line || 0))
  );

  const els = [];

  // ── Header ──
  els.push(React.createElement(
    Box, { key: 'hdr', gap: 1 },
    React.createElement(Text, { color: 'cyan', bold: true }, 'CodeAnt Review'),
    elapsed && React.createElement(Text, { color: 'gray' }, elapsed),
  ));
  els.push(React.createElement(
    Text, { key: 'div1', color: 'gray', dimColor: true }, DIVIDER,
  ));

  if (issues.length === 0) {
    // ── Clean pass ──
    els.push(React.createElement(Text, { key: 'sp' }, ''));
    els.push(React.createElement(
      Text, { key: 'ok', color: 'green', bold: true }, '  ✓ No issues found',
    ));
    els.push(React.createElement(Text, { key: 'sp2' }, ''));
  } else {
    // ── Issues grouped by file ──
    els.push(React.createElement(Text, { key: 'sp1' }, ''));

    sortedFiles.forEach((file, fi) => {
      const fileIssues = grouped[file];

      els.push(React.createElement(
        Text, { key: `f-${fi}`, color: 'white', bold: true }, `  ${file}`,
      ));

      fileIssues.forEach((issue, ii) => {
        const sev = mapLabelToSeverity(issue.label);
        const sevColor = getSeverityColor(sev);
        const isLast = ii === fileIssues.length - 1;
        const branch = isLast ? '└─' : '├─';
        const cont = isLast ? '  ' : '│ ';
        const lineStr = issue.start_line ? `L${issue.start_line}` : '';

        els.push(React.createElement(
          Box, { key: `i-${fi}-${ii}` },
          React.createElement(Text, { color: 'gray' }, `    ${branch} `),
          React.createElement(Text, {
            color: sevColor,
            bold: sev === 'CRITICAL' || sev === 'BLOCKER',
          }, padEnd(sev, 9)),
          React.createElement(Text, { color: 'gray' }, padEnd(lineStr, 6)),
          React.createElement(Text, { color: 'white', dimColor: true }, issue.label),
        ));

        // Safely coerce issue_content — API may return null/non-string, which would crash .trim()
        const content = String(issue.issue_content || '').trim();
        if (content) {
          els.push(React.createElement(
            Text, { key: `d-${fi}-${ii}`, color: 'gray' },
            `    ${cont}   ${content}`,
          ));
        }
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
  const reviewedCount = meta?.reviewed_files?.length || fileCount;
  if (totalChanged > 0) {
    const coverageColor = reviewedCount === totalChanged ? 'green' : 'yellow';
    els.push(React.createElement(
      Text, { key: 'coverage', color: coverageColor },
      `Reviewed ${reviewedCount} of ${totalChanged} changed file${totalChanged !== 1 ? 's' : ''}`,
    ));
  } else if (fileCount) {
    els.push(React.createElement(
      Text, { key: 'coverage', color: 'gray' },
      `${fileCount} file${fileCount !== 1 ? 's' : ''} reviewed`,
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

  if (meta?.capped) {
    els.push(React.createElement(
      Text, { key: 'cap', color: 'yellow', dimColor: true },
      `Note: max ${meta.max_files} files per review`,
    ));
  }

  // Issue stats line
  const stats = [];
  if (issues.length > 0) {
    stats.push(`${issues.length} issue${issues.length !== 1 ? 's' : ''}`);
    for (const sev of ['CRITICAL', 'MAJOR', 'MINOR', 'INFO']) {
      if (counts[sev]) stats.push(`${counts[sev]} ${sev.toLowerCase()}`);
    }
    els.push(React.createElement(
      Text, { key: 'stats', color: 'gray' }, stats.join('  ·  '),
    ));
  }

  // Status line
  if (hasBlocking) {
    els.push(React.createElement(
      Text, { key: 'status', color: 'red', bold: true },
      `✗ ${blockingIssues.length} blocking issue${blockingIssues.length !== 1 ? 's' : ''} — fix before proceeding`,
    ));
  } else if (issues.length > 0) {
    els.push(React.createElement(
      Text, { key: 'status', color: 'green', bold: true },
      '✓ All issues are non-blocking',
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
