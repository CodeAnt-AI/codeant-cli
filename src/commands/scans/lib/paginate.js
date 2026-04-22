/**
 * Slice findings and return pagination metadata.
 * @param {Array} findings - full (sorted, filtered) findings array
 * @param {{ limit?: number, offset?: number }} opts
 * @returns {{ items: Array, pagination: object }}
 */
export function paginate(findings, { limit = 100, offset = 0 } = {}) {
  const total = findings.length;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : 100;
  const items = findings.slice(safeOffset, safeOffset + safeLimit);
  return {
    items,
    pagination: {
      limit: safeLimit,
      offset: safeOffset,
      returned: items.length,
      total,
      has_more: safeOffset + items.length < total,
    },
  };
}
