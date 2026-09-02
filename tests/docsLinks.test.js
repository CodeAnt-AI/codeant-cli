import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const forbiddenRepoReferences = [
  ['codeant-ai', 'codeant-cli'].join('/'),
  ['codeantai', 'codeant-cli'].join('/'),
];

describe('public documentation links', () => {
  it('does not reference the CodeAnt CLI GitHub repository', () => {
    const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);

    const matches = trackedFiles.filter((file) => {
      const contents = readFileSync(file, 'utf8').toLowerCase();
      return forbiddenRepoReferences.some((reference) => contents.includes(reference));
    });

    expect(matches).toEqual([]);
  });
});
