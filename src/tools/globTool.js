import path from 'path';
import { assertInsideCwd } from './pathUtils.js';

export async function globTool(args, cwd) {
  const { globSync } = await import('glob');
  const pattern = path.resolve(cwd, args.pattern);
  assertInsideCwd(pattern.replace(/[*?{[\\].*$/, '') || cwd, cwd);
  const matches = globSync(pattern);
  if (!matches.length) return 'No files found';
  return matches.map(m => path.relative(cwd, m)).join('\n');
}
