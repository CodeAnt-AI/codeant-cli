#!/usr/bin/env node
// MCPB bundle entry point. The build script (scripts/build-mcpb.mjs) copies
// the entire `src/` tree alongside this file so the relative import below resolves.
import { startMcpServer } from '../src/mcp/server.js';

startMcpServer().catch((err) => {
  // stderr is forwarded to mcp-server-codeant.log in Claude Desktop.
  console.error('[codeant-mcpb] fatal:', err);
  process.exit(1);
});
