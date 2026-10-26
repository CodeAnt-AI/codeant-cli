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
| `--types <list>` | Comma-separated types: `sast`, `sca`, `secrets`, `iac`, `dead_code`, `duplicate_code`, `sbom`, `anti_patterns`, `docstring`, `complex_functions`, `all` (default: `all`) |
| `--severity <list>` | Filter by severity (e.g. `critical,high`) |
| `--path <glob>` | Filter by file path glob |
| `--check <regex>` | Filter by check ID or name (regex) |
| `--filter-dismissed` | Exclude dismissed findings (included by default, marked `metadata.dismissed`) |
| `--no-false-positives` | Exclude false positives, including ones users marked in the app (included by default, marked `metadata.false_positive`) |
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

# Only open findings: drop dismissed findings and false positives
codeant scans results --repo acme/backend --filter-dismissed --no-false-positives

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
| `--analysis-type <type>` | `security`, `secrets`, `sca`, `iac`, `antipatterns`, `docstring`, `complex_functions`, `dead_code`, or `duplicate_code` (default: `security`). Result-type names `sast` and `anti_patterns` are accepted too. |

**Examples:**

```bash
# List dismissed security alerts
codeant scans dismissed --repo acme/backend

# List dismissed secrets alerts
codeant scans dismissed --repo acme/backend --analysis-type secrets
```

---

### `scans overrides`

List the per-finding overrides users set in the CodeAnt app: Mark/Unmark false positive (`security`, `iac`), secrets confidence (`secrets`), and Change Severity (`security`, `sca`). `scans results` already applies them.

```bash
codeant scans overrides --repo <owner/repo> [--analysis-type security|secrets|iac|sca]
```

---

### `scans start-scan`

Trigger a new analysis run for a repository.

```bash
codeant scans start-scan [options]
```

All options are optional — `repo`, `branch`, and `commit` are auto-detected from the local git context when not provided.

**Options:**

| Option | Description |
|--------|-------------|
| `--repo <repo>` | Repository in `owner/repo` format (auto-detected from git remote) |
| `--branch <name>` | Branch to scan (auto-detected from current checkout) |
| `--commit <sha>` | Commit SHA to scan (resolved from remote HEAD of branch if omitted) |
| `--include <paths>` | Comma-separated file path glob patterns to include |
| `--exclude <paths>` | Comma-separated file path glob patterns to exclude |

**Examples:**

```bash
# Zero-config — auto-detects repo, branch, and latest commit
codeant scans start-scan

# Explicit repo and branch
codeant scans start-scan --repo your-org/your-repo --branch main

# Explicit commit SHA
codeant scans start-scan \
  --repo your-org/your-repo \
  --branch main \
  --commit b509bffa1721da442f35a7ccab969822711a67f0

# Scan only specific files
codeant scans start-scan \
  --branch main \
  --include "src/main.py,src/utils.py" \
  --exclude "tests/,*.md"
```

## Git history secrets (beta)

Deploy the backend history API before upgrading automation. Requests against an older backend fail with an explicit `historical_secrets_v1` unsupported-capability message. An explicitly requested history fetch failure exits nonzero, including without `--fail-fast`. Scan history (`scans history`) lists analysis runs; Git history findings use the scope below.

```bash
# Start only the history scanner. Capture scan_run_id from the JSON response.
codeant scans start-scan --repo acme/backend --branch main \
  --commit b509bffa1721da442f35a7ccab969822711a67f0 \
  --types historical_secrets --json

# Poll the returned run ID until completed, failed, or disabled.
codeant scans status --repo acme/backend --run "$RUN_ID"

# Retrieve that run; --scan selects the comparison snapshot, not a history run.
codeant findings repo --repo acme/backend --types secrets \
  --secrets-scope history --history-run "$RUN_ID" \
  --scan b509bffa1721da442f35a7ccab969822711a67f0

# Combine current findings with historical occurrence evidence.
codeant scans results --repo acme/backend --types secrets --secrets-scope all
```

Latest history results retain the last completed assessment while a newer run is pending or failed; the run status still describes the latest job. An explicit `--history-run` retrieves only that run.

`--secrets-scope` accepts `current` (default), `history`, or `all`. `--history-run` selects one immutable run identity; otherwise the latest history run is read. Status values are `not_started`, `queued`, `running`, `awaiting_verification`, `completed`, `failed`, and `disabled`. Failed and disabled runs are terminal outcomes, not clean scans. Jobs stalled for over one hour are reported as failed. When available, `last_completed_run_id` identifies the previous successful run. Results from incomplete runs must not be treated as a complete assessment.

History findings expose `metadata.commit`, `branches`, `tags`, `scanned_at`, `only_in_history`, and native `verification_status`. Branches/tags contain the commit at scan time; they do not identify where it originated. `only_in_history` compares the secret identity against the selected, unfiltered snapshot, including findings dismissed or marked false positive. It is `null` when the baseline is unavailable. History-only retrieval works without a snapshot scan; in that case `scan` is `null`.

`history_run` carries repository-wide job state independently of `scan.commit_id`. In scope `all`, matching current file/type/secret identities carry `metadata.history_occurrences`; other historical occurrences retain separate IDs. Current findings are not counted again for each historic occurrence at the same location.

Cached runtime validation is exposed as `metadata.live_status`, `live_validator`, `live_vendor`, `live_validated_at`, and `live_revalidated_at`. Native history `verification_status` and cached `live_status` remain separate signals. Null, unknown, unsupported, and error results do not mean revoked. Reads do not initiate validation. Raw credentials are excluded.

## SCA dependency evidence and normalized schema 1.1

```bash
codeant findings repo --repo acme/backend --types sca \
  --fields id,package,file_path,cve,metadata
```

A vulnerable package can now include:

```json
{
  "package": { "name": "vulnerable", "version": "1.0.0", "ecosystem": "NPM" },
  "file_path": "apps/web/package.json",
  "metadata": {
    "fix_version": "1.0.1",
    "fix_available": true,
    "dependency_paths_status": "resolved",
    "dependency_paths": [{
      "manifest": "apps/web/package.json",
      "lockfile": "pnpm-lock.yaml",
      "packages": ["direct@2.0.0", "vulnerable@1.0.0"],
      "direct_dependency": "direct@2.0.0",
      "chain_source": ["apps/web/package.json:12"],
      "resolution": "COMMITTED_LOCK",
      "provable": true
    }]
  }
}
```

Use the direct introducer and manifest to select the dependency to edit. `fix_version` fixes the vulnerable package; it does not promise a safe version of its direct introducer. There can be multiple introducers and manifest locations. Very large path payloads are bounded; `dependency_paths_truncated: true` and a `partial` path status identify incomplete public evidence. Lockfiles are null when unknown or generated rather than committed. Path status distinguishes `pending`, `resolved`, `partial`, and `unavailable`; a resolved empty list differs from unavailable evidence. Existing scans are readable, but missing evidence requires a new scan.

Schema 1.1 adds `category_status` (including independent SCA `dependency_paths_status`), optional `history_run`, and category metadata. SCA IDs now include package/version/manifest context; history IDs include commit and secret identity. Existing current-secret IDs are unchanged. JSON and field projection preserve metadata; SARIF includes it in result properties, and CSV adds JSON-encoded `package` and `metadata` columns.

## Tests

`npm test` runs offline tests. `npm run test:integration` opts into live scan/settings tests using the configured API credentials. These integration tests read real repository results; they require a reachable backend and suitable test data.

To run the deployed history/SCA contract tests against a completed test run with nonempty findings and a resolved SCA graph:

```bash
CODEANT_LIVE_TESTS=1 REPO=your-org/test-repo \
CODEANT_HISTORY_RUN=returned-run-uuid CODEANT_HISTORY_COMMIT=reference-commit-sha \
npm test -- tests/scans/history-secrets.test.js
```

This suite reads the specified fixture; it does not trigger scans or modify settings.

Scan-start aliases `anti_patterns` and `complex_functions` select the `antipatterns` scanner, which produces both result categories.
