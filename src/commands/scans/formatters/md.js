const SEV_EMOJI = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: '⚪', unknown: '⚫' };

export default {
  name: 'md',
  mime: 'text/markdown',
  extension: '.md',
  render(envelope) {
    const { findings = [], repo, scan, summary, generated_at, errors = [] } = envelope;
    const lines = [];

    lines.push(`# CodeAnt Scan Results`);
    lines.push('');
    lines.push(`**Repo:** \`${repo}\``);
    if (scan) {
      lines.push(`**Branch:** \`${scan.branch || 'unknown'}\`  `);
      lines.push(`**Commit:** \`${scan.commit_id || 'unknown'}\`  `);
    }
    lines.push(`**Generated:** ${generated_at}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Severity | Count |`);
    lines.push(`|----------|-------|`);
    for (const [sev, count] of Object.entries(summary.by_severity || {})) {
      if (count > 0) {
        lines.push(`| ${SEV_EMOJI[sev] || ''} ${sev} | ${count} |`);
      }
    }
    lines.push('');

    if (errors.length > 0) {
      lines.push('## Errors');
      lines.push('');
      for (const e of errors) {
        lines.push(`- **${e.category}**: ${e.error}`);
      }
      lines.push('');
    }

    if (findings.length === 0) {
      lines.push('*No findings.*');
      return lines.join('\n');
    }

    lines.push('## Findings');
    lines.push('');
    lines.push('| Severity | Category | File | Line | Check | Message |');
    lines.push('|----------|----------|------|------|-------|---------|');

    for (const f of findings) {
      const sev = `${SEV_EMOJI[f.severity] || ''} ${f.severity}`;
      const file = f.file_path;
      const line = f.line_number;
      const check = f.check_id || f.check_name || '';
      const msg = (f.message || '').replace(/\|/g, '\\|').slice(0, 120);
      lines.push(`| ${sev} | ${f.category} | \`${file}\` | ${line} | \`${check}\` | ${msg} |`);
    }

    return lines.join('\n');
  },
};
