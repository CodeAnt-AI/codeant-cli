import fs from 'fs';
import path from 'path';

export async function readTool(args, cwd) {
  const filePath = path.resolve(cwd, args.file_path);
  const content = await fs.promises.readFile(filePath, 'utf8');
  const lines = content.split('\n');
  const offset = args.offset || 1;
  const limit = args.limit || lines.length;
  const selected = lines.slice(offset - 1, offset - 1 + limit);
  return selected.map((line, i) => `     ${offset + i}\t${line}`).join('\n');
}
