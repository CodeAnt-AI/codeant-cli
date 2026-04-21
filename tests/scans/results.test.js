import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runAsync, REPO, TIMEOUT } from './helpers.js';

// ── Shared setup ──────────────────────────────────────────────────────────────
let tmpDir;
let r = {};   // all pre-fetched results keyed by label

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeant-results-'));

  const sarifPath = path.join(tmpDir, 'out.sarif');
  const jsonPath  = path.join(tmpDir, 'out.json');

  // Fire every CLI call in parallel — total wall time ≈ slowest single call
  const calls = {
    base:            ['scans', 'results', '--repo', REPO, '--quiet'],
    scanSha:         ['scans', 'history', '--repo', REPO, '--limit', '1'],
    typeSast:        ['scans', 'results', '--repo', REPO, '--types', 'sast',       '--quiet'],
    typeSca:         ['scans', 'results', '--repo', REPO, '--types', 'sca',        '--quiet'],
    typeSecrets:     ['scans', 'results', '--repo', REPO, '--types', 'secrets',    '--quiet'],
    typeIac:         ['scans', 'results', '--repo', REPO, '--types', 'iac',        '--quiet'],
    typeDeadCode:    ['scans', 'results', '--repo', REPO, '--types', 'dead_code',  '--quiet'],
    typeSastSca:     ['scans', 'results', '--repo', REPO, '--types', 'sast,sca',   '--quiet'],
    severity:        ['scans', 'results', '--repo', REPO, '--severity', 'critical,high', '--quiet'],
    page0:           ['scans', 'results', '--repo', REPO, '--limit', '5', '--offset', '0', '--quiet'],
    page1:           ['scans', 'results', '--repo', REPO, '--limit', '5', '--offset', '5', '--quiet'],
    pathFilter:      ['scans', 'results', '--repo', REPO, '--path', 'src/**',      '--quiet'],
    checkFilter:     ['scans', 'results', '--repo', REPO, '--check', '(?i)sql',    '--quiet'],
    fmtJson:         ['scans', 'results', '--repo', REPO, '--format', 'json',      '--quiet'],
    fmtCsv:          ['scans', 'results', '--repo', REPO, '--format', 'csv',       '--quiet'],
    fmtMd:           ['scans', 'results', '--repo', REPO, '--format', 'md',        '--quiet'],
    fmtTable:        ['scans', 'results', '--repo', REPO, '--format', 'table', '--no-color', '--quiet'],
    fmtSarif:        ['scans', 'results', '--repo', REPO, '--format', 'sarif', '--output', sarifPath, '--quiet'],
    fmtJsonFile:     ['scans', 'results', '--repo', REPO, '--output', jsonPath,    '--quiet'],
    fieldsBasic:     ['scans', 'results', '--repo', REPO, '--fields', 'id,severity,file_path', '--quiet'],
    fieldsProjected: ['scans', 'results', '--repo', REPO, '--fields', 'id,severity', '--limit', '1', '--quiet'],
    includeDismissed:['scans', 'results', '--repo', REPO, '--include-dismissed',   '--quiet'],
    deterA:          ['scans', 'results', '--repo', REPO, '--types', 'sast', '--limit', '20', '--quiet'],
    deterB:          ['scans', 'results', '--repo', REPO, '--types', 'sast', '--limit', '20', '--quiet'],
  };

  const keys    = Object.keys(calls);
  const results = await Promise.all(keys.map((k) => runAsync(...calls[k])));
  keys.forEach((k, i) => { r[k] = results[i]; });

  // Extract scan SHA from history for the explicit-SHA test
  const shaMatch = r.scanSha.stdout.match(/"latest_commit_sha":\s*"([^"]+)"/);
  r._scanSha = shaMatch ? shaMatch[1] : '';
  r._sarifPath = sarifPath;
  r._jsonPath  = jsonPath;
}, TIMEOUT * 3);

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Basic ─────────────────────────────────────────────────────────────────────
describe('results — basic', () => {
  it('exit 0',              () => expect(r.base.status,  r.base.combined).toBe(0));
  it('schema_version 1.0',  () => expect(r.base.stdout).toMatch('"schema_version": "1.0"'));
  it("has 'findings' key",  () => expect(r.base.stdout).toMatch('"findings"'));
  it("has 'pagination' key",() => expect(r.base.stdout).toMatch('"pagination"'));
});

// ── Type filters ──────────────────────────────────────────────────────────────
describe('results — type filters', () => {
  for (const [label, key] of [
    ['sast', 'typeSast'], ['sca', 'typeSca'], ['secrets', 'typeSecrets'],
    ['iac', 'typeIac'], ['dead_code', 'typeDeadCode'], ['sast,sca', 'typeSastSca'],
  ]) {
    it(`--types ${label} — exit 0`, () => expect(r[key].status, r[key].combined).toBe(0));
  }
});

// ── Severity + pagination ─────────────────────────────────────────────────────
describe('results — severity + pagination', () => {
  it('--severity critical,high — exit 0', () => expect(r.severity.status,  r.severity.combined).toBe(0));
  it('--limit 5 --offset 0 — exit 0',     () => expect(r.page0.status,     r.page0.combined).toBe(0));
  it('--limit 5 --offset 5 — exit 0',     () => expect(r.page1.status,     r.page1.combined).toBe(0));
});

// ── Path + check filters ──────────────────────────────────────────────────────
describe('results — path + check filters', () => {
  it("--path 'src/**' — exit 0",   () => expect(r.pathFilter.status,  r.pathFilter.combined).toBe(0));
  it("--check '(?i)sql' — exit 0", () => expect(r.checkFilter.status, r.checkFilter.combined).toBe(0));
});

// ── Formats ───────────────────────────────────────────────────────────────────
describe('results — formats', () => {
  it('--format json — exit 0',  () => expect(r.fmtJson.status,  r.fmtJson.combined).toBe(0));
  it('--format csv — exit 0',   () => expect(r.fmtCsv.status,   r.fmtCsv.combined).toBe(0));
  it('--format md — exit 0',    () => expect(r.fmtMd.status,    r.fmtMd.combined).toBe(0));
  it('--format table — exit 0', () => expect(r.fmtTable.status, r.fmtTable.combined).toBe(0));

  it('csv — has header row',       () => expect(r.fmtCsv.combined).toMatch('id,category'));
  it('md — has CodeAnt Scan heading', () => expect(r.fmtMd.combined).toMatch('CodeAnt Scan'));
  it('table — has SEVERITY column',() => expect(r.fmtTable.combined).toMatch('SEVERITY'));
});

// ── SARIF output to file ──────────────────────────────────────────────────────
describe('results — SARIF output to file', () => {
  it('command exits 0',          () => expect(r.fmtSarif.status, r.fmtSarif.combined).toBe(0));
  it('SARIF file exists',        () => expect(fs.existsSync(r._sarifPath)).toBe(true));
  it('SARIF has version 2.1.0',  () => expect(fs.readFileSync(r._sarifPath, 'utf8')).toMatch('"version": "2.1.0"'));
  it('SARIF has runs array',     () => expect(JSON.parse(fs.readFileSync(r._sarifPath, 'utf8'))).toHaveProperty('runs'));
});

// ── JSON output to file ───────────────────────────────────────────────────────
describe('results — JSON output to file', () => {
  it('JSON file exists',              () => expect(fs.existsSync(r._jsonPath)).toBe(true));
  it('JSON file schema_version 1.0',  () => expect(JSON.parse(fs.readFileSync(r._jsonPath, 'utf8')).schema_version).toBe('1.0'));
});

// ── Field projection ──────────────────────────────────────────────────────────
describe('results — field projection', () => {
  it('--fields id,severity,file_path — exit 0', () => expect(r.fieldsBasic.status, r.fieldsBasic.combined).toBe(0));

  it('projected output only includes requested keys', () => {
    let parsed;
    try { parsed = JSON.parse(r.fieldsProjected.stdout); } catch { return; }
    const findings = parsed?.findings ?? [];
    if (findings.length === 0) return;
    const keys = Object.keys(findings[0]);
    expect(keys).toContain('id');
    expect(keys).not.toContain('message');
  });
});

// ── Dismissed ─────────────────────────────────────────────────────────────────
describe('results — dismissed', () => {
  it('default excludes dismissed — exit 0',   () => expect(r.base.status, r.base.combined).toBe(0));
  it('--include-dismissed — exit 0',          () => expect(r.includeDismissed.status, r.includeDismissed.combined).toBe(0));
});

// ── Explicit scan SHA ─────────────────────────────────────────────────────────
describe('results — explicit scan SHA', () => {
  it('--scan <sha> — exit 0', async () => {
    if (!r._scanSha) return;
    const out = await runAsync('scans', 'results', '--repo', REPO, '--scan', r._scanSha, '--quiet');
    expect(out.status, out.combined).toBe(0);
  }, TIMEOUT);
});

// ── Quiet ─────────────────────────────────────────────────────────────────────
describe('results — quiet', () => {
  it('--quiet suppresses [progress] lines', () => expect(r.base.stderr).not.toMatch(/\[progress\]/));
});

// ── Determinism ───────────────────────────────────────────────────────────────
describe('results — determinism', () => {
  it('two runs produce identical output (excluding generated_at)', () => {
    const strip = (s) => s.replace(/"generated_at":\s*"[^"]*"/g, '"generated_at": "<stripped>"');
    expect(strip(r.deterA.stdout)).toBe(strip(r.deterB.stdout));
  });
});
