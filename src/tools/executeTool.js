import { readTool } from './readTool.js';
import { globTool } from './globTool.js';
import { grepTool } from './grepTool.js';
import { lsTool } from './lsTool.js';
import { bulkReadTool } from './bulkReadTool.js';

// Pragent prompts instruct the model to use absolute paths rooted at /workspace.
// The CLI works relative to the user's cwd, so strip that prefix (and any other
// leading slash) before handing off to the tool implementations.
function stripWorkspace(p) {
  if (typeof p !== 'string') return p;
  return p.replace(/^\/workspace\/?/, '').replace(/^\/+/, '');
}

function normalizeArgs(args) {
  if (!args || typeof args !== 'object') return args;
  const out = { ...args };
  if ('file_path' in out) out.file_path = stripWorkspace(out.file_path);
  if ('path' in out) out.path = stripWorkspace(out.path);
  if (Array.isArray(out.files)) {
    out.files = out.files.map((f) =>
      f && typeof f === 'object' ? { ...f, file_path: stripWorkspace(f.file_path) } : f
    );
  }
  return out;
}

export async function executeTool(toolCall, cwd) {
  const { name } = toolCall;
  const args = normalizeArgs(toolCall.args);

  try {
    if (name === 'Read') return await readTool(args, cwd);
    if (name === 'Glob') return await globTool(args, cwd);
    if (name === 'Grep') return await grepTool(args, cwd);
    if (name === 'LS') return await lsTool(args, cwd);
    if (name === 'BulkRead') return await bulkReadTool(args, cwd);

    // Bash intentionally not supported — see Extension/AgenticReview/tools.py.
    return `Unknown tool: ${name}`;
  } catch (err) {
    return `Error: ${err.message}`;
  }
}
