import path from 'path';

export async function globTool(args, cwd) {
  const { globSync } = await import('glob');
  const pattern = path.resolve(cwd, args.pattern);
  const matches = globSync(pattern);
  if (!matches.length) return 'No files found';
  return matches.map(m => path.relative(cwd, m)).join('\n');
}
