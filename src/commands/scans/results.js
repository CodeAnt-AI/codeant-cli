import { resolveScan } from './lib/resolveScan.js';
import { parseTypes } from './lib/categories.js';
import { normalizeIssue, buildEnvelope } from './lib/normalize.js';
import { applyFilters } from './lib/filters.js';
import { deterministicSort } from './lib/sort.js';
import { paginate } from './lib/paginate.js';
import { emit } from './lib/emit.js';
import { progress, logError } from './lib/log.js';
import { FORMATTERS } from './formatters/index.js';
import { fetchDismissedAlerts } from '../../scans/fetchDismissedAlerts.js';

/**
 * codeant scans results — full orchestration.
 *
 * @param {object} opts
 */
export async function runResults(opts = {}) {
  const {
    repo,
    scan,
    branch,
    types,
    severity,
    path: pathGlob,
    check: checkRegex,
    includeDismissed = false,
    format = 'json',
    output: outputPath = null,
    fields = null,
    limit = 100,
    offset = 0,
    failFast = false,
  } = opts;

  if (!repo) {
    const err = new Error('--repo is required');
    err.exitCode = 1;
    throw err;
  }

  const formatter = FORMATTERS[format];
  if (!formatter) {
    const err = new Error(`Unknown --format "${format}". Valid: ${Object.keys(FORMATTERS).join(', ')}`);
    err.exitCode = 1;
    throw err;
  }

  // 1. Resolve scan
  progress(`resolving scan for ${repo}…`);
  const scanMeta = await resolveScan({ repo, scan, branch });
  progress(`using commit ${scanMeta.commit_id} (${scanMeta.resolved_by})`);

  // 2. Parse types
  const categories = parseTypes(types);

  // 3. Fetch in parallel + dismissed alerts
  progress(`fetching ${categories.map((c) => c.key).join(', ')}…`);
  const [settled, dismissedResult] = await Promise.all([
    Promise.allSettled(categories.map((c) => c.fetcher(repo, scanMeta.commit_id))),
    includeDismissed
      ? Promise.resolve({ success: true, dismissedAlerts: [] })
      : fetchDismissedAlerts(repo, 'security'),
  ]);

  const dismissedAlerts = dismissedResult.success ? (dismissedResult.dismissedAlerts ?? []) : [];

  // 4. Collect findings + errors
  const allFindings = [];
  const errors = [];

  for (let i = 0; i < settled.length; i++) {
    const cat = categories[i];
    const s = settled[i];

    if (s.status === 'rejected' || !s.value?.success) {
      const msg = s.status === 'rejected' ? s.reason?.message : s.value?.error;
      errors.push({ category: cat.key, error: msg || 'unknown error' });
      logError({ category: cat.key, error: msg || 'unknown error' });
      if (failFast) {
        const err = new Error(`Category "${cat.key}" failed: ${msg}`);
        err.exitCode = 3;
        throw err;
      }
      continue;
    }

    progress(`normalizing ${cat.key} (${s.value.issues?.length ?? 0} issues)…`);
    for (const issue of s.value.issues ?? []) {
      const f = normalizeIssue(issue, cat.key);
      if (f) allFindings.push(f);
    }
  }

  // 5. Filter
  const severityList = severity
    ? severity.split(',').map((s) => s.trim()).filter(Boolean)
    : null;

  const filtered = applyFilters(allFindings, {
    severity: severityList,
    pathGlob: pathGlob || null,
    checkRegex: checkRegex || null,
    dismissedAlerts,
    includeDismissed,
  });

  // 6. Sort
  const sorted = deterministicSort(filtered);

  // 7. Paginate
  const { items: pageItems, pagination } = paginate(sorted, { limit, offset });

  // 8. Build envelope (summary uses pre-pagination totals)
  const filtersObj = {
    severity: severityList,
    path: pathGlob || null,
    check: checkRegex || null,
    include_dismissed: includeDismissed,
  };

  // Rebuild summary from all filtered (pre-page) findings
  const summaryBySev = { critical: 0, high: 0, medium: 0, low: 0, info: 0, unknown: 0 };
  const summaryByCat = {};
  for (const f of sorted) {
    summaryBySev[f.severity] = (summaryBySev[f.severity] ?? 0) + 1;
    summaryByCat[f.category] = (summaryByCat[f.category] ?? 0) + 1;
  }

  const envelope = buildEnvelope({
    repo,
    scan: scanMeta,
    categories: categories.map((c) => c.key),
    findings: pageItems,
    pagination,
    filters: filtersObj,
    errors,
  });
  // Override summary with pre-pagination counts
  envelope.summary = { total: sorted.length, by_severity: summaryBySev, by_category: summaryByCat };

  // 9. Project fields
  if (fields) {
    const fieldList = fields.split(',').map((f) => f.trim()).filter(Boolean);
    envelope.findings = envelope.findings.map((f) => {
      const projected = {};
      for (const key of fieldList) {
        if (key in f) projected[key] = f[key];
      }
      return projected;
    });
  }

  // 10. Render + emit
  const rendered = formatter.render(envelope);
  emit(rendered, outputPath, envelope.findings.length);
}
