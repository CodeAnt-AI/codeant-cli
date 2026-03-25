import fs from 'fs';
import path from 'path';

export async function lsTool(args, cwd) {
  const dirPath = args.path ? path.resolve(cwd, args.path) : cwd;
  return fs.readdirSync(dirPath).sort().join('\n');
}
