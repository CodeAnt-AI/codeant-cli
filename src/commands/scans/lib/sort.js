const SEV_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1, unknown: 0 };

/**
 * Deterministic sort: severity desc, file_path asc, line_number asc, check_id asc, id asc.
 * Same input always produces byte-identical output.
 */
export function deterministicSort(findings) {
  return [...findings].sort((a, b) => {
    const sd = (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0);
    if (sd !== 0) return sd;
    const fp = (a.file_path ?? '').localeCompare(b.file_path ?? '', 'en', { sensitivity: 'base' });
    if (fp !== 0) return fp;
    const ln = (a.line_number ?? 0) - (b.line_number ?? 0);
    if (ln !== 0) return ln;
    const ci = (a.check_id ?? '').localeCompare(b.check_id ?? '', 'en');
    if (ci !== 0) return ci;
    return (a.id ?? '').localeCompare(b.id ?? '', 'en');
  });
}
