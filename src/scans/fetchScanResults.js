import { fetchApi } from '../utils/fetchApi.js';

export const VALID_RESULT_TYPES = {
  SECURITY_ISSUES: 'security_issues',
  ANTI_PATTERNS: 'anti_patterns',
  DOCSTRING: 'docstring',
  COMPLEX_FUNCTIONS: 'complex_functions',
};

const RESULT_FILE_SUFFIXES = {
  security_issues: '/security_issues.json',
  anti_patterns: '/anti_patterns.json',
  docstring: '/docstring.json',
  complex_functions: '/complex_functions.json',
};

/**
 * Strip org/repo/commitId prefix from a full server-side path.
 *
 * @param {string} fullPath
 * @param {string} commitId
 * @param {string|null} suffix - e.g. '/security_issues.json'
 */
function extractCleanPath(fullPath, commitId, suffix = null) {
  let p = fullPath;

  if (suffix && p.endsWith(suffix)) {
    p = p.slice(0, -suffix.length);
  }

  if (commitId && p.includes(commitId)) {
    const idx = p.indexOf(commitId);
    return p.substring(idx + commitId.length + 1);
  }

  const match = p.match(/\/([a-f0-9]{40})\//i);
  if (match) {
    const idx = p.indexOf(match[1]);
    return p.substring(idx + match[1].length + 1);
  }

  const parts = p.split('/');
  return parts.length > 3 ? parts.slice(3).join('/') : p;
}

/**
 * Fetch scan results (SAST, anti-patterns, docstring, complex-functions).
 *
 * @param {string} repo      - "org/repo-name"
 * @param {string} commitId  - 40-char commit SHA
 * @param {string} resultType - one of VALID_RESULT_TYPES values
 * @param {{ filterDismissed?: boolean, includeFalsePositives?: boolean }} [opts]
 * @returns {Promise<{ success: boolean, issues?: Array, status?: string, error?: string }>}
 */
export async function fetchScanResults(repo, commitId, resultType, opts = {}) {
  const { filterDismissed = false, includeFalsePositives = true } = opts;

  if (!Object.values(VALID_RESULT_TYPES).includes(resultType)) {
    return {
      success: false,
      error: `Invalid result_type. Must be one of: ${Object.values(VALID_RESULT_TYPES).join(', ')}`,
    };
  }

  try {
    const response = await fetchApi('/extension/scans2/fetch-results', 'POST', {
      repo,
      commit_id: commitId,
      result_type: resultType,
      filter_dismissed: filterDismissed,
      include_false_positives: includeFalsePositives,
    });

    if (!response) {
      return { success: false, error: 'Failed to connect to CodeAnt server' };
    }

    if (response.status === 'error') {
      return { success: false, error: response.message || `Failed to fetch ${resultType} results` };
    }

    const fileSuffix = RESULT_FILE_SUFFIXES[resultType] || '';
    const resultsData = response.results || response;
    const issues = [];

    if (Array.isArray(resultsData)) {
      issues.push(...resultsData);
    } else if (resultsData && typeof resultsData === 'object') {
      for (const [fullPath, fileIssues] of Object.entries(resultsData)) {
        if (!Array.isArray(fileIssues) || fileIssues.length === 0) continue;

        const cleanPath = extractCleanPath(fullPath, commitId, fileSuffix);
        for (const issue of fileIssues) {
          issues.push({
            ...issue,
            file_path: cleanPath,
            file_line_range: [issue.line_number || issue.start_line || issue.line || 1],
            check_name: issue.issue_text || issue.message || issue.description || issue.name,
          });
        }
      }
    }

    return { success: true, issues, status: response.status || 'done' };
  } catch (error) {
    return { success: false, error: error.message || `Failed to fetch ${resultType} results` };
  }
}

export const fetchSastResults = (repo, commitId, opts) =>
  fetchScanResults(repo, commitId, VALID_RESULT_TYPES.SECURITY_ISSUES, opts);

export const fetchAntiPatternsResults = (repo, commitId, opts) =>
  fetchScanResults(repo, commitId, VALID_RESULT_TYPES.ANTI_PATTERNS, opts);

export const fetchDocstringResults = (repo, commitId, opts) =>
  fetchScanResults(repo, commitId, VALID_RESULT_TYPES.DOCSTRING, opts);

export const fetchComplexFunctionsResults = (repo, commitId, opts) =>
  fetchScanResults(repo, commitId, VALID_RESULT_TYPES.COMPLEX_FUNCTIONS, opts);
