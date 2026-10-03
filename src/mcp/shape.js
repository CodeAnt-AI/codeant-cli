// Result shaping for MCP clients, which cap how much tool output they accept.
// CLI commands keep returning the full payloads; only MCP responses are trimmed.

const DEFAULT_MAX_RESULT_CHARS = 80_000;

const REPO_FIELDS = ['full_name', 'name', 'private', 'visibility', 'default_branch', 'language', 'description', 'archived', 'pushed_at'];
const CLOUD_SCAN_DETAIL = ['per_service', 'service_rollup', 'compliance_rollup', 'regions'];

export function maxResultChars() {
  const configured = Number(process.env.CODEANT_MCP_MAX_RESULT_CHARS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_RESULT_CHARS;
}

function page(items, { limit, offset = 0 }) {
  const slice = items.slice(offset, offset + limit);
  const end = offset + slice.length;
  return { items: slice, total: items.length, offset, limit, next_offset: end < items.length ? end : null };
}

function pick(record, fields) {
  const picked = {};
  for (const field of fields) if (field in record) picked[field] = record[field];
  return Object.keys(picked).length ? picked : record;
}

function omit(record, fields) {
  const kept = { ...record };
  for (const field of fields) delete kept[field];
  return kept;
}

export function shapeRepos(result, { search, limit = 100, offset = 0, full = false } = {}) {
  let repos = result.repos || [];
  if (search) {
    const query = search.toLowerCase();
    repos = repos.filter((repo) => String(repo.full_name || repo.name || '').toLowerCase().includes(query));
  }
  const { items, ...pagination } = page(repos, { limit, offset });
  return { org: result.org, ...pagination, repos: full ? items : items.map((repo) => pick(repo, REPO_FIELDS)) };
}

export function shapePentestHistory(result, { limit = 25, offset = 0, full = false } = {}) {
  const { history = [], ...rest } = result;
  const { items, ...pagination } = page(history, { limit, offset });
  return { ...rest, ...pagination, history: full ? items : items.map((entry) => omit(entry, ['credit_unlock'])) };
}

function shapeCloudScans(result, { limit, offset, full }) {
  if (!Array.isArray(result?.scans)) return result;
  const { items, ...pagination } = page(result.scans, { limit, offset });
  return {
    ...result,
    ...pagination,
    total: result.total ?? pagination.total,
    scans: full ? items : items.map((scan) => omit(scan, CLOUD_SCAN_DETAIL)),
  };
}

export function shapeCloudHistory(result, { limit = 10, offset = 0, full = false } = {}) {
  if (!result.providers) return shapeCloudScans(result, { limit, offset, full });
  const providers = Object.fromEntries(
    Object.entries(result.providers).map(([provider, value]) => [provider, shapeCloudScans(value, { limit, offset, full })]),
  );
  return { ...result, providers };
}

// CSPM findings come back unpaged (thousands per scan); VM/container results are
// already paged by the API, so only the per-finding detail is trimmed for them.
export function shapeCloudFindings(result, { kind = 'cspm', limit = 25, offset = 0, all = false, full = false } = {}) {
  const { findings = [], ...rest } = result;
  const trim = (items) => (full ? items : items.map((finding) => omit(finding, ['compliance'])));
  if (kind !== 'cspm') return { ...rest, findings: trim(findings) };
  const { items, ...pagination } = page(findings, { limit: all ? findings.length : limit, offset });
  return { ...rest, ...pagination, total: rest.total ?? pagination.total, findings: trim(items) };
}

export function tooLarge(length, hint) {
  const max = maxResultChars();
  return {
    error: `Result too large: ${length} characters (about ${Math.round(length / 4)} tokens), over the ${max}-character limit for one tool result.`,
    hint: `${hint || 'Narrow the request with limit/offset, filters, or fields where the tool supports them.'} Set CODEANT_MCP_MAX_RESULT_CHARS to raise the limit.`,
  };
}
