import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ReviewApiHelper from '../src/utils/reviewApiHelper.js';

/**
 * Integration tests for ReviewApiHelper.buildReviewApiRequest()
 * using a real git repository. No mocking.
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

async function createHelper() {
  const helper = new ReviewApiHelper(testDir);
  await helper.init();
  return helper;
}

describe('ReviewApiHelper integration tests', () => {
  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeant-review-test-'));

    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test User"');

    writeFile('src/app.js', 'console.log("app");\n');
    writeFile('src/utils.js', 'export function helper() {}\n');
    writeFile('README.md', '# Project\n');
    git('add -A');
    git('commit -m "Initial commit"');
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    git('checkout -- .');
    git('reset HEAD -- .');
    git('clean -fd');
  });

  // ─────────────────────────────────────────────────────
  // STAGED-ONLY
  // ─────────────────────────────────────────────────────
  describe('buildReviewApiRequest - staged-only', () => {
    it('returns diff_content and file_contents for staged changes', async () => {
      writeFile('src/app.js', 'console.log("updated app");\n');
      git('add src/app.js');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only');

      expect(result).toHaveProperty('diff_content');
      expect(result).toHaveProperty('file_contents');
      expect(result.diff_content).toContain('src/app.js');
      expect(result.file_contents['src/app.js']).toContain('updated app');
    });

    it('returns empty when nothing staged', async () => {
      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only');

      expect(result.diff_content).toBe('');
      expect(Object.keys(result.file_contents)).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────
  // UNCOMMITTED
  // ─────────────────────────────────────────────────────
  describe('buildReviewApiRequest - uncommitted', () => {
    it('includes unstaged tracked file changes', async () => {
      writeFile('src/app.js', 'console.log("uncommitted");\n');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('uncommitted');

      expect(result.diff_content).toContain('src/app.js');
      expect(result.file_contents['src/app.js']).toContain('uncommitted');
    });

    it('includes untracked new files', async () => {
      writeFile('src/newfile.js', 'export const x = 1;\n');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('uncommitted');

      expect(result.diff_content).toContain('src/newfile.js');
      expect(result.file_contents['src/newfile.js']).toContain('export const x = 1;');
    });
  });

  // ─────────────────────────────────────────────────────
  // COMMITTED (--committed)
  // ─────────────────────────────────────────────────────
  describe('buildReviewApiRequest - committed', () => {
    it('returns empty when no upstream exists', async () => {
      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('committed');

      expect(result.diff_content).toBe('');
      expect(Object.keys(result.file_contents)).toHaveLength(0);
    });

    it('does not include uncommitted changes', async () => {
      writeFile('src/app.js', 'console.log("not committed");\n');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('committed');

      expect(result.file_contents).not.toHaveProperty('src/app.js');
    });
  });

  // ─────────────────────────────────────────────────────
  // ALL (default, --all)
  // ─────────────────────────────────────────────────────
  describe('buildReviewApiRequest - all (default)', () => {
    it('includes uncommitted changes', async () => {
      writeFile('src/app.js', 'console.log("all-uncommitted");\n');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('all');

      expect(result.diff_content).toContain('src/app.js');
      expect(result.file_contents['src/app.js']).toContain('all-uncommitted');
    });

    it('includes untracked new files', async () => {
      writeFile('src/allnew.js', 'export const all = true;\n');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('all');

      expect(result.diff_content).toContain('src/allnew.js');
      expect(result.file_contents['src/allnew.js']).toContain('export const all = true;');
    });

    it('returns empty when working tree is clean', async () => {
      git('reset --hard HEAD');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('all');

      expect(result.diff_content).toBe('');
      expect(Object.keys(result.file_contents)).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────
  // BASE BRANCH (--base <branch>)
  // ─────────────────────────────────────────────────────
  describe('buildReviewApiRequest - base-branch', () => {
    it('returns diff between base branch and HEAD', async () => {
      const branchName = 'review-base-' + Date.now();
      git(`checkout -b ${branchName}`);
      writeFile('src/app.js', 'console.log("base");\n');
      git('add src/app.js');
      git('commit -m "base"');

      git('checkout -b review-feature');
      writeFile('src/feature-review.js', 'export const f = 1;\n');
      git('add src/feature-review.js');
      git('commit -m "feature"');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('base-branch', [], [], { baseBranch: branchName });

      expect(result.diff_content).toContain('src/feature-review.js');
      expect(result.file_contents['src/feature-review.js']).toContain('export const f = 1;');
    });
  });

  // ─────────────────────────────────────────────────────
  // BASE COMMIT (--base-commit <commit>)
  // ─────────────────────────────────────────────────────
  describe('buildReviewApiRequest - base-commit', () => {
    it('returns diff from a specific commit to HEAD', async () => {
      writeFile('src/app.js', 'console.log("before");\n');
      git('add src/app.js');
      git('commit -m "before"');

      const baseHash = git('rev-parse HEAD');

      writeFile('src/after.js', 'const after = true;\n');
      git('add src/after.js');
      git('commit -m "after"');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('base-commit', [], [], { baseCommit: baseHash });

      expect(result.diff_content).toContain('src/after.js');
      expect(result.file_contents['src/after.js']).toContain('const after = true;');
    });

    it('supports HEAD~N syntax', async () => {
      writeFile('src/app.js', 'console.log("head-n");\n');
      git('add src/app.js');
      git('commit -m "head-n commit"');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('base-commit', [], [], { baseCommit: 'HEAD~1' });

      expect(result.diff_content).toContain('src/app.js');
    });
  });

  // ─────────────────────────────────────────────────────
  // LAST COMMIT
  // ─────────────────────────────────────────────────────
  describe('buildReviewApiRequest - last-commit', () => {
    it('returns diff of the most recent commit', async () => {
      writeFile('src/app.js', 'console.log("last-commit-test");\n');
      git('add src/app.js');
      git('commit -m "test last commit"');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('last-commit');

      expect(result.diff_content).toContain('src/app.js');
      expect(result.file_contents['src/app.js']).toContain('last-commit-test');
    });

    it('file_contents come from git HEAD, not working tree', async () => {
      writeFile('src/app.js', 'console.log("committed-version");\n');
      git('add src/app.js');
      git('commit -m "commit"');

      // Now diverge the working tree
      writeFile('src/app.js', 'console.log("working-tree-version");\n');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('last-commit');

      expect(result.file_contents['src/app.js']).toContain('committed-version');
      expect(result.file_contents['src/app.js']).not.toContain('working-tree-version');
    });
  });

  // ─────────────────────────────────────────────────────
  // LAST N COMMITS
  // ─────────────────────────────────────────────────────
  describe('buildReviewApiRequest - last-n-commits', () => {
    it('spans multiple commits', async () => {
      writeFile('src/a.js', 'const a = 1;\n');
      git('add src/a.js');
      git('commit -m "add a"');

      writeFile('src/b.js', 'const b = 2;\n');
      git('add src/b.js');
      git('commit -m "add b"');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('last-n-commits', [], [], { lastNCommits: 2 });

      expect(result.diff_content).toContain('src/a.js');
      expect(result.diff_content).toContain('src/b.js');
    });
  });

  // ─────────────────────────────────────────────────────
  // FILE FILTERING
  // ─────────────────────────────────────────────────────
  describe('file filtering', () => {
    it('excludes lock files', async () => {
      writeFile('package-lock.json', '{"lockfileVersion": 3}\n');
      writeFile('src/app.js', 'console.log("with lock");\n');
      git('add -A');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only');

      expect(result.file_contents).not.toHaveProperty('package-lock.json');
    });

    it('excludes binary/image extensions', async () => {
      writeFile('logo.png', 'fake png content');
      writeFile('src/app.js', 'console.log("with image");\n');
      git('add -A');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only');

      expect(result.file_contents).not.toHaveProperty('logo.png');
      expect(result.diff_content).not.toContain('logo.png');
    });

    it('filters deleted files out of review', async () => {
      git('rm src/utils.js');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only');

      // Deleted files should be excluded — nothing to review
      expect(result.file_contents).not.toHaveProperty('src/utils.js');
    });

    it('respects --include patterns', async () => {
      writeFile('src/app.js', 'console.log("include-test");\n');
      writeFile('src/utils.js', 'export function updated() {}\n');
      git('add -A');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only', ['src/app.js'], []);

      expect(result.file_contents).toHaveProperty('src/app.js');
      expect(result.file_contents).not.toHaveProperty('src/utils.js');
    });

    it('respects --exclude patterns', async () => {
      writeFile('src/app.js', 'console.log("exclude-test");\n');
      writeFile('src/utils.js', 'export function excluded() {}\n');
      git('add -A');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only', [], ['src/utils.js']);

      expect(result.file_contents).toHaveProperty('src/app.js');
      expect(result.file_contents).not.toHaveProperty('src/utils.js');
    });

    it('respects glob patterns in include', async () => {
      writeFile('src/app.js', 'console.log("glob-test");\n');
      writeFile('docs/guide.md', '# Guide\nupdated\n');
      git('add -A');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only', ['src/**/*.js'], []);

      expect(result.file_contents).toHaveProperty('src/app.js');
      expect(result.file_contents).not.toHaveProperty('docs/guide.md');
    });

    it('limits to MAX_REVIEW_FILES (10) unique files', async () => {
      for (let i = 1; i <= 12; i++) {
        writeFile(`src/file${i}.js`, `const f${i} = ${i};\n`);
      }
      git('add -A');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only');

      const fileCount = Object.keys(result.file_contents).length;
      expect(fileCount).toBeLessThanOrEqual(10);
    });

    it('skips files exceeding MAX_FILE_LINES (5000)', async () => {
      // Create a file with more than 5000 lines
      const bigContent = Array.from({ length: 5001 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
      writeFile('src/bigfile.js', bigContent);
      writeFile('src/app.js', 'console.log("small file");\n');
      git('add -A');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only');

      expect(result.file_contents).not.toHaveProperty('src/bigfile.js');
      expect(result.file_contents).toHaveProperty('src/app.js');
    });
  });

  // ─────────────────────────────────────────────────────
  // RESPONSE STRUCTURE
  // ─────────────────────────────────────────────────────
  describe('response structure', () => {
    it('diff_content is a string', async () => {
      writeFile('src/app.js', 'console.log("structure");\n');
      git('add src/app.js');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only');

      expect(typeof result.diff_content).toBe('string');
    });

    it('file_contents is an object mapping filenames to content', async () => {
      writeFile('src/app.js', 'console.log("map-test");\n');
      git('add src/app.js');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only');

      expect(typeof result.file_contents).toBe('object');
      expect(typeof result.file_contents['src/app.js']).toBe('string');
    });

    it('diff_content contains valid unified diff headers', async () => {
      writeFile('src/app.js', 'console.log("diff-header-test");\n');
      git('add src/app.js');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only');

      expect(result.diff_content).toMatch(/diff --git/);
      expect(result.diff_content).toMatch(/@@.*@@/);
    });
  });
});
