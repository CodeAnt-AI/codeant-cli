import path from 'path';

export function assertInsideCwd(resolved, cwd) {
  const base = path.resolve(cwd);
  const target = path.resolve(resolved);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`Access denied: path is outside the working directory`);
  }
}
