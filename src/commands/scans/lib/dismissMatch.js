/**
 * Determine if a NormalizedFinding matches any entry in dismissedAlerts.
 *
 * Dismiss key format: "file_path||::||context_code_block_or_line||::||test_id_or_type"
 *
 * @param {object} finding - NormalizedFinding
 * @param {Array}  dismissedAlerts - from fetchDismissedAlerts()
 * @returns {object|null} matching dismiss entry, or null
 */
export function findDismissMatch(finding, dismissedAlerts) {
  if (!dismissedAlerts || dismissedAlerts.length === 0) return null;

  for (const d of dismissedAlerts) {
    // File path must match (tail-match to handle prefix stripping differences)
    const fp = finding.file_path ?? '';
    const dfp = d.file_path ?? '';
    if (dfp && fp && !fp.endsWith(dfp) && !dfp.endsWith(fp) && fp !== dfp) continue;

    // test_id / type must match check_id when present
    if (d.test_id && finding.check_id && d.test_id !== finding.check_id) continue;

    // Line number match when available (secrets format uses line_number as part1)
    if (d.line_number && finding.line_number && d.line_number !== finding.line_number) continue;

    return d;
  }
  return null;
}

export function isDismissed(finding, dismissedAlerts) {
  return findDismissMatch(finding, dismissedAlerts) !== null;
}
