# CodeAnt application APIs from the CLI

The CLI uses the same authenticated CodeAnt API and organization/provider context as the web app. Sign in once, discover the connections available to that token, then use a first-class command or the generic API request command.

```bash
codeant login
codeant scans orgs
```

`CODEANT_API_TOKEN` and `CODEANT_API_URL` can be used instead of the saved login for agents, CI, and self-hosted installations.

## Hotlist findings

Hotlist commands use the same organization-wide snapshot, ranking, filters, stable finding IDs, and cursor pagination as the app.

```bash
# First page; org/service are auto-selected when unambiguous
codeant hotlist list

# Highest-priority production findings for one authenticated connection
codeant hotlist list \
  --org CodeAnt-AI \
  --service github \
  --severity critical,high \
  --validation exploit_confirmed \
  --limit 50

# Fetch every SCA finding across the organization
codeant hotlist list --org CodeAnt-AI --service github --type SCA --all

# Continue a page using next_cursor from the previous response
codeant hotlist list --org CodeAnt-AI --service github --cursor '<cursor>'

# Fetch exactly one finding using the stable ID shown in the app
codeant hotlist get 0123456789abcdef0123456789abcdef \
  --org CodeAnt-AI \
  --service github
```

Supported `hotlist list` filters:

| Option | Values |
|---|---|
| `--search` | title, repository/account, path, package, CVE, or check ID |
| `--type` | `AI Exploitation`, `SCA`, `SAST`, `Secrets`, `IaC`, `Infrastructure` |
| `--location` | repository full names or cloud accounts |
| `--severity` | `critical`, `high`, `medium`, `low`, `unknown` |
| `--ticket-status` | `created`, `not_created` |
| `--compliance` | framework keys such as `soc2` |
| `--validation` | `exploit_confirmed` |

Comma-separated values are accepted. The default page size is 30 and the maximum is 100. `--all` follows every cursor. If the first organization snapshot is still being built, the command waits up to 60 seconds; change that with `--max-wait <seconds>`.

For self-hosted GitHub, GitLab, Bitbucket, or Azure DevOps, the CLI normally discovers the provider base URL from the authenticated connection. Use `--provider-base-url` only to override it.

## Any app API

Use the generic request command when a first-class command does not exist yet:

```bash
codeant api request GET /some/read/endpoint --query '{"page":1}'

codeant api request POST /some/app/endpoint \
  --body '{"org":"CodeAnt-AI","service":"github"}'

codeant api request PATCH /some/app/endpoint \
  --body-file ./request.json \
  --header 'If-Match: revision-123'
```

The output is JSON:

```json
{
  "ok": true,
  "status": 200,
  "data": {}
}
```

Security properties:

- The path must start with `/` and is always resolved against the configured CodeAnt API host. Absolute and protocol-relative URLs are rejected, so the bearer token cannot be forwarded to another host.
- Authentication is supplied from `CODEANT_API_TOKEN` or the token saved by `codeant login`.
- `Authorization`, `Cookie`, `Host`, and `Content-Length` headers cannot be overridden.
- The backend remains authoritative for account access, organization membership, RBAC, and endpoint authorization.

The generic command can call write endpoints. Review the method, path, and body before running it.

## Agent and MCP access

Run `codeant mcp` or install the CodeAnt MCP bundle. Agents receive dedicated read-only tools:

- `codeant_hotlist_list` — filter and page through organization-wide findings.
- `codeant_hotlist_get` — fetch one finding by stable ID.
- `codeant_api_get` — authenticated GET access for newly-added read APIs.

Set `CODEANT_READ_ONLY=0` to opt in to write tools, including `codeant_api_request` for POST/PUT/PATCH/DELETE. Read-only mode is the default. The MCP server never opens a browser during startup; the agent must explicitly call `codeant_login` when no token is configured.

## Troubleshooting

| Error | Resolution |
|---|---|
| No matching organization | Run `codeant scans orgs`, then pass its exact `organizationName` and `service`. |
| Multiple organizations match | Pass both `--org` and `--service`. |
| Access denied (403) | Run `codeant logout`, then `codeant login`, or replace `CODEANT_API_TOKEN`. |
| Hotlist is still building | Retry, or increase `--max-wait`. |
| Finding not found | Refresh the app/Hotlist and copy the current stable finding ID and tenant context. |
