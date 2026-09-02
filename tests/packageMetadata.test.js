import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageJsonUrl = new URL('../package.json', import.meta.url);
const packageJson = JSON.parse(readFileSync(packageJsonUrl, 'utf8'));
const expectedRepositoryUrl = ['git+https://github.com', 'CodeAnt-AI', 'codeant-cli.git'].join('/');

describe('npm publish metadata', () => {
  it('matches the GitHub repository used for trusted publishing provenance', () => {
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: expectedRepositoryUrl,
    });
  });

  it('keeps the CLI binary in npm-normalized form', () => {
    expect(packageJson.bin).toEqual({ codeant: 'src/index.js' });

    const binUrl = new URL(`../${packageJson.bin.codeant}`, import.meta.url);
    const binContents = readFileSync(fileURLToPath(binUrl), 'utf8');
    expect(binContents.startsWith('#!/usr/bin/env node')).toBe(true);
  });
});
