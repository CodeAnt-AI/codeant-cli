import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ReviewApiHelper from '../src/utils/reviewApiHelper.js';
import { runReviewHeadless } from '../src/reviewHeadless.js';
import { fetchApi } from '../src/utils/fetchApi.js';

vi.mock('../src/utils/config.js', () => ({ getConfigValue: vi.fn() }));
vi.mock('../src/utils/analytics.js', () => ({ track: vi.fn() }));
vi.mock('../src/utils/fetchApi.js', () => ({ fetchApi: vi.fn() }));

/**
 * Integration tests for ReviewApiHelper.buildReviewApiRequest()
 * using a real git repository, with global config and API calls isolated.
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
    vi.stubEnv('CODEANT_REVIEW_MAX_FILES', undefined);
    delete process.env.CODEANT_REVIEW_MAX_FILES;
    git('checkout -- .');
    git('reset HEAD -- .');
    git('clean -fd');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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

    it.each([40, 100, 103])('applies the 100-file default to %i staged files', async (totalFiles) => {
      for (let i = 1; i <= totalFiles; i++) {
        writeFile(`src/cap/file${i}.js`, `const f${i} = ${i};\n`);
      }
      git('add src/cap');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only');

      const fileCount = Object.keys(result.file_contents).length;
      expect(fileCount).toBe(Math.min(totalFiles, 100));
      expect(result._meta.reviewed_files).toHaveLength(fileCount);
      expect(result.diff_content.match(/^diff --git /gm)).toHaveLength(fileCount);
      expect(result._meta.max_files).toBe(100);
      expect(result._meta.capped).toBe(totalFiles > 100);
      expect(result._meta.skipped).toHaveLength(Math.max(totalFiles - 100, 0));
    }, 30000);

    it.each(['staged-only', 'uncommitted', 'all', 'base-commit', 'last-commit'])('overrides the cap above 100 for %s', async (scope) => {
      for (let index = 0; index < 105; index++) {
        writeFile(`src/cap/file${index}.js`, `export const value = ${index};\n`);
      }
      git('add src/cap');
      const baseCommit = git('rev-parse HEAD');
      if (scope === 'last-commit') git('commit -m "large change"');

      try {
        const helper = await createHelper();
        const result = await helper.buildReviewApiRequest(scope, [], [], { maxFiles: 102, baseCommit });

        expect(result._meta).toMatchObject({ max_files: 102, capped: true, total_changed: 105 });
        expect(result._meta.reviewed_files).toHaveLength(102);
        expect(Object.keys(result.file_contents)).toHaveLength(102);
        expect(result.diff_content.match(/^diff --git /gm)).toHaveLength(102);
        expect(result._meta.skipped).toHaveLength(3);
      } finally {
        if (scope === 'last-commit') git(`reset --hard ${baseCommit}`);
      }
    }, 30000);

    it('filters excluded and oversized files before applying a smaller cap', async () => {
      writeFile('src/cap/0.png', 'image');
      writeFile('src/cap/1.js', 'x'.repeat(201 * 1024));
      writeFile('src/cap/2.js', 'export const a = 1;\n');
      writeFile('src/cap/3.js', 'export const b = 2;\n');
      writeFile('src/cap/4.js', 'export const c = 3;\n');
      git('add src/cap');

      const helper = await createHelper();
      const result = await helper.buildReviewApiRequest('staged-only', [], [], { maxFiles: 2 });

      expect(result._meta.reviewed_files).toEqual(['src/cap/2.js', 'src/cap/3.js']);
      expect(result._meta.skipped).toContainEqual({ file: 'src/cap/4.js', reason: 'exceeded 2-file limit' });
    });

    it('applies the override to raw diffs and reports diff-only files', async () => {
      const helper = await createHelper();
      const sections = ['src/app.js', 'missing.js', 'src/utils.js'].map(file =>
        `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-old\n+new\n`
      );
      vi.spyOn(helper, 'getFilesForType').mockResolvedValue(sections.join(''));

      const result = await helper.buildReviewApiRequest('all', [], [], { maxFiles: 2 });

      expect(result._meta.reviewed_files).toEqual(['src/app.js', 'missing.js']);
      expect(result._meta).toMatchObject({ capped: true, max_files: 2 });
      expect(result.diff_content).toBe(sections.slice(0, 2).join(''));
      expect(result.file_contents).not.toHaveProperty('src/utils.js');
    });

    it('sends all 100 files through the headless review pipeline in five-file batches', async () => {
      for (let index = 0; index < 100; index++) {
        writeFile(`src/cap/file${index}.js`, `export const value = ${index};\n`);
      }
      git('add src/cap');
      fetchApi.mockReset().mockResolvedValue({ session_id: 'test-session', done: true, output: { code_suggestions: [] } });

      const result = await runReviewHeadless({ workspacePath: testDir, scanType: 'staged-only', maxFiles: 100 });
      const batches = fetchApi.mock.calls.map(([, , payload]) => payload).filter(payload => payload.prompt_template_name !== 'risk_planner');

      expect(result.error).toBeNull();
      expect(result.meta.reviewed_files).toHaveLength(100);
      expect(batches).toHaveLength(20);
      expect(new Set(batches.flatMap(batch => Object.keys(batch.file_contents))).size).toBe(100);
    }, 30000);

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

  describe('splitIntoPerFileRequests', () => {
    it('keeps all file contents in five-file batches', () => {
      const sections = Array.from({ length: 6 }, (_, i) =>
        `diff --git a/src/f${i}.js b/src/f${i}.js\n@@ -1 +1 @@\n-old\n+new\n`
      ).reverse();
      const file_contents = Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [`src/f${i}.js`, `new ${i}`])
      );

      const batches = ReviewApiHelper.splitIntoPerFileRequests({
        diff_content: sections.join(''),
        file_contents,
      });

      expect(batches).toHaveLength(2);
      expect(batches[0]._filenames).toHaveLength(5);
      expect(Object.keys(batches[0].file_contents)).toHaveLength(5);
      expect(batches[1]._filenames).toEqual(['src/f5.js']);
      expect(batches[1].file_contents['src/f5.js']).toBe('new 5');
    });
  });
});
