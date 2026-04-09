import GitDiffHelper from './gitDiffHelper.js';

/**
 * Common base class for API helpers that transform git diff data
 * Contains shared functionality for filtering and retrieving files
 */
class CommonApiHelper {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.gitHelper = new GitDiffHelper(workspacePath);
  }

  async init() {
    await this.gitHelper.init();
  }

  /**
   * Get staged files formatted for the API
   * This is used for pre-commit hooks
   */
  async getStagedFilesForApi() {
    const diffs = await this.gitHelper.getDiffBasedOnReviewConfig({ type: 'staged-only' });
    return this._transformDiffsToApiFormat(diffs);
  }

  /**
   * Get all changed files formatted for the API
   */
  async getChangedFilesForApi() {
    const diffs = await this.gitHelper.getDiffBasedOnReviewConfig({ type: 'branch-diff' });
    return this._transformDiffsToApiFormat(diffs);
  }

  /**
   * Get uncommitted files formatted for the API
   */
  async getUncommittedFilesForApi() {
    const diffs = await this.gitHelper.getDiffBasedOnReviewConfig({ type: 'uncommitted' });
    return this._transformDiffsToApiFormat(diffs);
  }

  /**
   * Get last commit files formatted for the API
   */
  async getLastCommitFilesForApi() {
    const diffs = await this.gitHelper.getDiffBasedOnReviewConfig({ type: 'last-commit' });
    return this._transformDiffsToApiFormat(diffs);
  }

  /**
   * Get last n commits files formatted for the API
   * @param {number} n - Number of commits to include
   */
  async getLastNCommitsFilesForApi(n = 1) {
    const diffs = await this.gitHelper.getDiffBasedOnReviewConfig({
      type: 'last-n-commits',
      commits: n
    });

    return this._transformDiffsToApiFormat(diffs);
  }

  /**
   * Get specific selected commits formatted for the API
   * @param {string[]} commits - Array of commit hashes to include
   */
  async getSelectCommitsFilesForApi(commits = []) {
    const diffs = await this.gitHelper.getDiffBasedOnReviewConfig({
      type: 'select-commits',
      commits,
    });

    return this._transformDiffsToApiFormat(diffs);
  }

  /**
   * Transform diff info array to API format
   * Must be implemented by subclasses
   */
  _transformDiffsToApiFormat(diffs) {
    throw new Error('_transformDiffsToApiFormat must be implemented by subclass');
  }


  /**
   * Get committed (unpushed) files formatted for the API
   */
  async getCommittedFilesForApi() {
    const diffs = await this.gitHelper.getDiffBasedOnReviewConfig({ type: 'committed' });
    return this._transformDiffsToApiFormat(diffs);
  }

  /**
   * Get all changes (committed + uncommitted) formatted for the API
   */
  async getAllChangesForApi() {
    const diffs = await this.gitHelper.getDiffBasedOnReviewConfig({ type: 'all' });
    return this._transformDiffsToApiFormat(diffs);
  }

  /**
   * Get diff against a specific base branch formatted for the API
   */
  async getBaseBranchDiffForApi(branch) {
    const diffs = await this.gitHelper.getDiffBasedOnReviewConfig({ type: 'base-branch', baseBranch: branch });
    return this._transformDiffsToApiFormat(diffs);
  }

  /**
   * Get diff against a specific base commit formatted for the API
   */
  async getBaseCommitDiffForApi(commit) {
    const diffs = await this.gitHelper.getDiffBasedOnReviewConfig({ type: 'base-commit', baseCommit: commit });
    return this._transformDiffsToApiFormat(diffs);
  }

  /**
   * Get files based on scan type
   * Returns the raw array - child classes handle filtering and wrapping
   * @param {string} type - Type of scan (staged-only, branch-diff, etc.)
   * @param {Object} options - Additional options
   * @param {number} options.lastNCommits - Number of commits for last-n-commits type
   * @param {string} options.baseBranch - Base branch for base-branch type
   * @param {string} options.baseCommit - Base commit for base-commit type
   */
  async getFilesForType(type = 'all', options = {}) {
    switch (type) {
      case 'staged-only':
        return await this.getStagedFilesForApi();
      case 'branch-diff':
        return await this.getChangedFilesForApi();
      case 'uncommitted':
        return await this.getUncommittedFilesForApi();
      case 'committed':
        return await this.getCommittedFilesForApi();
      case 'all':
        return await this.getAllChangesForApi();
      case 'last-commit':
        return await this.getLastCommitFilesForApi();
      case 'last-n-commits':
        return await this.getLastNCommitsFilesForApi(options.lastNCommits || 1);
      case 'select-commits':
        return await this.getSelectCommitsFilesForApi(options.selectedCommits || []);
      case 'base-branch':
        return await this.getBaseBranchDiffForApi(options.baseBranch);
      case 'base-commit':
        return await this.getBaseCommitDiffForApi(options.baseCommit);
      default:
        return await this.getAllChangesForApi();
    }
  }

  getGitRoot() {
    return this.gitHelper.getGitRoot();
  }
}

export default CommonApiHelper;