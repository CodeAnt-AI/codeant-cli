import { minimatch } from 'minimatch';
import { normalizeSeverity } from './normalize.js';

/**
 * Apply client-side filters to findings (returns new array).
 * Dismissed / false-positive filtering is handled exclusively by the backend.
 *
 * @param {Array} findings - NormalizedFinding[]
 * @param {object} opts
 * @param {string[]|null} opts.severity   - allowed severity levels (e.g. ['critical','high'])
 * @param {string|null}   opts.pathGlob   - minimatch glob for file_path
 * @param {string|null}   opts.checkRegex - regex applied to check_id + check_name
 * @returns {Array} filtered NormalizedFinding[]
 */
export function applyFilters(findings, {
  severity = null,
  pathGlob = null,
  checkRegex = null,
} = {}) {
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

  const sevSet = severity && severity.length > 0
    ? new Set(severity.map((s) => normalizeSeverity(s)))
    : null;

  const result = [];
  for (const f of findings) {
    if (sevSet && !sevSet.has(f.severity)) continue;
    if (pathGlob && !minimatch(f.file_path, pathGlob, { matchBase: true })) continue;
    if (checkRe && !checkRe.test(f.check_id) && !checkRe.test(f.check_name)) continue;
    result.push(f);
  }
  return result;
}
