# CodeAnt CLI

A command-line tool for code review and security scanning.

## Installation

```bash
npm install -g codeant-cli
```

Or run locally:

```bash
git clone https://github.com/codeantai/codeant-cli.git
cd codeant-cli
npm install
npm link
```

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

## License

MIT
