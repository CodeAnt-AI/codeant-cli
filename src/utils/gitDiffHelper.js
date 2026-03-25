import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * Expand untracked paths from `git status --porcelain`.
 * Git reports untracked directories as a single entry (e.g. "tests/"),
 * not the individual files inside. This helper resolves directory entries
 * into their individual file paths recursively.
 */
async function expandUntrackedPaths(gitRoot, paths) {
  const result = [];
  for (const p of paths) {
    const abs = path.resolve(gitRoot, p);
    try {
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        const entries = await fs.readdir(abs, { withFileTypes: true, recursive: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const entryPath = path.join(entry.parentPath || entry.path, entry.name);
            result.push(path.relative(gitRoot, entryPath));
          }
        }
      } else {
        result.push(p);
      }
    } catch {
      result.push(p);
    }
  }
  return result;
}

class GitDiffHelper {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.gitRoot = null;
    this.currentBranch = null;
    this.defaultBranch = null;
    this.baseCommit = null;
    this._headRef = null; // When set, getDiffInfoForFile reads head content from this git ref instead of disk
  }

  /**
   * Find the git root directory by traversing up from the workspace path
   */
  async findGitRoot(directory) {
    try {
      // First check current directory
      const files = await fs.readdir(directory);
      if (files.includes('.git')) {
        return directory;
      }

      // Traverse up to parent directories
      let currentDir = directory;
      while (currentDir !== path.dirname(currentDir)) {
        currentDir = path.dirname(currentDir);
        try {
          const parentFiles = await fs.readdir(currentDir);
          if (parentFiles.includes('.git')) {
            return currentDir;
          }
        } catch (err) {
          break;
        }
      }

      return null;
    } catch (error) {
      console.error(`Error finding git root: ${error.message}`);
      return null;
    }
  }

  /**
   * Initialize the helper: finds git root, current branch, default branch, and base commit
   */
  async init() {
    // Find git root
    this.gitRoot = await this.findGitRoot(this.workspacePath);
    if (!this.gitRoot) {
      throw new Error('Could not find a .git directory.');
    }

    try {
      // Try to fetch origin (silently fails if no remote)
      await this.fetchOrigin();
    } catch (err) {
      // No remote, continue anyway
    }

    try {
      // Get current branch
      const { stdout: branchName } = await execAsync(
        'git rev-parse --abbrev-ref HEAD',
        { cwd: this.gitRoot }
      );
      this.currentBranch = branchName.trim();
    } catch (err) {
      this.currentBranch = 'main';
    }

    // Determine default branch
    try {
      const { stdout: remoteBranch } = await execAsync(
        'git rev-parse --abbrev-ref origin/HEAD',
        { cwd: this.gitRoot }
      );
      this.defaultBranch = remoteBranch.trim().replace('origin/', '');
    } catch (err) {
      this.defaultBranch = 'main';
    }

    // Find merge base commit or fallback to HEAD
    try {
      const { stdout: mergeBase } = await execAsync(
        `git merge-base ${this.currentBranch} origin/${this.defaultBranch}`,
        { cwd: this.gitRoot }
      );
      this.baseCommit = mergeBase.trim();
    } catch (err) {
      // Fallback to HEAD if no merge base found
      try {
        const { stdout: head } = await execAsync(
          'git rev-parse HEAD',
          { cwd: this.gitRoot }
        );
        this.baseCommit = head.trim();
      } catch (headErr) {
        // No commits yet - set to empty tree
        this.baseCommit = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
      }
    }
  }

  async fetchOrigin() {
    try {
      await execAsync('git fetch origin', { cwd: this.gitRoot });
    } catch (err) {
      // Silently continue if fetch fails (e.g., offline)
    }
  }

  /**
   * Get all branches (local and remote)
   */
  async getAllBranches() {
    if (!this.gitRoot) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }

    const { stdout: branchesStr } = await execAsync(
      'git branch -a --format="%(refname:short)"',
      { cwd: this.gitRoot }
    );

    const branches = branchesStr
      .split('\n')
      .map(b => b.trim())
      .filter(Boolean)
      .map(b => b.replace('origin/', ''))
      .filter((value, index, self) => self.indexOf(value) === index);

    return branches;
  }

  /**
   * Get recent commits with metadata
   */
  async getRecentCommits(limit = 10) {
    if (!this.gitRoot) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }

    const { stdout: commitsStr } = await execAsync(
      `git log --pretty=format:"%H|%s|%an|%ar" -n ${limit}`,
      { cwd: this.gitRoot }
    );

    const commits = commitsStr
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [hash, message, author, date] = line.split('|');
        return { hash, message, author, date };
      });

    return commits;
  }

  /**
   * Get files changed since merge base
   */
  async getChangedFiles() {
    if (!this.gitRoot || !this.baseCommit) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }

    const cmd = [
      `git diff --name-only --diff-filter=ACMRD ${this.baseCommit}`,
      `git diff --name-only --cached --diff-filter=ACMRD`,
      `git ls-files --others --exclude-standard`
    ].join(' && ');

    const { stdout: changedFiles } = await execAsync(cmd, { cwd: this.gitRoot });

    const uniqueFiles = Array.from(new Set(
      changedFiles
        .split('\n')
        .map(f => f.trim())
        .filter(Boolean)
    ));

    return uniqueFiles;
  }

  /**
   * Get staged files only
   */
  async getStagedFiles() {
    if (!this.gitRoot) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }

    const { stdout: stagedFiles } = await execAsync(
      'git diff --name-only --cached',
      { cwd: this.gitRoot }
    );

    return stagedFiles
      .split('\n')
      .map(f => f.trim())
      .filter(Boolean);
  }

  /**
   * Get diff based on review configuration
   */
  async getDiffBasedOnReviewConfig(reviewConfig = null) {
    if (!this.gitRoot) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }

    const config = reviewConfig || {
      type: 'branch-diff',
      targetBranch: this.defaultBranch,
      commits: null
    };

    switch (config.type) {
      case 'branch-diff':
        return this.getAllDiffInfo();

      case 'last-commit':
        return this._getLastNCommitDiff(1);

      case 'last-n-commits':
        const n = config.commits || 1;
        return this._getLastNCommitDiff(n);

      case 'select-commits':
        if (!config.commits || config.commits.length === 0) {
          return [];
        }
        return this._getSpecificCommitsDiff(config.commits);

      case 'uncommitted':
        return this._getUncommittedChanges();

      case 'staged-only':
        return this._getStagedChanges();

      case 'committed':
        return this._getCommittedOnlyDiff();

      case 'all':
        return this._getAllChangesDiff();

      case 'base-branch':
        return this._getBaseBranchDiff(config.baseBranch);

      case 'base-commit':
        return this._getBaseCommitDiff(config.baseCommit);

      case 'unpushed':
        return this.getUnpushedChangesDiff();

      default:
        return this._getAllChangesDiff();
    }
  }

  async _getLastNCommitDiff(n) {
    if (!this.gitRoot) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }

    // Clamp n between 1 and 5
    n = Math.min(Math.max(1, n), 5);

    // First check if there are any commits
    try {
      await execAsync('git rev-parse HEAD', { cwd: this.gitRoot });
    } catch (err) {
      // No commits at all
      return [];
    }

    const originalBaseCommit = this.baseCommit;

    try {
      // Check if HEAD~n exists (more than n commits)
      await execAsync(`git rev-parse HEAD~${n}`, { cwd: this.gitRoot });

      const { stdout: changedFiles } = await execAsync(
        `git diff --name-only HEAD~${n} HEAD`,
        { cwd: this.gitRoot }
      );

      const files = changedFiles
        .split('\n')
        .map(f => f.trim())
        .filter(Boolean);

      if (files.length === 0) {
        return [];
      }

      this.baseCommit = `HEAD~${n}`;
      this._headRef = 'HEAD'; // Read file content from git HEAD, not working tree

      const diffs = await Promise.all(
        files.map(fp => this.getDiffInfoForFile(fp))
      );

      this.baseCommit = originalBaseCommit;
      this._headRef = null;
      return diffs.flat();
    } catch (err) {
      // HEAD~n doesn't exist - fewer than n commits, include all available
      try {
        const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        const { stdout: changedFiles } = await execAsync(
          `git diff --name-only ${emptyTree} HEAD`,
          { cwd: this.gitRoot }
        );

        const files = changedFiles
          .split('\n')
          .map(f => f.trim())
          .filter(Boolean);

        if (files.length === 0) {
          return [];
        }

        // Compare against empty tree to capture all commits
        this.baseCommit = emptyTree;
        this._headRef = 'HEAD'; // Read file content from git HEAD, not working tree

        const diffs = await Promise.all(
          files.map(fp => this.getDiffInfoForFile(fp))
        );

        this.baseCommit = originalBaseCommit;
        this._headRef = null;
        return diffs.flat();
      } catch (innerErr) {
        console.error('Error getting last commit diff:', innerErr.message);
        this.baseCommit = originalBaseCommit;
        this._headRef = null;
        return [];
      }
    }
  }

  async _getSpecificCommitsDiff(commitHashes) {
    const allDiffs = [];
    const originalBaseCommit = this.baseCommit;

    for (const hash of commitHashes) {
      try {
        const { stdout: changedFiles } = await execAsync(
          `git diff --name-only ${hash}~1 ${hash}`,
          { cwd: this.gitRoot }
        );

        const files = changedFiles
          .split('\n')
          .map(f => f.trim())
          .filter(Boolean);

        this.baseCommit = `${hash}~1`;
        this._headRef = hash; // Read file content from this commit, not working tree
        const commitDiffs = await Promise.all(
          files.map(fp => this.getDiffInfoForFile(fp))
        );

        allDiffs.push(...commitDiffs.flat());
      } catch (error) {
        console.error(`Error processing commit ${hash}:`, error.message);
      }
    }

    this.baseCommit = originalBaseCommit;
    this._headRef = null;
    return allDiffs;
  }

  async _getUncommittedChanges() {
    const { stdout: allModified } = await execAsync(
      'git status --porcelain',
      { cwd: this.gitRoot }
    );

    // Separate tracked vs untracked (??) files — untracked have no HEAD version so git diff skips them
    const trackedFiles = [];
    const untrackedFiles = [];
    for (const line of allModified.split('\n')) {
      if (!line.trim()) continue;
      const statusCode = line.substring(0, 2);
      const filePath = line.substring(3).trim();
      if (!filePath) continue;
      if (statusCode === '??') {
        untrackedFiles.push(filePath);
      } else {
        trackedFiles.push(filePath);
      }
    }

    // Expand untracked directory entries into individual files
    const expandedUntrackedFiles = await expandUntrackedPaths(this.gitRoot, untrackedFiles);

    const originalBaseCommit = this.baseCommit;
    this.baseCommit = 'HEAD';

    const diffs = [];

    // Handle tracked files via git diff
    for (const file of trackedFiles) {
      try {
        const { stdout: patchStr } = await execAsync(
          `git diff HEAD -- "${file}"`,
          { cwd: this.gitRoot }
        );

        if (patchStr) {
          const diffInfo = await this.getDiffInfoForFile(file);
          diffs.push(...diffInfo);
        }
      } catch (error) {
        // Skip files that can't be diffed
      }
    }

    // Handle untracked files by generating synthetic "new file" diffs since git diff can't see them
    for (const file of expandedUntrackedFiles) {
      try {
        const absolutePath = path.resolve(this.gitRoot, file);
        const content = await fs.readFile(absolutePath, 'utf8');
        const lines = content.split('\n');

        let patchStr = `diff --git a/${file} b/${file}\n`;
        patchStr += `new file mode 100644\n`;
        patchStr += `index 0000000..${this._generateRandomHash()}\n`;
        patchStr += `--- /dev/null\n`;
        patchStr += `+++ b/${file}\n`;
        patchStr += `@@ -0,0 +1,${lines.length} @@\n`;
        lines.forEach(line => { patchStr += `+${line}\n`; });

        diffs.push({
          base_file_str: '',
          head_file_str: content,
          patch_str: patchStr,
          filename_str: file,
          edit_type_str: 'ADDED',
          old_filename_str: null,
          num_plus_lines_str: String(lines.length),
          num_minus_lines_str: '0',
          tokens_str: String(content.split(/\s+/).length),
          start_line_str: '1',
          end_line_str: String(lines.length),
        });
      } catch (error) {
        // Skip files that can't be read
      }
    }

    this.baseCommit = originalBaseCommit;
    return diffs;
  }

  async _getStagedChanges() {
    const { stdout: stagedFiles } = await execAsync(
      'git diff --name-only --cached HEAD',
      { cwd: this.gitRoot }
    );

    const files = stagedFiles
      .split('\n')
      .map(f => f.trim())
      .filter(Boolean);

    const diffs = [];
    const originalBaseCommit = this.baseCommit;

    for (const file of files) {
      try {
        this.baseCommit = 'HEAD';
        const diffInfo = await this.getDiffInfoForFile(file);
        diffs.push(...diffInfo);
      } catch (error) {
        console.error(`Error processing staged file ${file}:`, error.message);
      }
    }

    this.baseCommit = originalBaseCommit;
    return diffs;
  }

  /**
   * Get diff against a specific base branch.
   * Finds the merge-base between the given branch and HEAD, then diffs from there.
   */
  async _getBaseBranchDiff(branch) {
    if (!this.gitRoot) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }
    if (!branch) {
      throw new Error('Base branch is required for base-branch diff.');
    }

    // Resolve the branch ref (try with and without origin/ prefix)
    let resolvedRef;
    for (const candidate of [branch, `origin/${branch}`]) {
      try {
        const { stdout } = await execAsync(`git rev-parse ${candidate}`, { cwd: this.gitRoot });
        resolvedRef = stdout.trim();
        break;
      } catch (err) {
        // try next
      }
    }

    if (!resolvedRef) {
      throw new Error(`Could not resolve branch: ${branch}`);
    }

    // Find merge-base between the branch and HEAD
    let base;
    try {
      const { stdout } = await execAsync(`git merge-base ${resolvedRef} HEAD`, { cwd: this.gitRoot });
      base = stdout.trim();
    } catch (err) {
      // If no merge-base, use the resolved ref directly
      base = resolvedRef;
    }

    const { stdout: changedFiles } = await execAsync(
      `git diff --name-only ${base} HEAD`,
      { cwd: this.gitRoot }
    );

    const files = changedFiles.split('\n').map(f => f.trim()).filter(Boolean);
    if (files.length === 0) return [];

    const originalBaseCommit = this.baseCommit;
    try {
      this.baseCommit = base;
      this._headRef = 'HEAD';

      const diffs = await Promise.all(
        files.map(fp => this.getDiffInfoForFile(fp))
      );
      return diffs.flat();
    } finally {
      this.baseCommit = originalBaseCommit;
      this._headRef = null;
    }
  }

  /**
   * Get diff against a specific base commit.
   * Diffs from the given commit to HEAD.
   */
  async _getBaseCommitDiff(commit) {
    if (!this.gitRoot) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }
    if (!commit) {
      throw new Error('Base commit is required for base-commit diff.');
    }

    // Resolve the commit ref (supports HEAD~3, sha, tag, etc.)
    let resolvedCommit;
    try {
      const { stdout } = await execAsync(`git rev-parse ${commit}`, { cwd: this.gitRoot });
      resolvedCommit = stdout.trim();
    } catch (err) {
      throw new Error(`Could not resolve commit: ${commit}`);
    }

    const { stdout: changedFiles } = await execAsync(
      `git diff --name-only ${resolvedCommit} HEAD`,
      { cwd: this.gitRoot }
    );

    const files = changedFiles.split('\n').map(f => f.trim()).filter(Boolean);
    if (files.length === 0) return [];

    const originalBaseCommit = this.baseCommit;
    try {
      this.baseCommit = resolvedCommit;
      this._headRef = 'HEAD';

      const diffs = await Promise.all(
        files.map(fp => this.getDiffInfoForFile(fp))
      );
      return diffs.flat();
    } finally {
      this.baseCommit = originalBaseCommit;
      this._headRef = null;
    }
  }

  /**
   * Get diff of only committed (unpushed) changes — no working tree modifications.
   * Compares upstream..HEAD using git refs so the working tree is ignored.
   */
  async _getCommittedOnlyDiff() {
    if (!this.gitRoot) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }

    const upstream = await this._resolveUpstream();
    if (!upstream) {
      // No upstream found — fall back to empty (nothing to compare against)
      return [];
    }

    // Check if there are any unpushed commits
    try {
      const { stdout: commitCount } = await execAsync(
        `git rev-list --count ${upstream}..HEAD`,
        { cwd: this.gitRoot }
      );
      if (parseInt(commitCount.trim(), 10) === 0) {
        return [];
      }
    } catch (err) {
      return [];
    }

    const { stdout: changedFiles } = await execAsync(
      `git diff --name-only ${upstream}..HEAD`,
      { cwd: this.gitRoot }
    );

    const files = changedFiles.split('\n').map(f => f.trim()).filter(Boolean);
    if (files.length === 0) return [];

    const originalBaseCommit = this.baseCommit;
    try {
      const { stdout: upstreamCommit } = await execAsync(
        `git rev-parse ${upstream}`,
        { cwd: this.gitRoot }
      );
      this.baseCommit = upstreamCommit.trim();
      this._headRef = 'HEAD';

      const diffs = await Promise.all(
        files.map(fp => this.getDiffInfoForFile(fp))
      );
      return diffs.flat();
    } finally {
      this.baseCommit = originalBaseCommit;
      this._headRef = null;
    }
  }

  /**
   * Get all changes: committed (unpushed) + uncommitted (staged + unstaged + untracked).
   * Equivalent to CodeRabbit's --type all.
   */
  async _getAllChangesDiff() {
    if (!this.gitRoot) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }

    const upstream = await this._resolveUpstream();

    if (!upstream) {
      // No upstream — just return uncommitted changes
      return this._getUncommittedChanges();
    }

    // Get files changed in unpushed commits
    let committedFiles = [];
    try {
      const { stdout } = await execAsync(
        `git diff --name-only ${upstream}..HEAD`,
        { cwd: this.gitRoot }
      );
      committedFiles = stdout.split('\n').map(f => f.trim()).filter(Boolean);
    } catch (err) {
      // ignore
    }

    // Get uncommitted files (staged + unstaged + untracked)
    const { stdout: porcelain } = await execAsync(
      'git status --porcelain',
      { cwd: this.gitRoot }
    );
    const uncommittedFiles = [];
    const untrackedFiles = [];
    for (const line of porcelain.split('\n')) {
      if (!line.trim()) continue;
      const statusCode = line.substring(0, 2);
      const filePath = line.substring(3).trim();
      if (!filePath) continue;
      if (statusCode === '??') {
        untrackedFiles.push(filePath);
      } else {
        uncommittedFiles.push(filePath);
      }
    }

    // Expand untracked directory entries into individual files
    const expandedUntrackedFiles = await expandUntrackedPaths(this.gitRoot, untrackedFiles);

    // Combine all unique file paths
    const allFiles = Array.from(new Set([...committedFiles, ...uncommittedFiles]));

    if (allFiles.length === 0 && expandedUntrackedFiles.length === 0) {
      return [];
    }

    const diffs = [];
    const originalBaseCommit = this.baseCommit;

    try {
      // For tracked files, diff against upstream
      const { stdout: upstreamCommit } = await execAsync(
        `git rev-parse ${upstream}`,
        { cwd: this.gitRoot }
      );
      this.baseCommit = upstreamCommit.trim();

      for (const file of allFiles) {
        try {
          const diffInfo = await this.getDiffInfoForFile(file);
          diffs.push(...diffInfo);
        } catch (err) {
          // skip
        }
      }

      // Handle untracked files with synthetic diffs
      for (const file of expandedUntrackedFiles) {
        try {
          const absolutePath = path.resolve(this.gitRoot, file);
          const content = await fs.readFile(absolutePath, 'utf8');
          const lines = content.split('\n');

          let patchStr = `diff --git a/${file} b/${file}\n`;
          patchStr += `new file mode 100644\n`;
          patchStr += `index 0000000..${this._generateRandomHash()}\n`;
          patchStr += `--- /dev/null\n`;
          patchStr += `+++ b/${file}\n`;
          patchStr += `@@ -0,0 +1,${lines.length} @@\n`;
          lines.forEach(line => { patchStr += `+${line}\n`; });

          diffs.push({
            base_file_str: '',
            head_file_str: content,
            patch_str: patchStr,
            filename_str: file,
            edit_type_str: 'ADDED',
            old_filename_str: null,
            num_plus_lines_str: String(lines.length),
            num_minus_lines_str: '0',
            tokens_str: String(content.split(/\s+/).length),
            start_line_str: '1',
            end_line_str: String(lines.length),
          });
        } catch (err) {
          // skip
        }
      }
    } finally {
      this.baseCommit = originalBaseCommit;
    }

    return diffs;
  }

  /**
   * Resolve the upstream ref for the current branch.
   * Returns null if no upstream can be determined.
   */
  async _resolveUpstream() {
    try {
      const { stdout } = await execAsync(
        'git rev-parse --abbrev-ref --symbolic-full-name @{u}',
        { cwd: this.gitRoot }
      );
      return stdout.trim();
    } catch (err) {
      // No tracking branch — try origin/<current-branch>
    }

    try {
      const { stdout: currentBranch } = await execAsync(
        'git rev-parse --abbrev-ref HEAD',
        { cwd: this.gitRoot }
      );
      const { stdout: remoteBranches } = await execAsync(
        'git branch -r',
        { cwd: this.gitRoot }
      );
      if (remoteBranches.includes(`origin/${currentBranch.trim()}`)) {
        return `origin/${currentBranch.trim()}`;
      }
    } catch (err) {
      // ignore
    }

    // Fall back to origin/main or origin/master
    for (const branch of ['origin/main', 'origin/master']) {
      try {
        await execAsync(`git rev-parse ${branch}`, { cwd: this.gitRoot });
        return branch;
      } catch (err) {
        // try next
      }
    }

    return null;
  }

  async getUnpushedChangesDiff() {
    if (!this.gitRoot) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }

    try {
      const { stdout: currentBranchRaw } = await execAsync(
        'git rev-parse --abbrev-ref HEAD',
        { cwd: this.gitRoot }
      );
      const currentBranch = currentBranchRaw.trim();

      let upstream = null;

      try {
        const { stdout: upstreamRaw } = await execAsync(
          'git rev-parse --abbrev-ref --symbolic-full-name @{u}',
          { cwd: this.gitRoot }
        );
        upstream = upstreamRaw.trim();
      } catch (upstreamError) {
        // Try to find remote branch
        try {
          const { stdout: remoteBranches } = await execAsync(
            'git branch -r',
            { cwd: this.gitRoot }
          );

          if (remoteBranches.includes(`origin/${currentBranch}`)) {
            upstream = `origin/${currentBranch}`;
          }
        } catch (error) {
          // Ignore
        }

        if (!upstream) {
          const defaultBranches = ['origin/main', 'origin/master'];
          for (const branch of defaultBranches) {
            try {
              await execAsync(`git rev-parse ${branch}`, { cwd: this.gitRoot });
              upstream = branch;
              break;
            } catch (e) {
              // Try next
            }
          }
        }
      }

      if (!upstream) {
        return this._getUncommittedChanges();
      }

      // Get unpushed files
      const { stdout: unpushedFiles } = await execAsync(
        `git diff --name-only ${upstream}..HEAD`,
        { cwd: this.gitRoot }
      );
      const unpushedFilesList = unpushedFiles.split('\n').map(f => f.trim()).filter(Boolean);

      // Get staged files
      const { stdout: stagedFiles } = await execAsync(
        'git diff --name-only --cached',
        { cwd: this.gitRoot }
      );
      const stagedFilesList = stagedFiles.split('\n').map(f => f.trim()).filter(Boolean);

      // Get unstaged files
      const { stdout: unstagedFiles } = await execAsync(
        'git diff --name-only',
        { cwd: this.gitRoot }
      );
      const unstagedFilesList = unstagedFiles.split('\n').map(f => f.trim()).filter(Boolean);

      // Combine and deduplicate
      const uniqueFiles = Array.from(new Set([
        ...unpushedFilesList,
        ...stagedFilesList,
        ...unstagedFilesList
      ]));

      if (uniqueFiles.length === 0) {
        return [];
      }

      const originalBaseCommit = this.baseCommit;
      try {
        const { stdout: upstreamCommit } = await execAsync(
          `git rev-parse ${upstream}`,
          { cwd: this.gitRoot }
        );
        this.baseCommit = upstreamCommit.trim();

        const diffs = await Promise.all(
          uniqueFiles.map(fp => this.getDiffInfoForFile(fp))
        );

        return diffs.flat();
      } finally {
        this.baseCommit = originalBaseCommit;
      }
    } catch (error) {
      console.error('Error getting unpushed changes:', error.message);
      return this._getUncommittedChanges();
    }
  }

  async getUnpushedCommits() {
    if (!this.gitRoot) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }

    try {
      let upstream;
      try {
        const { stdout } = await execAsync(
          'git rev-parse --abbrev-ref --symbolic-full-name @{u}',
          { cwd: this.gitRoot }
        );
        upstream = stdout.trim();
      } catch (error) {
        // Find alternative upstream
        const { stdout: currentBranch } = await execAsync(
          'git rev-parse --abbrev-ref HEAD',
          { cwd: this.gitRoot }
        );

        const { stdout: remoteBranches } = await execAsync(
          `git ls-remote --heads origin ${currentBranch.trim()}`,
          { cwd: this.gitRoot }
        );

        if (remoteBranches.trim()) {
          upstream = `origin/${currentBranch.trim()}`;
        } else {
          upstream = 'origin/main';
        }
      }

      const { stdout: commitsStr } = await execAsync(
        `git log ${upstream}..HEAD --pretty=format:"%H|%s|%an|%ar"`,
        { cwd: this.gitRoot }
      );

      if (!commitsStr.trim()) {
        return [];
      }

      return commitsStr
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const [hash, message, author, date] = line.split('|');
          return { hash, message, author, date };
        });
    } catch (error) {
      console.error('Error getting unpushed commits:', error.message);
      return [];
    }
  }

  _generateRandomHash() {
    return Math.random().toString(36).substring(2, 9) + Math.random().toString(36).substring(2, 9);
  }

  async getFileDiff(filePath) {
    if (!this.gitRoot || !this.baseCommit) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }

    let diff = '';

    try {
      await execAsync(`git ls-files --error-unmatch "${filePath}"`, {
        cwd: this.gitRoot,
      });

      const { stdout } = await execAsync(
        `git diff ${this.baseCommit} -- "${filePath}"`,
        { cwd: this.gitRoot }
      );
      diff = stdout;
    } catch (err) {
      // Handle untracked files
      try {
        const absoluteFilePath = path.resolve(this.gitRoot, filePath);
        const headFileStr = await fs.readFile(absoluteFilePath, 'utf8');
        const lines = headFileStr.split('\n');

        let patchStr = `diff --git a/${filePath} b/${filePath}\n`;
        patchStr += `new file mode 100644\n`;
        patchStr += `index 0000000..${this._generateRandomHash()}\n`;
        patchStr += `--- /dev/null\n`;
        patchStr += `+++ b/${filePath}\n`;
        patchStr += `@@ -0,0 +1,${lines.length} @@\n`;

        lines.forEach(line => {
          patchStr += `+${line}\n`;
        });

        diff = patchStr;
      } catch (manualDiffError) {
        diff = '';
      }
    }

    return diff;
  }

  async getAllDiffs() {
    if (!this.gitRoot || !this.baseCommit) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }

    const { stdout: fullDiff } = await execAsync(
      `git diff ${this.baseCommit}`,
      { cwd: this.gitRoot }
    );

    return fullDiff;
  }

  async getDiffInfoForFile(filePath) {
    if (!this.gitRoot || !this.baseCommit) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }

    // Get base and head file contents
    const baseFileStr = await execAsync(
      `git show ${this.baseCommit}:"${filePath}"`,
      { cwd: this.gitRoot }
    ).then(r => r.stdout).catch(() => '');

    // For commit-based diffs (e.g. last-commit, last-n-commits), read head from git
    // to avoid mismatch if the working tree has diverged.
    // For working-tree diffs (uncommitted, staged), read from disk.
    let headFileStr;
    if (this._headRef) {
      headFileStr = await execAsync(
        `git show ${this._headRef}:"${filePath}"`,
        { cwd: this.gitRoot }
      ).then(r => r.stdout).catch(() => '');
    } else {
      headFileStr = await fs.readFile(
        path.join(this.gitRoot, filePath), 'utf8'
      ).catch(() => '');
    }

    // Get patch
    const patchStr = await this.getFileDiff(filePath);

    // Get file status
    const { stdout: nameStatus } = await execAsync(
      `git diff --name-status ${this.baseCommit} -- "${filePath}"`,
      { cwd: this.gitRoot }
    ).catch(() => ({ stdout: '' }));

    let editTypeStr = 'MODIFIED';
    let oldFilenameStr = null;
    let filenameStr = filePath;

    if (nameStatus.trim()) {
      const [statusCode, oldName, newName] = nameStatus.trim().split(/\t+/);
      if (statusCode.startsWith('A')) editTypeStr = 'ADDED';
      else if (statusCode.startsWith('D')) editTypeStr = 'DELETED';
      else if (statusCode.startsWith('R')) {
        editTypeStr = 'RENAMED';
        oldFilenameStr = oldName;
        filenameStr = newName;
      }
    }

    // Get line counts
    let numPlusLinesStr = '0', numMinusLinesStr = '0';
    try {
      const { stdout: ns } = await execAsync(
        `git diff --numstat ${this.baseCommit} -- "${filePath}"`,
        { cwd: this.gitRoot }
      );
      if (ns.trim()) [numPlusLinesStr, numMinusLinesStr] = ns.split('\t');
    } catch (_) { /* ignore */ }

    const tokensStr = headFileStr ? String(headFileStr.split(/\s+/).length) : '0';

    // Parse hunks
    const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
    const results = [];
    let headerMatch;

    while ((headerMatch = hunkHeader.exec(patchStr)) !== null) {
      const newStart = Number(headerMatch[1]);
      const newCount = headerMatch[2] ? Number(headerMatch[2]) : 1;
      const hunkStartIdx = headerMatch.index;

      const nextHeaderIdx = patchStr.slice(hunkHeader.lastIndex).search(/^@@/m);
      const hunkEndIdx = nextHeaderIdx === -1
        ? patchStr.length
        : hunkHeader.lastIndex + nextHeaderIdx;
      const singleHunkPatch = patchStr.slice(hunkStartIdx, hunkEndIdx);

      results.push({
        base_file_str: baseFileStr,
        head_file_str: headFileStr,
        patch_str: singleHunkPatch,
        filename_str: filenameStr,
        edit_type_str: editTypeStr,
        old_filename_str: oldFilenameStr,
        num_plus_lines_str: numPlusLinesStr,
        num_minus_lines_str: numMinusLinesStr,
        tokens_str: tokensStr,
        start_line_str: String(newStart),
        end_line_str: String(newStart + newCount - 1),
      });
    }

    // If no hunks, return single item
    if (results.length === 0) {
      results.push({
        base_file_str: baseFileStr,
        head_file_str: headFileStr,
        patch_str: patchStr,
        filename_str: filenameStr,
        edit_type_str: editTypeStr,
        old_filename_str: oldFilenameStr,
        num_plus_lines_str: numPlusLinesStr,
        num_minus_lines_str: numMinusLinesStr,
        tokens_str: tokensStr,
        start_line_str: '',
        end_line_str: '',
      });
    }

    return results;
  }

  getLocalBranch() {
    if (!this.currentBranch) {
      throw new Error('GitDiffHelper not initialized. Call init() first.');
    }
    return this.currentBranch;
  }

  getGitRoot() {
    return this.gitRoot;
  }

  async getAllDiffInfo() {
    const changedFiles = await this.getChangedFiles();

    const perFileHunks = await Promise.all(
      changedFiles.map(fp => this.getDiffInfoForFile(fp))
    );

    return perFileHunks.flat();
  }
}

export default GitDiffHelper;
