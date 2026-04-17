import { fetchApi } from '../utils/fetchApi.js';

export const ADVANCED_RESULT_TYPES = {
  SCA: 'sca',
  SBOM: 'sbom',
  SECRETS: 'secrets',
  IAC: 'iac',
  DEAD_CODE: 'dead_code',
};

const EXTRA_DEAD_CODE_MESSAGES = {
  S1481: 'Unused local variable',
  S1854: 'Unused assignment',
  S1172: 'Unused function parameter',
  S1144: 'Unused private method',
  S1763: 'Unreachable code',
  S5603: 'Unused scope-limited definition',
  S3985: 'Unused private nested class',
  S1128: 'Unnecessary import',
};

/**
 * Strip /mnt/lambda/code/.../commitId/ prefix from a full Lambda path.
 */
function extractRelativeFilePath(fullPath) {
  if (!fullPath) return fullPath;
  const match = fullPath.match(/\/([a-f0-9]{40})\//i);
  if (match) {
    const idx = fullPath.indexOf(match[1]);
    return fullPath.substring(idx + match[1].length + 1);
  }
  return fullPath;
}

function cleanLeadingSlash(p) {
  return typeof p === 'string' && p.startsWith('/') ? p.slice(1) : (p || 'unknown');
}

/**
 * Flatten the dead_code nested structure into a flat array of issues.
 */
function flattenDeadCode(deadCodeData) {
  if (!deadCodeData || typeof deadCodeData !== 'object' || Array.isArray(deadCodeData)) {
    return deadCodeData;
  }

  const hasNestedKeys =
    deadCodeData.python_dead_code !== undefined ||
    deadCodeData.js_dead_code !== undefined ||
    deadCodeData.extra_dead_code !== undefined;

  if (!hasNestedKeys) return deadCodeData;

  const flat = [];

  // Python dead code
  (deadCodeData.python_dead_code || []).forEach((item) => {
    if (!item) return;
    const filePath = extractRelativeFilePath(item.file_path || item.path || 'unknown');
    (item.issues || []).forEach((issue) => {
      if (!issue) return;
      const typeMatch = issue.issue?.match(/unused (\w+)/i);
      const issueType = typeMatch ? typeMatch[1] : 'code';
      const nameMatch = issue.issue?.match(/'([^']*)'/);
      const name = nameMatch ? nameMatch[1] : '';
      const confMatch = issue.issue?.match(/\((\d+)% confidence\)/);
      flat.push({
        file_path: filePath,
        line_number: issue.line_number || 0,
        issue_text: issue.issue || `Unused ${issueType}: ${name}`,
        message: issue.issue || `Unused ${issueType}: ${name}`,
        severity: 'warning',
        type: `unused_${issueType}`,
        name,
        confidence: confMatch ? confMatch[1] : '90',
        check_name: `Unused ${issueType}: ${name}`,
      });
    });
  });

  // JS dead code — unused files
  const jsDeadCode = deadCodeData.js_dead_code || {};
  (jsDeadCode.unused_files || []).forEach((filePath) => {
    if (!filePath) return;
    flat.push({
      file_path: extractRelativeFilePath(cleanLeadingSlash(filePath)),
      line_number: 1,
      issue_text: 'Unused file - this file is not imported anywhere',
      message: 'Unused file - this file is not imported anywhere',
      severity: 'warning',
      type: 'unused_file',
      check_name: 'Unused file',
    });
  });

  // JS dead code — unused exports
  (jsDeadCode.unused_exports || []).forEach((exportData) => {
    if (!Array.isArray(exportData) || exportData.length !== 2) return;
    let [filePath, exportIssues] = exportData;
    if (!filePath || !Array.isArray(exportIssues)) return;
    filePath = extractRelativeFilePath(cleanLeadingSlash(filePath));
    exportIssues.forEach((exp) => {
      if (!exp) return;
      flat.push({
        file_path: filePath,
        line_number: exp.line || 0,
        issue_text: `Unused export: ${exp.name || 'unknown'}`,
        message: `Unused export: ${exp.name || 'unknown'}`,
        severity: 'warning',
        type: 'unused_export',
        name: exp.name,
        check_name: `Unused export: ${exp.name || 'unknown'}`,
      });
    });
  });

  // Extra dead code (Sonar-style rules)
  const extra = deadCodeData.extra_dead_code?.results || deadCodeData.extra_dead_code || {};
  if (typeof extra === 'object' && !Array.isArray(extra)) {
    Object.entries(extra).forEach(([filePath, issues]) => {
      if (!filePath || !Array.isArray(issues)) return;
      issues.forEach((issue) => {
        if (!issue) return;
        const messageId = issue['message-id'] || '';
        const msgKey = messageId.includes(':') ? messageId.split(':')[1] : messageId;
        flat.push({
          file_path: extractRelativeFilePath(filePath),
          line_number: issue.line_number || 0,
          issue_text: issue.issue_text || EXTRA_DEAD_CODE_MESSAGES[msgKey] || 'Dead code detected',
          message: issue.issue_text || EXTRA_DEAD_CODE_MESSAGES[msgKey] || 'Dead code detected',
          severity: 'warning',
          type: msgKey || 'dead_code',
          rule_id: msgKey,
          confidence: issue.confidence || '90',
          check_name: EXTRA_DEAD_CODE_MESSAGES[msgKey] || 'Dead code detected',
        });
      });
    });
  }

  return flat;
}

/**
 * Normalize a single advanced issue to a consistent shape.
 */
function normalizeAdvancedIssue(item, resultType) {
  if (!item) {
    return { file_path: 'unknown', line_number: 1, file_line_range: [1], check_name: 'Unknown issue', severity: 'medium' };
  }

  const normalized = { ...item };
  normalized.file_path = extractRelativeFilePath(item.file_path || item.path || item.filename || 'unknown');
  normalized.line_number = item.line_number || item.start_line || item.line || 1;
  normalized.file_line_range = [normalized.line_number];

  switch (resultType) {
    case ADVANCED_RESULT_TYPES.SCA:
      normalized.check_name =
        item.vulnerability_id || item.cve_id || item.advisory_id ||
        (item.package_name ? `Vulnerability in ${item.package_name}` : null) ||
        item.title || item.description || 'Package vulnerability detected';
      normalized.severity = item.severity || 'medium';
      break;
    case ADVANCED_RESULT_TYPES.SBOM:
      normalized.check_name = item.package_name
        ? `${item.package_name}${item.version ? '@' + item.version : ''}`
        : (item.name || item.description || 'Software component');
      normalized.severity = item.severity || 'info';
      break;
    case ADVANCED_RESULT_TYPES.SECRETS:
      normalized.check_name =
        item.type || item.secret_type || item.rule_id || item.description || 'Secret detected';
      normalized.severity = item.severity || 'high';
      break;
    case ADVANCED_RESULT_TYPES.IAC:
      normalized.check_name =
        item.check_id || item.rule_id || item.policy_id ||
        item.description || item.title || 'Infrastructure misconfiguration';
      normalized.severity = item.severity || 'medium';
      break;
    case ADVANCED_RESULT_TYPES.DEAD_CODE:
      normalized.check_name =
        item.name || item.function_name || item.symbol_name || item.description || 'Unused code detected';
      normalized.severity = item.severity || 'low';
      break;
    default:
      normalized.check_name = item.description || item.message || item.name || 'Issue detected';
  }

  return normalized;
}

/**
 * Fetch advanced scan results (SCA, SBOM, secrets, IaC, dead code).
 *
 * @param {string} repo       - "org/repo-name"
 * @param {string} commitId   - 40-char commit SHA
 * @param {string} resultType - one of ADVANCED_RESULT_TYPES values
 * @returns {Promise<{ success: boolean, issues?: Array, healthyPackages?: Array, status?: string, error?: string }>}
 */
export async function fetchAdvancedScanResults(repo, commitId, resultType) {
  if (!Object.values(ADVANCED_RESULT_TYPES).includes(resultType)) {
    return {
      success: false,
      error: `Invalid result_type. Must be one of: ${Object.values(ADVANCED_RESULT_TYPES).join(', ')}`,
    };
  }

  try {
    const response = await fetchApi('/extension/scans2/fetch-advanced-results', 'POST', {
      repo,
      commit_id: commitId,
      result_type: resultType,
    });

    if (!response) {
      return { success: false, error: 'Failed to connect to CodeAnt server' };
    }

    if (response.status === 'error') {
      return { success: false, error: response.message || `Failed to fetch ${resultType} results` };
    }

    let resultsData;
    let healthyPackages = [];

    if (resultType === ADVANCED_RESULT_TYPES.SECRETS) {
      resultsData = response.secrets;
    } else if (resultType === ADVANCED_RESULT_TYPES.DEAD_CODE) {
      resultsData = flattenDeadCode(response.dead_code);
    } else if (resultType === ADVANCED_RESULT_TYPES.SCA) {
      const scaResults = response.results;
      if (scaResults && typeof scaResults === 'object' && !Array.isArray(scaResults) && scaResults.all_vulnerabilities !== undefined) {
        resultsData = scaResults.all_vulnerabilities || [];
        healthyPackages = scaResults.healthy_packages || [];
      } else {
        resultsData = scaResults;
      }
    } else if (resultType === ADVANCED_RESULT_TYPES.IAC) {
      const iacData = response.results || response.result;
      if (Array.isArray(iacData)) {
        const valid = iacData.filter(Boolean);
        const hasNested = valid.some((item) => item?.results && Array.isArray(item.results.failed_checks));
        if (hasNested) {
          const flat = [];
          valid.forEach((resultItem) => {
            (resultItem?.results?.failed_checks || []).forEach((check) => {
              if (!check) return;
              const fp = cleanLeadingSlash(extractRelativeFilePath(check.file_path || 'unknown'));
              flat.push({
                file_path: fp,
                line_number: check.file_line_range?.[0] || 1,
                file_line_range: check.file_line_range || [1],
                check_id: check.check_id || '',
                check_name: check.check_name || 'Infrastructure misconfiguration',
                issue_text: check.check_name || 'Infrastructure misconfiguration',
                message: check.check_name || 'Infrastructure misconfiguration',
                severity: check.severity || 'medium',
                guideline: check.guideline || '',
                code_block: check.code_block || [],
                resource: check.resource || '',
              });
            });
          });
          resultsData = flat;
        } else {
          resultsData = valid;
        }
      } else {
        resultsData = iacData;
      }
    } else {
      resultsData = response.results;
    }

    // Normalize to array
    let issues = [];
    if (Array.isArray(resultsData)) {
      issues = resultsData.filter(Boolean).map((item) => normalizeAdvancedIssue(item, resultType));
    } else if (resultsData && typeof resultsData === 'object') {
      for (const [filePath, fileItems] of Object.entries(resultsData)) {
        if (!filePath) continue;
        if (Array.isArray(fileItems)) {
          fileItems.forEach((item) => {
            if (item) issues.push(normalizeAdvancedIssue({ ...item, file_path: filePath }, resultType));
          });
        } else if (fileItems && typeof fileItems === 'object') {
          issues.push(normalizeAdvancedIssue({ ...fileItems, file_path: filePath }, resultType));
        }
      }
    }

    // Filter secrets false positives
    if (resultType === ADVANCED_RESULT_TYPES.SECRETS) {
      issues = issues.filter((issue) => issue.confidence_score?.toLowerCase() !== 'false_positive');
    }

    if (resultType === ADVANCED_RESULT_TYPES.SCA) {
      return { success: true, issues, healthyPackages, status: response.status || 'done' };
    }

    return { success: true, issues, status: response.status || 'done' };
  } catch (error) {
    return { success: false, error: error.message || `Failed to fetch ${resultType} results` };
  }
}

export const fetchScaResults = (repo, commitId) =>
  fetchAdvancedScanResults(repo, commitId, ADVANCED_RESULT_TYPES.SCA);

export const fetchSbomResults = (repo, commitId) =>
  fetchAdvancedScanResults(repo, commitId, ADVANCED_RESULT_TYPES.SBOM);

export const fetchSecretsResults = (repo, commitId) =>
  fetchAdvancedScanResults(repo, commitId, ADVANCED_RESULT_TYPES.SECRETS);

export const fetchIacResults = (repo, commitId) =>
  fetchAdvancedScanResults(repo, commitId, ADVANCED_RESULT_TYPES.IAC);

export const fetchDeadCodeResults = (repo, commitId) =>
  fetchAdvancedScanResults(repo, commitId, ADVANCED_RESULT_TYPES.DEAD_CODE);
