import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import SecretsApiHelper from '../src/utils/secretsApiHelper.js';
import { detectSecrets } from '../src/utils/secretsDetector.js';

/**
 * End-to-end tests for secrets detection.
 * Builds real git state → runs local secret detection → asserts on detected secrets.
 */

// Realistic test tokens that match betterleaks regex patterns.
// ghp_ tokens need exactly 36 alphanumeric chars after the prefix.
// AKIA tokens need exactly 16 [A-Z2-7] chars after the prefix.
const GHP_TOKEN = 'ghp_R4nd0mT0k3nV4lu3W1thL3tt3rsAndD1g1ts';
const GHP_TOKEN_2 = 'ghp_X7kM9pL2vN4qR8wE1tY6uB3jF5hG0sA2cD9z';
const GHP_TOKEN_3 = 'ghp_Q1wE2rT3yU4iO5pA6sD7fG8hJ9kL0zX1cV2b';
const GHP_TOKEN_4 = 'ghp_M3nB4vC5xZ6lK7jH8gF9dS0aP1oI2uY3tR4e';
const GHP_TOKEN_5 = 'ghp_W8eR7tY6uI5oP4aS3dF2gH1jK0lZ9xC8vB7n';
const AKIA_TOKEN = 'AKIAZ7VBCD3EFGH2IJKL';
const STRIPE_KEY = 'sk_live_4eC39HqLyjWDarjtT1zdp7dc';
const PRIVATE_KEY_BLOCK = [
  '-----BEGIN RSA PRIVATE KEY-----',
  'MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHBzSgkV7sBOLEBD3FQ2',
  'KkN0sEqKMnA3F0nSzFK+GKFdEK0n3kFDlQkF89X5g5oFGfaFHzCmYSELbdVUG0JC',
  'BrsDBFhLsGp5JxThOGStGkRjDnUb1g5bNa2dHl0LINKQ3c9VzPQz5J9kp8sNgpxDl',
  '-----END RSA PRIVATE KEY-----',
].join('\n');

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
  const helper = new SecretsApiHelper(testDir);
  await helper.init();
  return helper;
}

/**
 * Full e2e: build request from git state → run local detection → return parsed response
 */
async function scanSecrets(scanType, includePatterns = [], excludePatterns = [], options = {}) {
  const helper = await createHelper();
  const requestBody = await helper.buildSecretsApiRequest(scanType, includePatterns, excludePatterns, options);

  if (requestBody.files.length === 0) {
    return { secretsDetected: [], filesScanned: 0 };
  }

  const detectedSecrets = detectSecrets(requestBody.files);
  const filesWithSecrets = detectedSecrets.filter(
    file => file.secrets && file.secrets.length > 0
  );

  return {
    secretsDetected: filesWithSecrets,
    filesScanned: requestBody.files.length,
  };
}

describe('Secrets detection e2e tests', () => {
  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeant-secrets-e2e-'));

    git('init');
    git('config user.email "test@test.com"');
    git('config user.name "Test User"');

    writeFile('src/app.js', 'console.log("hello world");\n');
    writeFile('README.md', '# Project\n');
    git('add -A');
    git('commit -m "Initial commit"');
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    const branches = git('branch').split('\n').map(b => b.trim().replace('* ', ''));
    const initialBranch = branches.includes('main') ? 'main' : branches.includes('master') ? 'master' : branches[0];
    try { git(`checkout ${initialBranch}`); } catch { /* already on it */ }
    git('reset --hard HEAD');
    git('clean -fd');
  });

  // ─────────────────────────────────────────────────────
  // DETECTS REAL SECRETS
  // ─────────────────────────────────────────────────────
  describe('detects real secrets', () => {
    it('detects GitHub personal access token', async () => {
      writeFile('src/github.js', [
        `const GITHUB_TOKEN = "${GHP_TOKEN}";`,
        'module.exports = { GITHUB_TOKEN };',
        ''
      ].join('\n'));
      git('add src/github.js');

      const result = await scanSecrets('staged-only');

      expect(result.filesScanned).toBeGreaterThan(0);
      expect(result.secretsDetected.length).toBeGreaterThan(0);
      const ghFile = result.secretsDetected.find(f => f.file_path === 'src/github.js');
      expect(ghFile).toBeDefined();
      expect(ghFile.secrets.length).toBeGreaterThan(0);
      expect(ghFile.secrets[0].type).toBe('github-pat');
    }, 30000);

    it('detects AWS access key', async () => {
      writeFile('src/config.js', [
        'const config = {',
        `  awsAccessKeyId: "${AKIA_TOKEN}",`,
        '};',
        'module.exports = config;',
        ''
      ].join('\n'));
      git('add src/config.js');

      const result = await scanSecrets('staged-only');

      expect(result.filesScanned).toBeGreaterThan(0);
      expect(result.secretsDetected.length).toBeGreaterThan(0);
      const configFile = result.secretsDetected.find(f => f.file_path === 'src/config.js');
      expect(configFile).toBeDefined();
      expect(configFile.secrets[0].type).toBe('aws-access-token');
    }, 30000);

    it('detects Stripe secret key', async () => {
      writeFile('src/stripe.js', [
        `const STRIPE_KEY = "${STRIPE_KEY}";`,
        ''
      ].join('\n'));
      git('add src/stripe.js');

      const result = await scanSecrets('staged-only');

      expect(result.secretsDetected.length).toBeGreaterThan(0);
      const file = result.secretsDetected.find(f => f.file_path === 'src/stripe.js');
      expect(file).toBeDefined();
      expect(file.secrets[0].type).toBe('stripe-access-token');
    }, 30000);

    it('detects private key in staged file', async () => {
      writeFile('src/key.pem', PRIVATE_KEY_BLOCK + '\n');
      git('add src/key.pem');

      const result = await scanSecrets('staged-only');

      expect(result.secretsDetected.length).toBeGreaterThan(0);
      const keyFile = result.secretsDetected.find(f => f.file_path === 'src/key.pem');
      expect(keyFile).toBeDefined();
      expect(keyFile.secrets[0].type).toBe('private-key');
    }, 30000);
  });

  // ─────────────────────────────────────────────────────
  // CLEAN CODE — NO FALSE POSITIVES
  // ─────────────────────────────────────────────────────
  describe('clean code produces no secrets', () => {
    it('no secrets in normal application code', async () => {
      writeFile('src/app.js', [
        'function add(a, b) {',
        '  return a + b;',
        '}',
        '',
        'function greet(name) {',
        '  return `Hello, ${name}!`;',
        '}',
        '',
        'module.exports = { add, greet };',
        ''
      ].join('\n'));
      git('add src/app.js');

      const result = await scanSecrets('staged-only');

      const highConfidenceSecrets = result.secretsDetected.flatMap(f =>
        f.secrets.filter(s => s.confidence_score?.toUpperCase() === 'HIGH')
      );
      expect(highConfidenceSecrets).toHaveLength(0);
    }, 30000);

    it('no secrets in placeholder/example values', async () => {
      writeFile('src/config.example.js', [
        'module.exports = {',
        '  apiKey: "YOUR_API_KEY_HERE",',
        '  dbHost: "localhost",',
        '  dbPort: 5432,',
        '  logLevel: "info",',
        '};',
        ''
      ].join('\n'));
      git('add src/config.example.js');

      const result = await scanSecrets('staged-only');

      const highConfidenceSecrets = result.secretsDetected.flatMap(f =>
        f.secrets.filter(s => s.confidence_score?.toUpperCase() === 'HIGH')
      );
      expect(highConfidenceSecrets).toHaveLength(0);
    }, 30000);
  });

  // ─────────────────────────────────────────────────────
  // SCAN TYPES WITH REAL DETECTION
  // ─────────────────────────────────────────────────────
  describe('scan types with secret detection', () => {
    it('staged-only: detects secret in staged file only', async () => {
      writeFile('src/staged-secret.js', `const TOKEN = "${GHP_TOKEN}";\n`);
      git('add src/staged-secret.js');

      // Also create an unstaged file with a secret — should NOT be detected
      writeFile('src/unstaged-secret.js', `const KEY = "${AKIA_TOKEN}";\n`);

      const result = await scanSecrets('staged-only');

      expect(result.secretsDetected.length).toBeGreaterThan(0);
      const stagedFile = result.secretsDetected.find(f => f.file_path === 'src/staged-secret.js');
      expect(stagedFile).toBeDefined();

      const unstagedFile = result.secretsDetected.find(f => f.file_path === 'src/unstaged-secret.js');
      expect(unstagedFile).toBeUndefined();
    }, 30000);

    it('uncommitted: detects secrets in both staged and unstaged files', async () => {
      writeFile('src/staged.js', `const A = "${GHP_TOKEN_2}";\n`);
      git('add src/staged.js');

      writeFile('src/unstaged.js', `const B = "${AKIA_TOKEN}";\n`);

      const result = await scanSecrets('uncommitted');

      expect(result.filesScanned).toBeGreaterThanOrEqual(2);
      expect(result.secretsDetected.length).toBeGreaterThan(0);
    }, 30000);

    it('last-commit: detects secrets in the most recent commit', async () => {
      writeFile('src/committed-secret.js', [
        `const GH_TOKEN = "${GHP_TOKEN_3}";`,
        ''
      ].join('\n'));
      git('add src/committed-secret.js');
      git('commit -m "add file with secret"');

      const result = await scanSecrets('last-commit');

      expect(result.secretsDetected.length).toBeGreaterThan(0);
      const file = result.secretsDetected.find(f => f.file_path === 'src/committed-secret.js');
      expect(file).toBeDefined();
      expect(file.secrets.length).toBeGreaterThan(0);
    }, 30000);

    it('last-n-commits: detects secrets across multiple commits', async () => {
      writeFile('src/secret1.js', `const KEY1 = "${GHP_TOKEN_4}";\n`);
      git('add src/secret1.js');
      git('commit -m "first secret"');

      writeFile('src/secret2.js', `const KEY2 = "${AKIA_TOKEN}";\n`);
      git('add src/secret2.js');
      git('commit -m "second secret"');

      const result = await scanSecrets('last-n-commits', [], [], { lastNCommits: 2 });

      expect(result.filesScanned).toBeGreaterThanOrEqual(2);
      expect(result.secretsDetected.length).toBeGreaterThan(0);
    }, 30000);

    it('all: detects secrets in committed + uncommitted changes', async () => {
      writeFile('src/all-secret.js', `const TOKEN = "${GHP_TOKEN_5}";\n`);

      const result = await scanSecrets('all');

      expect(result.secretsDetected.length).toBeGreaterThan(0);
      const file = result.secretsDetected.find(f => f.file_path === 'src/all-secret.js');
      expect(file).toBeDefined();
    }, 30000);

    it('base-branch: detects secrets added on feature branch', async () => {
      const baseBranch = 'e2e-base-' + Date.now();
      git(`checkout -b ${baseBranch}`);
      writeFile('src/app.js', 'console.log("clean base");\n');
      git('add src/app.js');
      git('commit -m "clean base"');

      git('checkout -b e2e-feature-secret');
      writeFile('src/feature-leak.js', `const API_KEY = "${AKIA_TOKEN}";\n`);
      git('add src/feature-leak.js');
      git('commit -m "feature with leak"');

      const result = await scanSecrets('base-branch', [], [], { baseBranch });

      expect(result.secretsDetected.length).toBeGreaterThan(0);
      const file = result.secretsDetected.find(f => f.file_path === 'src/feature-leak.js');
      expect(file).toBeDefined();
    }, 30000);

    it('base-commit: detects secrets added after specific commit', async () => {
      writeFile('src/app.js', 'console.log("before");\n');
      git('add src/app.js');
      git('commit -m "before"');

      const baseHash = git('rev-parse HEAD');

      writeFile('src/after-leak.js', PRIVATE_KEY_BLOCK + '\n');
      git('add src/after-leak.js');
      git('commit -m "added secret after base"');

      const result = await scanSecrets('base-commit', [], [], { baseCommit: baseHash });

      expect(result.secretsDetected.length).toBeGreaterThan(0);
      const file = result.secretsDetected.find(f => f.file_path === 'src/after-leak.js');
      expect(file).toBeDefined();
    }, 30000);
  });

  // ─────────────────────────────────────────────────────
  // FILTERING WITH REAL DETECTION
  // ─────────────────────────────────────────────────────
  describe('filtering with secret detection', () => {
    it('--include only scans matching files', async () => {
      writeFile('src/scan-me.js', `const TOKEN = "${GHP_TOKEN}";\n`);
      writeFile('src/skip-me.js', `const KEY = "${AKIA_TOKEN}";\n`);
      git('add -A');

      const result = await scanSecrets('staged-only', ['src/scan-me.js'], []);

      expect(result.filesScanned).toBe(1);
      if (result.secretsDetected.length > 0) {
        const filePaths = result.secretsDetected.map(f => f.file_path);
        expect(filePaths).not.toContain('src/skip-me.js');
      }
    }, 30000);

    it('--exclude skips matching files', async () => {
      writeFile('src/keep.js', `const TOKEN = "${GHP_TOKEN}";\n`);
      writeFile('src/secret.test.js', `const KEY = "${AKIA_TOKEN}";\n`);
      git('add -A');

      const result = await scanSecrets('staged-only', [], ['**/*.test.js']);

      if (result.secretsDetected.length > 0) {
        const filePaths = result.secretsDetected.map(f => f.file_path);
        expect(filePaths).not.toContain('src/secret.test.js');
      }
    }, 30000);
  });

  // ─────────────────────────────────────────────────────
  // RESPONSE STRUCTURE
  // ─────────────────────────────────────────────────────
  describe('response structure', () => {
    it('returns secretsDetected array with expected fields', async () => {
      writeFile('src/leak.js', `const TOKEN = "${GHP_TOKEN}";\n`);
      git('add src/leak.js');

      const result = await scanSecrets('staged-only');

      expect(result.secretsDetected.length).toBeGreaterThan(0);

      const fileResult = result.secretsDetected[0];
      expect(fileResult).toHaveProperty('file_path');
      expect(fileResult).toHaveProperty('secrets');
      expect(Array.isArray(fileResult.secrets)).toBe(true);
      expect(fileResult.secrets.length).toBeGreaterThan(0);

      const secret = fileResult.secrets[0];
      expect(secret).toHaveProperty('type');
      expect(secret).toHaveProperty('line_number');
      expect(secret).toHaveProperty('confidence_score');
    }, 30000);

    it('returns empty secretsDetected for no-files scan', async () => {
      const result = await scanSecrets('staged-only');

      expect(result.secretsDetected).toHaveLength(0);
      expect(result.filesScanned).toBe(0);
    }, 30000);
  });

  // ─────────────────────────────────────────────────────
  // MULTIPLE SECRETS IN ONE FILE
  // ─────────────────────────────────────────────────────
  describe('multiple secrets', () => {
    it('detects multiple secrets in a single file', async () => {
      writeFile('src/multi.js', [
        `const AWS_KEY = "${AKIA_TOKEN}";`,
        `const GH_TOKEN = "${GHP_TOKEN}";`,
        `const STRIPE = "${STRIPE_KEY}";`,
        ''
      ].join('\n'));
      git('add src/multi.js');

      const result = await scanSecrets('staged-only');

      const file = result.secretsDetected.find(f => f.file_path === 'src/multi.js');
      expect(file).toBeDefined();
      expect(file.secrets.length).toBeGreaterThanOrEqual(2);
    }, 30000);

    it('detects secrets across multiple files', async () => {
      writeFile('src/aws.js', `const KEY = "${AKIA_TOKEN}";\n`);
      writeFile('src/github.js', `const TOKEN = "${GHP_TOKEN}";\n`);
      git('add -A');

      const result = await scanSecrets('staged-only');

      expect(result.secretsDetected.length).toBeGreaterThanOrEqual(2);
    }, 30000);
  });
});
