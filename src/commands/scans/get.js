import { resolveScan } from './lib/resolveScan.js';
import { parseTypes } from './lib/categories.js';
import { normalizeIssue, normalizeSeverity } from './lib/normalize.js';
import { progress } from './lib/log.js';

const SEV_KEYS = ['critical', 'high', 'medium', 'low', 'info', 'unknown'];

/**
 * codeant scans get --repo <repo> [--scan <sha>] [--branch <name>] [--types <list>]
 * Returns metadata + summary (severity/category counts). No findings array.
 */
export async function runGet({ repo, scan, branch, types } = {}) {
  if (!repo) {
    const err = new Error('--repo is required');
    err.exitCode = 1;
    throw err;
  }

  progress(`resolving scan for ${repo}…`);
  const scanMeta = await resolveScan({ repo, scan, branch });

  const categories = parseTypes(types);
  progress(`fetching ${categories.map((c) => c.key).join(', ')}…`);

  const settled = await Promise.allSettled(
    categories.map((c) => c.fetcher(repo, scanMeta.commit_id))
  );

  const bySeverity = Object.fromEntries(SEV_KEYS.map((k) => [k, 0]));
  const byCategory = {};
  const errors = [];
  let total = 0;

  for (let i = 0; i < settled.length; i++) {
    const cat = categories[i];
    const s = settled[i];

    if (s.status === 'rejected' || !s.value?.success) {
      const msg = s.status === 'rejected' ? s.reason?.message : s.value?.error;
      errors.push({ category: cat.key, error: msg || 'unknown error' });
      byCategory[cat.key] = 0;
      continue;
    }

    const issues = s.value.issues || [];
    byCategory[cat.key] = issues.length;
    total += issues.length;

    for (const issue of issues) {
      const normalized = normalizeIssue(issue, cat.key);
      if (normalized) {
        bySeverity[normalized.severity] = (bySeverity[normalized.severity] ?? 0) + 1;
      }
    }
  }

  return {
    repo,
    scan: scanMeta,
    categories: categories.map((c) => c.key),
    summary: { total, by_severity: bySeverity, by_category: byCategory },
    errors,
  };
}
