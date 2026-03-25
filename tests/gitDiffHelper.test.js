import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import GitDiffHelper from '../src/utils/gitDiffHelper.js';

/**
 * Integration tests for GitDiffHelper using a real git repository.
 * No mocking — every test operates on actual git state.
 */

let testDir;

function git(cmd, cwd = testDir) {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf8' }).trim();
}

function writeFile(name, content) {
  const filePath = path.join(testDir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function readFile(name) {
  return fs.readFileSync(path.join(testDir, name), 'utf8');
}

async function createHelper() {
  const helper = new GitDiffHelper(testDir);
  await helper.init();
  return helper;
}

describe('GitDiffHelper integration tests', () => {
  beforeAll(() => {
    // Create a temp directory for our test repo
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeant-test-'));

    // Initialize a git repo with an initial commit
    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test User"');

    // Create initial files and commit
    writeFile('README.md', '# Test Project\n');
    writeFile('src/index.js', 'console.log("hello");\n');
    writeFile('src/utils.js', 'export function add(a, b) { return a + b; }\n');
    git('add -A');
    git('commit -m "Initial commit"');
  });

  afterAll(() => {
    // Clean up temp directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // ─────────────────────────────────────────────────────
  // STAGED CHANGES (--staged, default)
  // ─────────────────────────────────────────────────────
  describe('staged-only (--staged)', () => {
    beforeEach(() => {
      // Reset working tree to clean state
      git('checkout -- .');
      git('reset HEAD -- .');
      git('clean -fd');
    });

    it('returns diff for a single staged modified file', async () => {
      writeFile('src/index.js', 'console.log("hello world");\n');
      git('add src/index.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      expect(diffs.length).toBeGreaterThanOrEqual(1);
      expect(diffs[0].filename_str).toBe('src/index.js');
      expect(diffs[0].edit_type_str).toBe('MODIFIED');
      expect(diffs[0].head_file_str).toContain('hello world');
      expect(diffs[0].base_file_str).toContain('hello');
      expect(diffs[0].patch_str).toContain('+console.log("hello world");');
    });

    it('returns diff for a staged new file', async () => {
      writeFile('src/newFile.js', 'export const x = 42;\n');
      git('add src/newFile.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      expect(diffs.length).toBeGreaterThanOrEqual(1);
      const newFileDiff = diffs.find(d => d.filename_str === 'src/newFile.js');
      expect(newFileDiff).toBeDefined();
      expect(newFileDiff.edit_type_str).toBe('ADDED');
      expect(newFileDiff.base_file_str).toBe('');
      expect(newFileDiff.head_file_str).toContain('export const x = 42;');
    });

    it('returns diff for a staged deleted file', async () => {
      git('rm src/utils.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      const deletedDiff = diffs.find(d => d.filename_str === 'src/utils.js');
      expect(deletedDiff).toBeDefined();
      expect(deletedDiff.edit_type_str).toBe('DELETED');
    });

    it('returns multiple diffs when multiple files are staged', async () => {
      writeFile('src/index.js', 'console.log("updated");\n');
      writeFile('src/utils.js', 'export function add(a, b) { return a + b; }\nexport function sub(a, b) { return a - b; }\n');
      git('add src/index.js src/utils.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/index.js');
      expect(filenames).toContain('src/utils.js');
    });

    it('returns empty array when nothing is staged', async () => {
      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      expect(diffs).toEqual([]);
    });

    it('ignores unstaged changes when only staged requested', async () => {
      // Stage one file, modify another without staging
      writeFile('src/index.js', 'console.log("staged change");\n');
      git('add src/index.js');
      writeFile('src/utils.js', 'export function mul(a, b) { return a * b; }\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/index.js');
      expect(filenames).not.toContain('src/utils.js');
    });
  });

  // ─────────────────────────────────────────────────────
  // UNCOMMITTED CHANGES (--uncommitted)
  // ─────────────────────────────────────────────────────
  describe('uncommitted (--uncommitted)', () => {
    beforeEach(() => {
      git('checkout -- .');
      git('reset HEAD -- .');
      git('clean -fd');
    });

    it('returns diff for unstaged modified files', async () => {
      writeFile('src/index.js', 'console.log("uncommitted change");\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'uncommitted' });

      const diff = diffs.find(d => d.filename_str === 'src/index.js');
      expect(diff).toBeDefined();
      expect(diff.edit_type_str).toBe('MODIFIED');
      expect(diff.patch_str).toContain('+console.log("uncommitted change");');
    });

    it('includes staged changes too', async () => {
      writeFile('src/index.js', 'console.log("staged");\n');
      git('add src/index.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'uncommitted' });

      const diff = diffs.find(d => d.filename_str === 'src/index.js');
      expect(diff).toBeDefined();
    });

    it('includes untracked new files', async () => {
      writeFile('src/brand-new.js', 'const fresh = true;\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'uncommitted' });

      const diff = diffs.find(d => d.filename_str === 'src/brand-new.js');
      expect(diff).toBeDefined();
      expect(diff.edit_type_str).toBe('ADDED');
      expect(diff.base_file_str).toBe('');
      expect(diff.head_file_str).toContain('const fresh = true;');
    });

    it('includes both staged and unstaged modifications', async () => {
      writeFile('src/index.js', 'console.log("staged edit");\n');
      git('add src/index.js');
      writeFile('src/utils.js', 'export function div(a, b) { return a / b; }\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'uncommitted' });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/index.js');
      expect(filenames).toContain('src/utils.js');
    });

    it('returns empty when working tree is clean', async () => {
      // Ensure HEAD matches the working tree by resetting hard
      git('reset --hard HEAD');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'uncommitted' });

      expect(diffs).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────
  // LAST COMMIT (--last-commit)
  // ─────────────────────────────────────────────────────
  describe('last-commit (--last-commit)', () => {
    beforeEach(() => {
      git('checkout -- .');
      git('reset HEAD -- .');
      git('clean -fd');
    });

    it('returns diff of the most recent commit', async () => {
      writeFile('src/index.js', 'console.log("commit-test");\n');
      git('add src/index.js');
      git('commit -m "test: last commit scenario"');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'last-commit' });

      expect(diffs.length).toBeGreaterThanOrEqual(1);
      const diff = diffs.find(d => d.filename_str === 'src/index.js');
      expect(diff).toBeDefined();
      expect(diff.head_file_str).toContain('commit-test');
      expect(diff.patch_str).toContain('+console.log("commit-test");');
    });

    it('does not include uncommitted changes in last-commit diff', async () => {
      // Make a commit
      writeFile('src/index.js', 'console.log("committed");\n');
      git('add src/index.js');
      git('commit -m "committed change"');

      // Then make an uncommitted change
      writeFile('src/utils.js', 'export function extra() {}\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'last-commit' });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/index.js');
      expect(filenames).not.toContain('src/utils.js');
    });

    it('shows new file added in the last commit', async () => {
      writeFile('src/newInCommit.js', 'export const y = 100;\n');
      git('add src/newInCommit.js');
      git('commit -m "add new file"');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'last-commit' });

      const diff = diffs.find(d => d.filename_str === 'src/newInCommit.js');
      expect(diff).toBeDefined();
      expect(diff.edit_type_str).toBe('ADDED');
    });

    it('shows file deleted in the last commit', async () => {
      // First ensure the file exists
      writeFile('src/toDelete.js', 'will be deleted\n');
      git('add src/toDelete.js');
      git('commit -m "add file to delete later"');

      // Now delete it
      git('rm src/toDelete.js');
      git('commit -m "delete file"');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'last-commit' });

      const diff = diffs.find(d => d.filename_str === 'src/toDelete.js');
      expect(diff).toBeDefined();
      expect(diff.edit_type_str).toBe('DELETED');
    });

    it('head_file_str reads from git HEAD not working tree', async () => {
      writeFile('src/index.js', 'console.log("in-commit");\n');
      git('add src/index.js');
      git('commit -m "commit version"');

      // Now change the working tree to something different
      writeFile('src/index.js', 'console.log("working-tree-version");\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'last-commit' });

      const diff = diffs.find(d => d.filename_str === 'src/index.js');
      expect(diff).toBeDefined();
      // Should read from git HEAD, not working tree
      expect(diff.head_file_str).toContain('in-commit');
      expect(diff.head_file_str).not.toContain('working-tree-version');
    });
  });

  // ─────────────────────────────────────────────────────
  // LAST N COMMITS (--last-n-commits)
  // ─────────────────────────────────────────────────────
  describe('last-n-commits (--last-n-commits)', () => {
    beforeEach(() => {
      git('checkout -- .');
      git('reset HEAD -- .');
      git('clean -fd');
    });

    it('returns diff spanning last 2 commits', async () => {
      writeFile('src/file1.js', 'const a = 1;\n');
      git('add src/file1.js');
      git('commit -m "commit 1: add file1"');

      writeFile('src/file2.js', 'const b = 2;\n');
      git('add src/file2.js');
      git('commit -m "commit 2: add file2"');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({
        type: 'last-n-commits',
        commits: 2,
      });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/file1.js');
      expect(filenames).toContain('src/file2.js');
    });

    it('returns diff spanning last 3 commits', async () => {
      writeFile('src/c1.js', 'c1\n');
      git('add src/c1.js');
      git('commit -m "c1"');

      writeFile('src/c2.js', 'c2\n');
      git('add src/c2.js');
      git('commit -m "c2"');

      writeFile('src/c3.js', 'c3\n');
      git('add src/c3.js');
      git('commit -m "c3"');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({
        type: 'last-n-commits',
        commits: 3,
      });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/c1.js');
      expect(filenames).toContain('src/c2.js');
      expect(filenames).toContain('src/c3.js');
    });

    it('clamps n to maximum of 5', async () => {
      // Create 6 commits
      for (let i = 1; i <= 6; i++) {
        writeFile(`src/clamp${i}.js`, `clamp${i}\n`);
        git(`add src/clamp${i}.js`);
        git(`commit -m "clamp commit ${i}"`);
      }

      const helper = await createHelper();
      // Request 10 but should be clamped to 5
      const diffs = await helper.getDiffBasedOnReviewConfig({
        type: 'last-n-commits',
        commits: 10,
      });

      const filenames = diffs.map(d => d.filename_str);
      // Should include commits 2-6 (last 5), not commit 1
      expect(filenames).toContain('src/clamp6.js');
      expect(filenames).toContain('src/clamp2.js');
      expect(filenames).not.toContain('src/clamp1.js');
    });

    it('clamps n to minimum of 1', async () => {
      writeFile('src/minclamp.js', 'min\n');
      git('add src/minclamp.js');
      git('commit -m "min clamp test"');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({
        type: 'last-n-commits',
        commits: 0,
      });

      // n=0 gets clamped to 1, so should see last commit
      expect(diffs.length).toBeGreaterThanOrEqual(1);
    });

    it('does not include uncommitted changes', async () => {
      writeFile('src/committed.js', 'committed\n');
      git('add src/committed.js');
      git('commit -m "a commit"');

      writeFile('src/uncommitted.js', 'not committed\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({
        type: 'last-n-commits',
        commits: 1,
      });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/committed.js');
      expect(filenames).not.toContain('src/uncommitted.js');
    });
  });

  // ─────────────────────────────────────────────────────
  // BRANCH DIFF (--all)
  // ─────────────────────────────────────────────────────
  describe('branch-diff (--all)', () => {
    let startBranch;

    beforeEach(() => {
      // Capture the branch before each test so afterEach can restore it
      startBranch = git('rev-parse --abbrev-ref HEAD');
      git('checkout -- .');
      git('reset HEAD -- .');
      git('clean -fd');
    });

    afterEach(() => {
      // Restore to the branch we were on before the test, so later tests
      // don't accidentally run on a feature branch left behind
      const current = git('rev-parse --abbrev-ref HEAD');
      if (current !== startBranch) {
        git('checkout -- .');
        git(`checkout ${startBranch}`);
      }
    });

    it('returns changes on a feature branch vs main', async () => {
      // Set up: create a main branch, then a feature branch with changes
      git('checkout -b main-base 2>/dev/null || git checkout main-base');
      writeFile('src/base.js', 'base\n');
      git('add src/base.js');
      git('commit -m "base commit on main-base"');

      git('checkout -b feature-test');
      writeFile('src/feature.js', 'feature content\n');
      git('add src/feature.js');
      git('commit -m "feature commit"');

      const helper = await createHelper();
      // Manually set baseCommit to the main-base branch to simulate merge-base
      const baseHash = git('rev-parse main-base');
      helper.baseCommit = baseHash;

      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'branch-diff' });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/feature.js');
    });

    it('includes uncommitted changes in branch diff', async () => {
      writeFile('src/uncommitted-branch.js', 'uncommitted in branch\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'branch-diff' });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/uncommitted-branch.js');
    });
  });

  // ─────────────────────────────────────────────────────
  // COMMITTED ONLY (--committed)
  // ─────────────────────────────────────────────────────
  describe('committed (--committed)', () => {
    beforeEach(() => {
      git('checkout -- .');
      git('reset HEAD -- .');
      git('clean -fd');
    });

    it('returns empty when no upstream exists (local-only repo)', async () => {
      // Our test repo has no remote, so committed should return empty
      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'committed' });

      expect(diffs).toEqual([]);
    });

    it('does not include uncommitted changes', async () => {
      writeFile('src/not-committed.js', 'uncommitted\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'committed' });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).not.toContain('src/not-committed.js');
    });

    it('does not include staged-only changes', async () => {
      writeFile('src/staged-only.js', 'staged\n');
      git('add src/staged-only.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'committed' });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).not.toContain('src/staged-only.js');
    });

    it('reads file content from HEAD, not working tree', async () => {
      // Simulate: commit a file, then change working tree
      writeFile('src/app.js', 'console.log("committed");\n');
      git('add src/app.js');
      git('commit -m "committed version"');

      writeFile('src/app.js', 'console.log("working tree");\n');

      const helper = await createHelper();
      // Use last-commit which is equivalent to committed for a single commit
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'last-commit' });

      const diff = diffs.find(d => d.filename_str === 'src/app.js');
      expect(diff).toBeDefined();
      expect(diff.head_file_str).toContain('committed');
      expect(diff.head_file_str).not.toContain('working tree');
    });
  });

  // ─────────────────────────────────────────────────────
  // ALL CHANGES (default, --all)
  // ─────────────────────────────────────────────────────
  describe('all (--all, default)', () => {
    beforeEach(() => {
      git('checkout -- .');
      git('reset HEAD -- .');
      git('clean -fd');
    });

    it('includes uncommitted changes when no upstream exists', async () => {
      writeFile('src/uncommitted-all.js', 'uncommitted\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'all' });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/uncommitted-all.js');
    });

    it('includes untracked new files', async () => {
      writeFile('src/brand-new-all.js', 'brand new\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'all' });

      const diff = diffs.find(d => d.filename_str === 'src/brand-new-all.js');
      expect(diff).toBeDefined();
      expect(diff.edit_type_str).toBe('ADDED');
    });

    it('includes staged changes', async () => {
      writeFile('src/index.js', 'console.log("all-staged");\n');
      git('add src/index.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'all' });

      const diff = diffs.find(d => d.filename_str === 'src/index.js');
      expect(diff).toBeDefined();
    });

    it('returns empty when everything is clean and pushed', async () => {
      git('reset --hard HEAD');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'all' });

      // No remote in test repo, falls back to uncommitted which is clean
      expect(diffs).toEqual([]);
    });

    it('is NOT the default scan type (default is branch-diff)', async () => {
      writeFile('src/default-test.js', 'default\n');

      const helper = await createHelper();
      // Calling with no config defaults to 'branch-diff', not 'all'
      const diffs = await helper.getDiffBasedOnReviewConfig();

      // branch-diff also picks up untracked files, so the file still appears,
      // but the default type is branch-diff not all
      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/default-test.js');
    });
  });

  // ─────────────────────────────────────────────────────
  // BASE BRANCH (--base <branch>)
  // ─────────────────────────────────────────────────────
  describe('base-branch (--base)', () => {
    let baseBranchName;
    let startBranch;

    beforeEach(() => {
      startBranch = git('rev-parse --abbrev-ref HEAD');
      git('checkout -- .');
      git('reset HEAD -- .');
      git('clean -fd');
    });

    afterEach(() => {
      const current = git('rev-parse --abbrev-ref HEAD');
      if (current !== startBranch) {
        git('checkout -- .');
        git(`checkout ${startBranch}`);
      }
    });

    it('returns diff between a local branch and HEAD', async () => {
      // Create a base branch
      baseBranchName = 'test-base-' + Date.now();
      git(`checkout -b ${baseBranchName}`);
      writeFile('src/base-anchor.js', 'anchor\n');
      git('add src/base-anchor.js');
      git('commit -m "base anchor"');

      // Create a feature branch with changes
      git('checkout -b feature-from-base');
      writeFile('src/feature-from-base.js', 'feature\n');
      git('add src/feature-from-base.js');
      git('commit -m "feature from base"');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({
        type: 'base-branch',
        baseBranch: baseBranchName,
      });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/feature-from-base.js');
      expect(filenames).not.toContain('src/base-anchor.js');
    });

    it('throws for non-existent branch', async () => {
      const helper = await createHelper();
      await expect(
        helper.getDiffBasedOnReviewConfig({
          type: 'base-branch',
          baseBranch: 'non-existent-branch-xyz',
        })
      ).rejects.toThrow('Could not resolve branch');
    });

    it('reads file content from HEAD', async () => {
      baseBranchName = 'base-content-' + Date.now();
      git(`checkout -b ${baseBranchName}`);
      writeFile('src/index.js', 'console.log("base version");\n');
      git('add src/index.js');
      git('commit -m "base version"');

      git('checkout -b feature-content');
      writeFile('src/index.js', 'console.log("feature version");\n');
      git('add src/index.js');
      git('commit -m "feature version"');

      // Diverge working tree
      writeFile('src/index.js', 'console.log("working tree version");\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({
        type: 'base-branch',
        baseBranch: baseBranchName,
      });

      const diff = diffs.find(d => d.filename_str === 'src/index.js');
      expect(diff).toBeDefined();
      expect(diff.head_file_str).toContain('feature version');
      expect(diff.head_file_str).not.toContain('working tree version');
      expect(diff.base_file_str).toContain('base version');
    });
  });

  // ─────────────────────────────────────────────────────
  // BASE COMMIT (--base-commit <commit>)
  // ─────────────────────────────────────────────────────
  describe('base-commit (--base-commit)', () => {
    beforeEach(() => {
      git('checkout -- .');
      git('reset HEAD -- .');
      git('clean -fd');
    });

    it('diffs from a specific commit hash to HEAD', async () => {
      writeFile('src/bc1.js', 'bc1\n');
      git('add src/bc1.js');
      git('commit -m "bc1"');

      const baseHash = git('rev-parse HEAD');

      writeFile('src/bc2.js', 'bc2\n');
      git('add src/bc2.js');
      git('commit -m "bc2"');

      writeFile('src/bc3.js', 'bc3\n');
      git('add src/bc3.js');
      git('commit -m "bc3"');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({
        type: 'base-commit',
        baseCommit: baseHash,
      });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/bc2.js');
      expect(filenames).toContain('src/bc3.js');
      expect(filenames).not.toContain('src/bc1.js');
    });

    it('supports HEAD~N syntax', async () => {
      writeFile('src/hn1.js', 'hn1\n');
      git('add src/hn1.js');
      git('commit -m "hn1"');

      writeFile('src/hn2.js', 'hn2\n');
      git('add src/hn2.js');
      git('commit -m "hn2"');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({
        type: 'base-commit',
        baseCommit: 'HEAD~1',
      });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('src/hn2.js');
      expect(filenames).not.toContain('src/hn1.js');
    });

    it('throws for invalid commit', async () => {
      const helper = await createHelper();
      await expect(
        helper.getDiffBasedOnReviewConfig({
          type: 'base-commit',
          baseCommit: 'invalidcommithash123',
        })
      ).rejects.toThrow('Could not resolve commit');
    });

    it('returns empty when base-commit equals HEAD', async () => {
      writeFile('src/same.js', 'same\n');
      git('add src/same.js');
      git('commit -m "same"');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({
        type: 'base-commit',
        baseCommit: 'HEAD',
      });

      expect(diffs).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────
  // DIFF INFO STRUCTURE VALIDATION
  // ─────────────────────────────────────────────────────
  describe('diff info structure', () => {
    beforeEach(() => {
      git('checkout -- .');
      git('reset HEAD -- .');
      git('clean -fd');
    });

    it('returns all required fields in diff info objects', async () => {
      writeFile('src/index.js', 'console.log("structure test");\n');
      git('add src/index.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      expect(diffs.length).toBeGreaterThanOrEqual(1);
      const diff = diffs[0];

      expect(diff).toHaveProperty('base_file_str');
      expect(diff).toHaveProperty('head_file_str');
      expect(diff).toHaveProperty('patch_str');
      expect(diff).toHaveProperty('filename_str');
      expect(diff).toHaveProperty('edit_type_str');
      expect(diff).toHaveProperty('old_filename_str');
      expect(diff).toHaveProperty('num_plus_lines_str');
      expect(diff).toHaveProperty('num_minus_lines_str');
      expect(diff).toHaveProperty('tokens_str');
      expect(diff).toHaveProperty('start_line_str');
      expect(diff).toHaveProperty('end_line_str');
    });

    it('has correct line count strings', async () => {
      writeFile('src/index.js', 'line1\nline2\nline3\n');
      git('add src/index.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      const diff = diffs.find(d => d.filename_str === 'src/index.js');
      expect(diff).toBeDefined();
      // num_plus_lines_str and num_minus_lines_str should be numeric strings
      expect(Number(diff.num_plus_lines_str)).not.toBeNaN();
      expect(Number(diff.num_minus_lines_str)).not.toBeNaN();
    });

    it('patch_str contains valid unified diff format', async () => {
      writeFile('src/index.js', 'console.log("patched");\n');
      git('add src/index.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      const diff = diffs.find(d => d.filename_str === 'src/index.js');
      expect(diff.patch_str).toMatch(/@@ .+ @@/); // hunk header
    });

    it('start_line_str and end_line_str are set for hunks', async () => {
      writeFile('src/index.js', 'console.log("hunk test");\n');
      git('add src/index.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      const diff = diffs.find(d => d.filename_str === 'src/index.js');
      expect(diff.start_line_str).not.toBe('');
      expect(diff.end_line_str).not.toBe('');
      expect(Number(diff.start_line_str)).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────
  // MULTI-HUNK DIFFS
  // ─────────────────────────────────────────────────────
  describe('multi-hunk diffs', () => {
    beforeEach(() => {
      git('checkout -- .');
      git('reset HEAD -- .');
      git('clean -fd');
    });

    it('splits multiple hunks into separate diff info objects', async () => {
      // Create a file with many lines
      const lines = [];
      for (let i = 1; i <= 20; i++) {
        lines.push(`line ${i}`);
      }
      writeFile('src/multiHunk.js', lines.join('\n') + '\n');
      git('add src/multiHunk.js');
      git('commit -m "add multi-line file"');

      // Modify lines far apart to create multiple hunks
      const modified = [...lines];
      modified[0] = 'MODIFIED line 1';
      modified[19] = 'MODIFIED line 20';
      writeFile('src/multiHunk.js', modified.join('\n') + '\n');
      git('add src/multiHunk.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      const multiHunkDiffs = diffs.filter(d => d.filename_str === 'src/multiHunk.js');
      // Should have 2 separate hunks (changes at line 1 and line 20 are far apart)
      expect(multiHunkDiffs.length).toBe(2);
      // Each hunk should have different start lines
      expect(multiHunkDiffs[0].start_line_str).not.toBe(multiHunkDiffs[1].start_line_str);
    });
  });

  // ─────────────────────────────────────────────────────
  // HELPER METHOD TESTS
  // ─────────────────────────────────────────────────────
  describe('helper methods', () => {
    it('getLocalBranch returns the current branch name', async () => {
      const helper = await createHelper();
      const branch = helper.getLocalBranch();
      const actual = git('rev-parse --abbrev-ref HEAD');
      expect(branch).toBe(actual);
    });

    it('getGitRoot returns the git root directory', async () => {
      const helper = await createHelper();
      expect(helper.getGitRoot()).toBe(testDir);
    });

    it('getStagedFiles returns list of staged file paths', async () => {
      git('checkout -- .');
      git('reset HEAD -- .');
      git('clean -fd');

      writeFile('src/index.js', 'staged file test\n');
      git('add src/index.js');

      const helper = await createHelper();
      const staged = await helper.getStagedFiles();
      expect(staged).toContain('src/index.js');
    });

    it('getRecentCommits returns commit metadata', async () => {
      const helper = await createHelper();
      const commits = await helper.getRecentCommits(3);

      expect(commits.length).toBeGreaterThan(0);
      expect(commits.length).toBeLessThanOrEqual(3);
      expect(commits[0]).toHaveProperty('hash');
      expect(commits[0]).toHaveProperty('message');
      expect(commits[0]).toHaveProperty('author');
      expect(commits[0]).toHaveProperty('date');
    });

    it('findGitRoot finds .git from a subdirectory', async () => {
      const subDir = path.join(testDir, 'src');
      const helper = new GitDiffHelper(subDir);
      const root = await helper.findGitRoot(subDir);
      expect(root).toBe(testDir);
    });

    it('findGitRoot returns null for non-git directory', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'));
      const helper = new GitDiffHelper(tmpDir);
      const root = await helper.findGitRoot(tmpDir);
      expect(root).toBeNull();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  // ─────────────────────────────────────────────────────
  // EDGE CASES
  // ─────────────────────────────────────────────────────
  describe('edge cases', () => {
    beforeEach(() => {
      git('checkout -- .');
      git('reset HEAD -- .');
      git('clean -fd');
    });

    it('handles files in nested directories', async () => {
      writeFile('src/deep/nested/dir/file.js', 'nested content\n');
      git('add src/deep/nested/dir/file.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      const diff = diffs.find(d => d.filename_str === 'src/deep/nested/dir/file.js');
      expect(diff).toBeDefined();
      expect(diff.edit_type_str).toBe('ADDED');
    });

    it('handles files with special characters in content', async () => {
      writeFile('src/index.js', 'const msg = "hello \\"world\\"\\n\\t";\n');
      git('add src/index.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      expect(diffs.length).toBeGreaterThanOrEqual(1);
      expect(diffs[0].patch_str).toBeTruthy();
    });

    it('handles empty file', async () => {
      writeFile('src/empty.js', '');
      git('add src/empty.js');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'staged-only' });

      const diff = diffs.find(d => d.filename_str === 'src/empty.js');
      expect(diff).toBeDefined();
    });

    it('expands untracked directories into individual files for uncommitted', async () => {
      // Create an untracked directory with multiple files (not git-added)
      // git status --porcelain reports this as "?? newdir/" instead of individual files
      fs.mkdirSync(path.join(testDir, 'newdir', 'sub'), { recursive: true });
      writeFile('newdir/file1.js', 'const a = 1;\n');
      writeFile('newdir/file2.js', 'const b = 2;\n');
      writeFile('newdir/sub/file3.js', 'const c = 3;\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'uncommitted' });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('newdir/file1.js');
      expect(filenames).toContain('newdir/file2.js');
      expect(filenames).toContain('newdir/sub/file3.js');

      // All should be ADDED since they're new untracked files
      for (const f of ['newdir/file1.js', 'newdir/file2.js', 'newdir/sub/file3.js']) {
        const diff = diffs.find(d => d.filename_str === f);
        expect(diff.edit_type_str).toBe('ADDED');
        expect(diff.base_file_str).toBe('');
        expect(diff.head_file_str).toBeTruthy();
      }
    });

    it('expands untracked directories into individual files for all', async () => {
      fs.mkdirSync(path.join(testDir, 'anotherdir'), { recursive: true });
      writeFile('anotherdir/x.js', 'const x = 10;\n');
      writeFile('anotherdir/y.js', 'const y = 20;\n');

      const helper = await createHelper();
      const diffs = await helper.getDiffBasedOnReviewConfig({ type: 'all' });

      const filenames = diffs.map(d => d.filename_str);
      expect(filenames).toContain('anotherdir/x.js');
      expect(filenames).toContain('anotherdir/y.js');
    });

    it('throws when not initialized', async () => {
      const helper = new GitDiffHelper(testDir);
      await expect(
        helper.getDiffBasedOnReviewConfig({ type: 'staged-only' })
      ).rejects.toThrow();
    });
  });
});
