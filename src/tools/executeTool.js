import { readTool } from './readTool.js';
import { globTool } from './globTool.js';
import { grepTool } from './grepTool.js';
import { lsTool } from './lsTool.js';

export async function executeTool(toolCall, cwd) {
  const { name, args } = toolCall;

  try {
    if (name === 'Read') {
      return await readTool(args, cwd);
    }

    if (name === 'Glob') {
      return await globTool(args, cwd);
    }

    if (name === 'Grep') {
      return await grepTool(args, cwd);
    }

    if (name === 'LS') {
      return await lsTool(args, cwd);
    }

    // Bash tool intentionally removed to prevent arbitrary command execution
    return `Unknown tool: ${name}`;
  } catch (err) {
    return `Error: ${err.message}`;
  }
}
