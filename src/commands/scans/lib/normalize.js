import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../../../../package.json');

const SEV_MAP = {
  critical: 'critical', blocker: 'critical', p0: 'critical',
  high: 'high', error: 'high', major: 'high',
  medium: 'medium', warning: 'medium', moderate: 'medium', p2: 'medium',
  low: 'low', note: 'low', minor: 'low', p3: 'low',
  info: 'info', informational: 'info', information: 'info', p4: 'info',
};

export function normalizeSeverity(raw) {
  if (!raw) return 'unknown';
  return SEV_MAP[String(raw).toLowerCase()] ?? 'unknown';
}

/** Stable djb2-variant hash → 4-char hex suffix for finding IDs. */
function shortHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).slice(0, 4);
}

/**
 * Build a stable finding ID: category:file_path:line:check_id:hash
 */
function buildId(category, filePath, lineNumber, checkId, message) {
  const hash = shortHash(`${filePath}:${lineNumber}:${checkId}:${message}`);
  return `${category}:${filePath}:${lineNumber}:${checkId || 'nocheck'}:${hash}`;
}

/**
 * Normalize a raw issue (from any fetcher) into a NormalizedFinding.
 *
 * @param {object} issue   - raw issue from fetcher
 * @param {string} category - category key (e.g. 'sast')
 * @returns {object} NormalizedFinding
 */
export function normalizeIssue(issue, category) {
  if (!issue) return null;

  const filePath = issue.file_path || 'unknown';
  const lineNumber = issue.line_number || issue.start_line || issue.line || 1;
  const lineRange = issue.file_line_range || issue.line_range || [lineNumber];
  const checkId = issue.check_id || issue.test_id || issue.rule_id || issue.vulnerability_id || issue.cve_id || '';
  const checkName = issue.check_name || issue.issue_text || issue.message || issue.description || issue.name || '';
  const message = issue.message || issue.issue_text || issue.description || checkName || '';
  const severity = normalizeSeverity(issue.severity);

  // Package info for sca/sbom
  let packageInfo = null;
  if (category === 'sca' || category === 'sbom') {
    const name = issue.package_name || issue.name || null;
    if (name) {
      packageInfo = {
        name,
        version: issue.version || issue.package_version || null,
        ecosystem: issue.ecosystem || issue.package_manager || null,
      };
    }
  }

  // CWE / CVE
  const cwe = issue.cwe || issue.cwe_id || null;
  const cve = issue.cve || issue.cve_id || issue.vulnerability_id || null;

  // Category-specific metadata
  const metadata = {};
  if (category === 'iac') {
    if (issue.guideline) metadata.guideline = issue.guideline;
    if (issue.resource) metadata.resource = issue.resource;
  } else if (category === 'sast' || category === 'anti_patterns') {
    if (issue.issue_confidence) metadata.confidence = issue.issue_confidence;
    if (issue.issue_type || issue.test_type) metadata.issue_type = issue.issue_type || issue.test_type;
  } else if (category === 'secrets') {
    if (issue.type || issue.secret_type) metadata.secret_type = issue.type || issue.secret_type;
    if (issue.confidence_score) metadata.confidence_score = issue.confidence_score;
  } else if (category === 'dead_code') {
    if (issue.type) metadata.type = issue.type;
    if (issue.confidence) metadata.confidence = issue.confidence;
  } else if (category === 'complex_functions') {
    if (issue.complexity !== undefined) metadata.complexity = issue.complexity;
  } else if (category === 'sca') {
    if (issue.cvss_score !== undefined) metadata.cvss_score = issue.cvss_score;
    if (issue.fix_version) metadata.fix_version = issue.fix_version;
  }

  const id = buildId(category, filePath, lineNumber, checkId, message);

  return {
    id,
    category,
    severity,
    file_path: filePath,
    line_number: lineNumber,
    line_range: Array.isArray(lineRange) ? lineRange : [lineNumber],
    check_id: checkId,
    check_name: checkName,
    message,
    rule_id: checkId,
    cwe: cwe ? String(cwe) : null,
    cve: cve ? String(cve) : null,
    package: packageInfo,
    metadata,
    dismissed: false,
    dismiss_info: null,
  };
}

/** Build the outer envelope object. */
export function buildEnvelope({
  repo,
  scan,
  categories,
  findings,
  pagination,
  filters,
  errors,
}) {
  const total = pagination.total;
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0, unknown: 0 };
  const byCategory = {};

  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  }
  // summary uses all findings (pre-pagination)
  // recalculate from pre-pagination total
  const allSeverity = { ...bySeverity };
  const allCategory = { ...byCategory };

  return {
    schema_version: '1.0',
    tool: 'codeant-cli',
    tool_version: pkg.version,
    generated_at: new Date().toISOString(),
    repo,
    scan,
    categories,
    summary: {
      total,
      by_severity: allSeverity,
      by_category: allCategory,
    },
    pagination,
    filters,
    errors,
    findings,
  };
}
