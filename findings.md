# CodeAnt findings CLI

`codeant findings` is the unified, read-only entry point for findings visible in the CodeAnt app. It reuses the same authenticated backend endpoints and authorization checks as the UI.

```bash
codeant login
codeant scans orgs
codeant findings --help
```

When one login has multiple connections, pass the exact `--org` and `--service` values returned by `codeant scans orgs`. A self-hosted provider base URL is discovered from the selected connection; use `--provider-base-url` only as an explicit override.

## Coverage

| App data | CLI command | Scope |
|---|---|---|
| Repository list | `codeant findings repos` | organization |
| SAST, SCA, IaC, Secrets, SBOM | `codeant findings repo` | repository + scan/branch |
| Anti-patterns, dead code, docstrings, complex functions | `codeant findings repo` | repository + scan/branch |
| Prioritized SAST/SCA/IaC/Secrets/Infrastructure/AI Exploitation | `codeant findings list/get` | organization Hotlist |
| Anti-patterns across repositories | `codeant findings antipatterns` | selected repos or organization |
| AWS/Azure/GCP CSPM, VM, and container findings | `codeant findings cloud history/list/get` | organization + cloud resource scope |
| Pentest engagements, issues, reports | `codeant findings pentest history/issues/report` | organization + engagement |

The existing `codeant scans repos`, `codeant scans results`, and `codeant hotlist list/get` commands remain supported. The unified commands are aliases or thin authenticated clients, so existing scripts do not need to migrate.

## Repository list and repo-level findings

```bash
# List connected repositories
codeant findings repos --org CodeAnt-AI

# Latest scan, all supported finding types
codeant findings repo --repo CodeAnt-AI/example --types all

# Selected categories and severities
codeant findings repo \
  --repo CodeAnt-AI/example \
  --branch main \
  --types sast,sca,iac,anti_patterns \
  --severity critical,high

# A specific scan, formatted for another tool
codeant findings repo \
  --repo CodeAnt-AI/example \
  --scan 0123456789abcdef \
  --types sast,secrets \
  --format sarif \
  --output codeant.sarif
```

Supported repo types are `sast`, `sca`, `secrets`, `iac`, `dead_code`, `sbom`, `anti_patterns`, `docstring`, and `complex_functions`. Use `--types all` for all of them. Formats are `json`, `sarif`, `csv`, `md`, and `table`; JSON is the default.

Use `--filter-dismissed` to exclude dismissed findings and `--no-false-positives` to exclude false positives. `--path`, `--check`, `--limit`, and `--offset` support agent-friendly filtering and pagination.

## Organization Hotlist findings

`findings list/get` exposes the same stable IDs, prioritization, filters, and cursor pagination as the app Hotlist.

```bash
codeant findings list --org CodeAnt-AI --service github --severity critical,high
codeant findings list --type SCA,IaC --location CodeAnt-AI/example --all
codeant findings get 0123456789abcdef0123456789abcdef --org CodeAnt-AI --service github
```

Hotlist types are `SAST`, `SCA`, `Secrets`, `IaC`, `Infrastructure`, and `AI Exploitation`. The last two cover prioritized cloud-security and pentest findings. Use the dedicated cloud and pentest commands below when complete scan/engagement data is required.

## Organization anti-patterns

```bash
# Every repository in the selected organization
codeant findings antipatterns --org CodeAnt-AI --service github

# Only selected repositories
codeant findings antipatterns \
  --org CodeAnt-AI --service github \
  --repos CodeAnt-AI/api,CodeAnt-AI/web
```

When `--repos` is omitted, the CLI first lists the organization's repositories and sends all of them to the same aggregate anti-pattern endpoint used by the Quality Report UI.

## Cloud security findings

Cloud findings are organization/account scoped rather than repository scoped.

```bash
# History across AWS, Azure, and GCP
codeant findings cloud history --org CodeAnt-AI --service github

# Latest scan per provider
codeant findings cloud history --provider all --latest

# VM and container vulnerability scan histories
codeant findings cloud history --provider all --kind vm
codeant findings cloud history --provider all --kind container

# AWS findings and one full detail record
codeant findings cloud list --provider aws --scan-id <scan-id> --account-id <account-id>
codeant findings cloud get --provider aws --scan-id <scan-id> --uid <finding-uid> --cloud-service iam

# VM and container vulnerabilities use the same list/detail flow
codeant findings cloud list --provider aws --kind vm --scan-id <scan-id>
codeant findings cloud get --provider gcp --kind container --scan-id <scan-id> --uid <finding-uid>

# Azure requires the tenant ID
codeant findings cloud list \
  --provider azure --tenant-id <tenant-id> --scan-id <scan-id> \
  --severity high --subscription-id <subscription-id>

# GCP requires the project ID
codeant findings cloud list \
  --provider gcp --project-id <project-id> --scan-id <scan-id> \
  --framework cis
```

`--kind` defaults to `cspm`; use `vm` or `container` for the other Cloud Security result views. CSPM `cloud list` supports `--cloud-service`, `--severity`, `--status`, `--framework`, and `--min-days-unused`. AWS additionally supports `--exploit-attempted-only`; Azure additionally supports `--subscription-id`. CSPM responses include `findings` and `dismissed_findings`; VM/container responses preserve their UI result payload unchanged.

## Pentest findings

```bash
# Discover engagement IDs
codeant findings pentest history --org CodeAnt-AI --service github

# All available open issues for an engagement
codeant findings pentest issues --report-id <report-id>

# Full customer report
codeant findings pentest report --report-id <report-id>

# Test-environment variant
codeant findings pentest issues --report-id <report-id> --variant test
codeant findings pentest report --report-id <report-id> --variant test
```

`--variant prod` is the default. Pentest entitlements and critical/high redaction are enforced by the backend exactly as they are in the UI; the CLI does not bypass locked content.

## Agent/MCP tools

Agents can use these read-only MCP tools:

| Tool | Purpose |
|---|---|
| `codeant_scans_repos` | List repositories. |
| `codeant_scans_results` | Fetch repo-level SAST/SCA/IaC/Secrets/quality findings. |
| `codeant_hotlist_list`, `codeant_hotlist_get` | Query prioritized org-wide findings and stable IDs. |
| `codeant_findings_antipatterns` | Fetch selected or all-repo anti-pattern findings. |
| `codeant_cloud_scan_history` | Discover AWS/Azure/GCP scan IDs and scopes. |
| `codeant_cloud_findings_list`, `codeant_cloud_finding_get` | List cloud findings and retrieve full detail. |
| `codeant_pentest_history`, `codeant_pentest_issues`, `codeant_pentest_report` | Discover and inspect pentest engagements. |

All these tools are available in the default read-only MCP mode. A typical agent flow is discovery (`orgs` -> `repos`, cloud history, or pentest history), list/filter findings, then retrieve one detailed finding or report.

## Errors and access

| Error | Resolution |
|---|---|
| No or multiple matching organizations | Run `codeant scans orgs`; pass exact `--org` and `--service`. |
| Access denied (403) | Run `codeant logout`, then `codeant login`. Older CLI keys must be refreshed once. |
| Missing Azure/GCP scope | Pass `--tenant-id` for Azure or `--project-id` for GCP. |
| Report or scan not found | Use the corresponding history command and verify the selected tenant/provider. |
| Redacted pentest fields | Unlock the engagement in the app; CLI access follows the same entitlement. |

For the generic authenticated API escape hatch and authentication details, see [cli-api.md](cli-api.md).
