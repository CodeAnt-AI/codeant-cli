import SecretsApiHelper from './utils/secretsApiHelper.js';
import { detectSecrets } from './utils/secretsDetector.js';

/**
 * Headless secrets scanner — no React/Ink, no network, returns plain JSON.
 *
 * Detection runs locally against the same file set as `codeant secrets`.
 * Unlike the interactive command it never reports to the push-protection
 * endpoints. Secret values are masked by the detector.
 *
 * @param {Object} options
 * @param {string}  options.workspacePath  - Absolute path to the repo/workspace
 * @param {string}  [options.scanType='all'] - all|committed|uncommitted|staged-only|last-commit|last-n-commits|base-branch|base-commit
 * @param {string[]} [options.include=[]]  - Glob patterns to include
 * @param {string[]} [options.exclude=[]]  - Glob patterns to exclude
 * @param {number}  [options.lastNCommits=1]
 * @param {string}  [options.baseBranch]
 * @param {string}  [options.baseCommit]
 * @returns {Promise<{findings: Array, total: number, meta: Object|null, noFiles: boolean}>}
 */
export async function runSecretsHeadless(options = {}) {
  const {
    workspacePath,
    scanType = 'all',
    include = [],
    exclude = [],
    lastNCommits = 1,
    baseBranch = null,
    baseCommit = null,
  } = options;

  const helper = new SecretsApiHelper(workspacePath);
  await helper.init();
  const requestBody = await helper.buildSecretsApiRequest(scanType, include, exclude, { lastNCommits, baseBranch, baseCommit });

  const meta = requestBody._meta || null;
  if (requestBody.files.length === 0) {
    return { findings: [], total: 0, meta, noFiles: true };
  }

  const findings = detectSecrets(requestBody.files).filter((file) => file.secrets && file.secrets.length > 0);
  const total = findings.reduce((n, file) => n + file.secrets.length, 0);

  return { findings, total, meta, noFiles: false };
}
