# `codeant scans`

Fetch and explore scan results from CodeAnt.

```bash
codeant scans <subcommand> [options]
```

---

## Subcommands

### `scans orgs`

List authenticated organizations.

```bash
codeant scans orgs
```

---

### `scans repos`

List repositories for an organization.

```bash
codeant scans repos [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--org <org>` | Organization name (auto-picked when only one is authenticated) |

**Examples:**

```bash
# List repos (auto-selects org if only one)
codeant scans repos

# List repos for a specific org
codeant scans repos --org my-org
```

---

### `scans history`

Show scan history for a repository.

```bash
codeant scans history --repo <owner/repo> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--repo <repo>` | **(required)** Repository in `owner/repo` format |
| `--branch <name>` | Filter by branch name |
| `--since <iso>` | Show scans since ISO date (e.g. `2024-01-01`) |
| `--limit <n>` | Max results (default: `20`) |

**Examples:**

```bash
# Show last 20 scans for a repo
codeant scans history --repo acme/backend

# Filter to a specific branch
codeant scans history --repo acme/backend --branch main

# Show scans since a date
codeant scans history --repo acme/backend --since 2024-06-01

# Show up to 50 results
codeant scans history --repo acme/backend --limit 50
```

---

### `scans get`

Show scan metadata and a severity/category summary. Does not include individual findings.

```bash
codeant scans get --repo <owner/repo> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--repo <repo>` | **(required)** Repository in `owner/repo` format |
| `--scan <sha>` | Specific commit SHA to use |
| `--branch <name>` | Resolve latest scan on this branch |
| `--types <list>` | Comma-separated scan types (default: `all`) |
| `--quiet` | Suppress progress output |

**Examples:**

```bash
# Get latest scan summary for a repo
codeant scans get --repo acme/backend

# Get scan for a specific commit
codeant scans get --repo acme/backend --scan abc1234

# Get latest scan on a branch
codeant scans get --repo acme/backend --branch main

# Only include SAST and secrets types
codeant scans get --repo acme/backend --types sast,secrets

# Suppress progress output
codeant scans get --repo acme/backend --quiet
```

---

### `scans results`

Fetch full scan findings for a repository.

```bash
codeant scans results --repo <owner/repo> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--repo <repo>` | **(required)** Repository in `owner/repo` format |
| `--scan <sha>` | Specific commit SHA to use |
| `--branch <name>` | Resolve latest scan on this branch |
| `--types <list>` | Comma-separated types: `sast`, `sca`, `secrets`, `iac`, `dead_code`, `sbom`, `anti_patterns`, `docstring`, `complex_functions`, `all` (default: `all`) |
| `--severity <list>` | Filter by severity (e.g. `critical,high`) |
| `--path <glob>` | Filter by file path glob |
| `--check <regex>` | Filter by check ID or name (regex) |
| `--include-dismissed` | Include dismissed findings (excluded by default) |
| `--format <fmt>` | Output format: `json`, `sarif`, `csv`, `md`, `table` (default: `json`) |
| `--output <path>` | Write output to file instead of stdout |
| `--fields <list>` | Project findings to a subset of fields (comma-separated) |
| `--limit <n>` | Max findings per page (default: `100`) |
| `--offset <n>` | Pagination offset (default: `0`) |
| `--fail-fast` | Exit `3` on first category fetch failure |
| `--no-color` | Disable ANSI color (auto-disabled when not a TTY) |
| `--quiet` | Suppress progress output on stderr |

**Examples:**

```bash
# Fetch all findings (JSON)
codeant scans results --repo acme/backend

# Fetch only critical and high severity findings
codeant scans results --repo acme/backend --severity critical,high

# Fetch SAST findings only
codeant scans results --repo acme/backend --types sast

# Filter to a specific file path
codeant scans results --repo acme/backend --path 'src/**/*.ts'

# Filter by check name using regex
codeant scans results --repo acme/backend --check 'sql-injection'

# Output as a Markdown table
codeant scans results --repo acme/backend --format md

# Output as SARIF to a file
codeant scans results --repo acme/backend --format sarif --output results.sarif

# Include dismissed findings
codeant scans results --repo acme/backend --include-dismissed

# Paginate through results
codeant scans results --repo acme/backend --limit 50 --offset 100

# Project only specific fields
codeant scans results --repo acme/backend --fields id,severity,message,path
```

**Exit codes:**

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `3` | Category fetch failure (with `--fail-fast`) |

---

### `scans dismissed`

List dismissed alerts for a repository.

```bash
codeant scans dismissed --repo <owner/repo> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--repo <repo>` | **(required)** Repository in `owner/repo` format |
| `--analysis-type <type>` | Analysis type: `security` or `secrets` (default: `security`) |

**Examples:**

```bash
# List dismissed security alerts
codeant scans dismissed --repo acme/backend

# List dismissed secrets alerts
codeant scans dismissed --repo acme/backend --analysis-type secrets
```
