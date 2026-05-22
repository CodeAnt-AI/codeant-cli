#!/usr/bin/env node
// Build the CodeAnt MCPB bundle.
//
// Stages files into dist/mcpb-stage/, installs production dependencies, then
// zips the staged tree as dist/codeant.mcpb (a plain zip per the MCPB spec).
//
// Usage:
//   node scripts/build-mcpb.mjs

import { mkdir, cp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const distDir = join(repoRoot, 'dist');
const stageDir = join(distDir, 'mcpb-stage');
const outPath = join(distDir, 'codeant.mcpb');

const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(repoRoot, 'mcpb', 'manifest.json'), 'utf8'));

// Pin the manifest version to package.json so a single bump propagates.
manifest.version = pkg.version;

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited with ${r.status}`);
}

async function main() {
  console.log(`[build-mcpb] repo root: ${repoRoot}`);
  console.log(`[build-mcpb] cleaning ${stageDir}`);
  await rm(stageDir, { recursive: true, force: true });
  await rm(outPath, { force: true });
  await mkdir(stageDir, { recursive: true });

  console.log('[build-mcpb] staging src/ → mcpb-stage/src/');
  await cp(join(repoRoot, 'src'), join(stageDir, 'src'), { recursive: true });

  console.log('[build-mcpb] staging mcpb/server/ → mcpb-stage/server/');
  await cp(join(repoRoot, 'mcpb', 'server'), join(stageDir, 'server'), { recursive: true });

  console.log('[build-mcpb] writing manifest.json');
  await writeFile(join(stageDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('[build-mcpb] writing trimmed package.json (production deps only)');
  const stagedPkg = {
    name: 'codeant-mcpb',
    version: pkg.version,
    private: true,
    type: pkg.type,
    dependencies: pkg.dependencies,
  };
  await writeFile(join(stageDir, 'package.json'), JSON.stringify(stagedPkg, null, 2));

  console.log('[build-mcpb] installing production dependencies (npm install --omit=dev)');
  run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--silent'], { cwd: stageDir });

  const iconSrc = join(repoRoot, 'mcpb', 'icon.png');
  if (await exists(iconSrc)) {
    await cp(iconSrc, join(stageDir, 'icon.png'));
    console.log('[build-mcpb] included icon.png');
  } else {
    console.log('[build-mcpb] note: mcpb/icon.png not found — directory listing will use the default icon');
  }

  console.log(`[build-mcpb] zipping → ${outPath}`);
  run('zip', ['-r', '-q', outPath, '.'], { cwd: stageDir });

  const { size } = await stat(outPath);
  console.log(`[build-mcpb] done: ${outPath} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  console.log('[build-mcpb] sanity check: list top-level entries inside the bundle');
  run('unzip', ['-l', outPath]);
}

main().catch((err) => {
  console.error('[build-mcpb] FAILED:', err);
  process.exit(1);
});
