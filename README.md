# CodeAnt CLI

A command-line tool for code review and security scanning.

## Installation

```bash
npm install -g codeant-cli
```

For installation, authentication, and self-hosted setup, see the [CodeAnt CLI setup guide](https://docs.codeant.ai/cli/setup).

## Quick Start

```bash
# Login to CodeAnt
codeant login

# Scan staged files for secrets
codeant secrets
```

## Usage

```bash
codeant <command> [options]
```

### Commands

#### `login`

Authenticate with CodeAnt. Opens a browser window for login.

```bash
codeant login
```

#### `logout`

Log out from CodeAnt.

```bash
codeant logout
```

#### `secrets`

Scan your code for exposed secrets, API keys, and credentials.

```bash
codeant secrets [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--staged` | Scan only staged files (default) |
| `--all` | Scan all changed files compared to base branch |
| `--uncommitted` | Scan all uncommitted changes |
| `--last-commit` | Scan files from the last commit |
| `--fail-on <level>` | Fail only on HIGH, MEDIUM, or all (default: HIGH) |
| `--include <patterns>` | Comma-separated glob patterns to include files |
| `--exclude <patterns>` | Comma-separated glob patterns to exclude files |

**Examples:**

```bash
# Scan staged files (default)
codeant secrets

# Scan all changed files
codeant secrets --all

# Scan last commit
codeant secrets --last-commit

# Only fail on HIGH confidence secrets (default)
codeant secrets --fail-on HIGH

# Fail on HIGH and MEDIUM confidence secrets
codeant secrets --fail-on MEDIUM

# Fail on all secrets (except false positives)
codeant secrets --fail-on all

# Filter files using glob patterns
codeant secrets --include '**/*.js'                           # Only JS files
codeant secrets --exclude 'node_modules/**,*.test.js'         # Exclude patterns
codeant secrets --include 'src/**' --exclude '*.test.*'       # Combine both
```

**File Filtering:**

Use `--include` and `--exclude` with glob patterns to filter files:
- `*` matches any characters except `/`
- `**` matches any characters including `/`
- `*.{js,ts}` matches multiple extensions
- Comma-separated for multiple patterns: `--exclude 'test/**,dist/**'`

**Exit codes:**
- `0` - No blocking secrets found (or only false positives)
- `1` - Secrets detected that match the `--fail-on` threshold

**Confidence Levels:**
- `HIGH` - High confidence, likely a real secret
- `MEDIUM` - Medium confidence, may need review
- `FALSE_POSITIVE` - Detected but likely not a real secret (always ignored)

#### `set-base-url <url>`

Set a custom API base URL.

```bash
codeant set-base-url https://api.example.com
```

#### `get-base-url`

Show the current API base URL and its source.

```bash
codeant get-base-url
```

#### `hotlist`

Query the same organization-wide prioritized findings shown in the CodeAnt Hotlist, or fetch one finding by its stable ID.

```bash
codeant hotlist list --org CodeAnt-AI --service github --severity critical,high
codeant hotlist get 0123456789abcdef0123456789abcdef --org CodeAnt-AI --service github
```

#### `findings`

Access repository, organization Hotlist, cloud-security, anti-pattern, and pentest findings through one command group.

```bash
codeant findings repos --org CodeAnt-AI
codeant findings repo --repo CodeAnt-AI/example --types sast,sca,iac,anti_patterns
codeant findings list --severity critical,high
codeant findings cloud history --provider all
codeant findings pentest history
```

See the [CodeAnt findings documentation](https://docs.codeant.ai/cli/findings) for the complete command and agent manual.

#### `api request`

Call any CodeAnt application API using the saved bearer token. Only relative paths on the configured CodeAnt API host are accepted.

```bash
codeant api request GET /some/read/endpoint --org CodeAnt-AI --service github --query '{"page":1}'
codeant api request POST /some/app/endpoint --org CodeAnt-AI --service github --body '{"repo":"CodeAnt-AI/example"}'
```

See the [CodeAnt findings documentation](https://docs.codeant.ai/cli/findings) for all finding commands, authentication, self-hosted provider, and agent/MCP details.

### Global Options

```bash
codeant --version    # Show version
codeant --help       # Show help
```

## Configuration

Config is stored in `~/.codeant/config.json`.

You can also use environment variables:

| Variable | Description |
|----------|-------------|
| `CODEANT_API_URL` | API base URL (overrides config) |
| `CODEANT_API_TOKEN` | Authentication token (overrides config) |

**Priority order:**
1. Environment variables (highest)
2. Config file (`~/.codeant/config.json`)
3. Default values

## Git Hooks

Use CodeAnt as a pre-commit hook to prevent secrets from being committed.

### Manual Setup

Create `.git/hooks/pre-commit`:

```bash
#!/bin/sh
codeant secrets
```

Make it executable:

```bash
chmod +x .git/hooks/pre-commit
```

### With Husky

```bash
npx husky add .husky/pre-commit "codeant secrets"
```

### With lefthook

Add to `lefthook.yml`:

```yaml
pre-commit:
  commands:
    secrets:
      run: codeant secrets
```

## Example Output

### Secrets Found (blocking)

```
✗ 2 secret(s) found!

src/config.js
  Line 5: AWS Access Key (HIGH)
  Line 12: API Key (HIGH)

Remove secrets before committing.
```

### Only False Positives (non-blocking)

```
⚠ 1 potential secret(s) found (ignored)

Ignored (false positives):
  src/example.js
    Line 10: Generic Secret (FALSE_POSITIVE)

✓ Commit allowed (only false positives found)
```

### No Secrets

```
✓ No secrets found
```

## Development

```bash
# Run locally
node src/index.js secrets

# Run with npm
npm start secrets

# Test different scan types
node src/index.js secrets --last-commit
node src/index.js secrets --all
```

## MCP / Claude Connector

This package also ships an MCP (Model Context Protocol) server that exposes CodeAnt's scan, review, and PR data as tools to Claude and other MCP clients. The same source tree is packaged as a Desktop Extension (`.mcpb`) for one-click install in Claude Desktop.

See the [CodeAnt MCP server documentation](https://docs.codeant.ai/cli/mcp-server) for the tools listing and installation paths. See the [CodeAnt findings documentation](https://docs.codeant.ai/cli/findings) for Hotlist and authenticated API usage.

## Privacy Policy

Full policy: **https://www.codeant.ai/privacy-policy**

Summary of what this CLI / MCP server sends and stores:

- **Data sent to CodeAnt servers.** Authentication tokens, repository metadata (org, repo, branch, PR identifiers), and — for local review and secrets scanning — the code snippets and diffs you explicitly ask CodeAnt to scan. Nothing is sent on its own; every call is in response to a command you run or a tool Claude invokes.
- **Where it is stored.** On CodeAnt's infrastructure (https://api.codeant.ai or your self-hosted instance). Locally, the auth token is cached in `~/.codeant/config.json` on your machine.
- **Third-party sharing.** None beyond CodeAnt's own infrastructure. CodeAnt does not sell or share your data with third parties for marketing.
- **Retention.** Scan findings and PR data are retained per the CodeAnt account's retention policy (see the privacy URL above). Local config persists until you run `codeant logout` or delete `~/.codeant/config.json`.
- **Contact.** support@codeant.ai

## License

MIT
