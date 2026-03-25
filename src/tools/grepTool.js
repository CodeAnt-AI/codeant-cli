import { spawn } from 'child_process';
import path from 'path';

export async function grepTool(args, cwd) {
  const target = args.path ? path.resolve(cwd, args.path) : cwd;
  const result = await new Promise((resolve) => {
    const proc = spawn('grep', ['-rn', args.pattern, target], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30000,
    });
    let stdout = '';
    proc.stdout.on('data', (data) => { stdout += data; });
    proc.on('close', () => resolve(stdout.trim() || 'No matches found'));
    proc.on('error', () => resolve('No matches found'));
  });
  return result;
}
