import {
  fetchSastResults,
  fetchAntiPatternsResults,
  fetchDocstringResults,
  fetchComplexFunctionsResults,
} from '../../../scans/fetchScanResults.js';
import {
  fetchScaResults,
  fetchSbomResults,
  fetchSecretsResults,
  fetchIacResults,
  fetchDeadCodeResults,
} from '../../../scans/fetchAdvancedScanResults.js';

/**
 * Category registry. Add one row to support a new scan type throughout the CLI.
 * kind: 'code' | 'package' | 'inventory' | 'secret' | 'config'
 */
export const CATEGORIES = {
  sast:              { fetcher: fetchSastResults,             kind: 'code' },
  anti_patterns:     { fetcher: fetchAntiPatternsResults,     kind: 'code' },
  docstring:         { fetcher: fetchDocstringResults,        kind: 'code' },
  complex_functions: { fetcher: fetchComplexFunctionsResults, kind: 'code' },
  sca:               { fetcher: fetchScaResults,              kind: 'package' },
  sbom:              { fetcher: fetchSbomResults,             kind: 'inventory' },
  secrets:           { fetcher: fetchSecretsResults,          kind: 'secret' },
  iac:               { fetcher: fetchIacResults,              kind: 'config' },
  dead_code:         { fetcher: fetchDeadCodeResults,         kind: 'code' },
};

/**
 * Parse comma-separated --types value. 'all' expands to every key.
 * Returns array of { key, fetcher, kind }.
 * Throws with exit code 1 on unknown type name.
 */
export function parseTypes(typesStr) {
  const keys = Object.keys(CATEGORIES);
  const raw = typesStr ? typesStr.split(',').map((s) => s.trim()).filter(Boolean) : ['all'];

  const expanded = raw.includes('all') ? keys : raw;

  const unknown = expanded.filter((k) => !CATEGORIES[k]);
  if (unknown.length > 0) {
    const err = new Error(`Unknown type(s): ${unknown.join(', ')}. Valid: ${keys.join(', ')}`);
    err.exitCode = 1;
    err.detail = { error: `Unknown type(s): ${unknown.join(', ')}`, valid: keys };
    throw err;
  }

  return expanded.map((k) => ({ key: k, ...CATEGORIES[k] }));
}
