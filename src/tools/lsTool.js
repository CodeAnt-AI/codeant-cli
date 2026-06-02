import fs from 'fs';
import path from 'path';
import { assertInsideCwd } from './pathUtils.js';

export async function lsTool(args, cwd) {
  const dirPath = args.path ? path.resolve(cwd, args.path) : cwd;
  assertInsideCwd(dirPath, cwd);
  return fs.readdirSync(dirPath).sort().join('\n');
}
