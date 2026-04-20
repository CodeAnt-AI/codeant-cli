import { minimatch } from 'minimatch';
import { isDismissed, findDismissMatch } from './dismissMatch.js';
import { normalizeSeverity } from './normalize.js';

const SEV_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1, unknown: 0 };

/**
 * Apply all filters to findings in-place (returns new array).
 *
 * @param {Array} findings - NormalizedFinding[]
 * @param {object} opts
 * @param {string[]|null} opts.severity  - allowed severity levels (e.g. ['critical','high'])
 * @param {string|null}   opts.pathGlob  - minimatch glob for file_path
 * @param {string|null}   opts.checkRegex - regex applied to check_id + check_name
 * @param {Array}         opts.dismissedAlerts - from fetchDismissedAlerts()
 * @param {boolean}       opts.includeDismissed
 * @returns {Array} filtered NormalizedFinding[] (dismissed field annotated)
 */
export function applyFilters(findings, {
  severity = null,
  pathGlob = null,
  checkRegex = null,
  dismissedAlerts = [],
  includeDismissed = false,
} = {}) {
  // Pre-compile regex — strip Python/PCRE inline flag (?i) and fold into JS flag
  let checkRe = null;
  if (checkRegex) {
    try {
      let pattern = checkRegex;
      if (pattern.startsWith('(?i)')) pattern = pattern.slice(4);
      checkRe = new RegExp(pattern, 'i');
    } catch {
      const err = new Error(`Invalid --check regex: ${checkRegex}`);
      err.exitCode = 1;
      throw err;
    }
  }

  // Severity set
  const sevSet = severity && severity.length > 0
    ? new Set(severity.map((s) => normalizeSeverity(s)))
    : null;

  const result = [];
  for (const f of findings) {
    // Annotate dismiss status
    const match = findDismissMatch(f, dismissedAlerts);
    f.dismissed = match !== null;
    if (match) {
      f.dismiss_info = {
        reason: match.reason_for_dismiss || null,
        comment: match.comment_for_dismiss || null,
      };
    }

    // Filter dismissed
    if (f.dismissed && !includeDismissed) continue;

    // Filter by severity
    if (sevSet && !sevSet.has(f.severity)) continue;

    // Filter by path glob
    if (pathGlob && !minimatch(f.file_path, pathGlob, { matchBase: true })) continue;

    // Filter by check regex
    if (checkRe && !checkRe.test(f.check_id) && !checkRe.test(f.check_name)) continue;

    result.push(f);
  }
  return result;
}
