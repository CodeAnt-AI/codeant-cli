import { readTool } from './readTool.js';

const MAX_FILES = 10;

export async function bulkReadTool(args, cwd) {
  const files = Array.isArray(args.files) ? args.files.slice(0, MAX_FILES) : [];
  if (!files.length) return 'Error: BulkRead requires a non-empty `files` array';

  const parts = await Promise.all(
    files.map(async (f) => {
      try {
        const content = await readTool(f, cwd);
        return `===== ${f.file_path} =====\n${content}`;
      } catch (err) {
        return `===== ${f.file_path} =====\nError: ${err.message}`;
      }
    })
  );
  return parts.join('\n\n');
}
