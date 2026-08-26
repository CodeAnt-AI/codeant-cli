# CodeAnt MCP Server

The CodeAnt CLI ships an MCP (Model Context Protocol) server that exposes CodeAnt's scan/review/PR data as tools Claude (and any other MCP client) can call directly.

- **Entrypoint:** `codeant mcp` — stdio transport, single subcommand registered in [src/index.js](src/index.js).
- **Server:** [src/mcp/server.js](src/mcp/server.js) — uses `@modelcontextprotocol/sdk` and registers tools via `server.registerTool(...)`.
- **Bundle:** the [mcpb/](mcpb/) directory + [scripts/build-mcpb.mjs](scripts/build-mcpb.mjs) produce a `.mcpb` Desktop Extension bundle (`dist/codeant.mcpb`).

## Tools registered

| Name | Read/Write | What it does |
|------|------------|--------------|
| `codeant_scans_orgs` | read | List authenticated CodeAnt orgs. |
| `codeant_scans_repos` | read | List repos in an org. |
| `codeant_scans_history` | read | Recent scan runs for a repo. |
| `codeant_scans_get` | read | Severity/category summary for one scan. |
| `codeant_scans_results` | read | Full findings (SAST, SCA, secrets, IaC, …) for one scan. |
| `codeant_scans_dismissed` | read | Dismissed alerts for a repo. |
| `codeant_hotlist_list` | read | Prioritized organization-wide Hotlist findings with stable IDs. |
| `codeant_hotlist_get` | read | One complete Hotlist finding by stable ID. |
| `codeant_api_get` | read | Authenticated GET request to any relative CodeAnt app API path, with exact org/provider context. |
| `codeant_pr_list` | read | List PRs/MRs across GitHub, GitLab, Bitbucket, Azure DevOps. |
| `codeant_pr_get` | read | Detail for a PR/MR. |
| `codeant_pr_comments` | read | Comments on a PR, filtered. |
| `codeant_comments_search` | read | Free-text search across CodeAnt review comments. |
| `codeant_review_local` | read | Run a CodeAnt review on local working-copy changes. |
| `codeant_scans_start` | **write** | Trigger a new scan. Gated. |
| `codeant_pr_resolve` | **write** | Resolve a PR conversation thread. Gated. |
| `codeant_api_request` | **write** | Authenticated POST/PUT/PATCH/DELETE request to a relative CodeAnt app API path, with exact org/provider context. Gated. |

Write tools are only registered when `CODEANT_READ_ONLY=0`. Default = read-only.

For Hotlist examples, raw API syntax, tenant/provider selection, and response details, see [cli-api.md](cli-api.md).

Every tool carries MCP annotations (`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) so the client can decide whether to auto-approve calls.

## Configuration (env vars)

| Var | Purpose | Default |
|-----|---------|---------|
| `CODEANT_API_TOKEN` | API token (CodeAnt account → settings → API). Required. | — |
| `CODEANT_API_URL` | API base URL. Override for self-hosted. | `https://api.codeant.ai` |
| `CODEANT_READ_ONLY` | `1` to hide write tools, `0` to expose them. | `1` |

The CLI also reads these from `~/.codeant/config.json` when not set in env. For MCP usage prefer env — it keeps per-client config explicit.

---

## Install paths

### A — Claude Code CLI (terminal / VS Code extension)

```bash
claude mcp add codeant -s user -e CODEANT_READ_ONLY=1 -- codeant mcp
```

`-s user` puts it in your user-scope config so it works in every project. Use `-s project` to scope it to one repo (writes a `.mcp.json` at the repo root).

For a single project, you can instead drop this `.mcp.json` next to the project root:

```json
{
  "mcpServers": {
    "codeant": {
      "command": "codeant",
      "args": ["mcp"],
      "env": { "CODEANT_READ_ONLY": "1" }
    }
  }
}
```

Verify with `/mcp` inside a Claude Code session.

### B — Claude Desktop (manual config)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on Windows and add a `codeant` block:

```json
{
  "mcpServers": {
    "codeant": {
      "command": "codeant",
      "args": ["mcp"],
      "env": { "CODEANT_READ_ONLY": "1" }
    }
  }
}
```

Requires the `codeant` CLI to be on the desktop app's PATH. If you hit "command not found" in `~/Library/Logs/Claude/mcp-server-codeant.log`, swap `"command": "codeant"` for `"command": "node"` with `"args": ["<absolute-path-to>/codeant-cli/src/index.js", "mcp"]`.

Quit Claude Desktop (Cmd-Q — not just close the window) and relaunch. The server appears under **Settings → Connectors**.

### C — Claude Desktop (MCPB double-click)

The MCPB bundle is the only path that does not assume the user has the CodeAnt CLI installed — it ships everything in the bundle. This is what we submit to the Anthropic directory.

```bash
npm run mcpb:build
open -a Claude dist/codeant.mcpb
```

Claude pops an install dialog asking for the `user_config` fields:
- **CodeAnt API token** (sensitive, required)
- **API base URL** (defaults to `https://api.codeant.ai`)
- **Read-only mode** (defaults to on)

After install, manage it in **Settings → Connectors**.

If you also have a manual `claude_desktop_config.json` entry from path B, you'll see `codeant` listed twice — remove one to avoid duplicate tool listings.

---

## Packaging the MCPB bundle

### What gets bundled

```
codeant.mcpb (zip)
├── manifest.json          # from mcpb/manifest.json, version pinned to package.json
├── icon.png               # 256×256, from mcpb/icon.png
├── server/
│   └── index.js           # thin entry wrapper, calls startMcpServer()
├── src/                   # the entire CLI source tree
├── node_modules/          # production deps only (npm install --omit=dev)
└── package.json           # trimmed: only name/version/type/dependencies
```

The bundle is self-contained — Claude Desktop ships its own Node runtime, so no global install is required on the user's machine.

### Build it

```bash
npm run mcpb:build
```

Under the hood this runs [scripts/build-mcpb.mjs](scripts/build-mcpb.mjs):

1. Clean `dist/mcpb-stage/` and `dist/codeant.mcpb`.
2. Copy `src/` and `mcpb/server/` into the staging dir.
3. Write a trimmed `package.json` containing only production deps.
4. Run `npm install --omit=dev` inside the staging dir.
5. Copy `mcpb/manifest.json` (with `version` overridden from the root `package.json`) and `mcpb/icon.png`.
6. Zip the staging dir as `dist/codeant.mcpb`.

Result is typically ~11 MB. Verify the bundled server speaks MCP:

```bash
cd dist/mcpb-stage
(printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; sleep 1) | node server/index.js
```

Expect 16 tools in the `tools/list` response (or 19 if `CODEANT_READ_ONLY=0`).

### Bumping the version

Edit `version` in [package.json](package.json). The build script pins the manifest's `version` field from there, so you do not need to touch [mcpb/manifest.json](mcpb/manifest.json) for normal bumps.

### Replacing the icon

`mcpb/icon.png` should be a 256×256 PNG. The current one was rasterized from `../vscode-build/assets/Logo.svg` via `qlmanage`. To regenerate from a new SVG:

```bash
qlmanage -t -s 256 -o /tmp /path/to/Logo.svg
cp /tmp/Logo.svg.png mcpb/icon.png
npm run mcpb:build
```

---

## Submitting to the Anthropic directory

CodeAnt's MCP server uses stdio + a packaged bundle, so the submission route is **Desktop Extensions (MCPB)**, not the remote-connector form.

- **Submission URL:** https://claude.com/docs/connectors/building/submission
- **Bundle:** upload `dist/codeant.mcpb`
- **Required metadata:** already in [mcpb/manifest.json](mcpb/manifest.json) — display name, description, author, homepage, documentation, repository, license, keywords, `privacy_policies`, `tools` static listing, `user_config` schema.
- **Privacy policy.** Linked from both [README.md](README.md#privacy-policy) and the manifest's `privacy_policies` field (`https://www.codeant.ai/privacy-policy`).

Reviewer notes worth preparing:

- **Auth model.** CodeAnt uses a user-scoped API token entered into `user_config.api_token`. The token never leaves the user's machine — the bundle talks to `api.codeant.ai` (or the user's self-hosted URL) directly. No third-party OAuth flow needed.
- **Sandbox creds.** Email support@codeant.ai for a reviewer sandbox token; paste it into the submission form's reviewer-notes field along with an org slug that has scans + PRs to browse.
- **Write tools.** Gated behind `user_config.read_only` (defaults to on). Reviewers can toggle off to test `codeant_scans_start` / `codeant_pr_resolve`.

---

## Troubleshooting

| Symptom | Where to look |
|---|---|
| Server fails to start in Claude Desktop | `~/Library/Logs/Claude/mcp-server-codeant.log` |
| Tool calls return errors | Same log — server stderr is captured there. |
| Tool not listed at all | Check `CODEANT_READ_ONLY` — write tools are hidden when set to `1`. |
| Auth errors on every tool | Confirm `CODEANT_API_TOKEN` is set in the MCP env (not just in `~/.codeant/config.json`). |
| MCPB install dialog never appears | Open `.mcpb` with `open -a Claude dist/codeant.mcpb` to force the desktop app to handle it. |
