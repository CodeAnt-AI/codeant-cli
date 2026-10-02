import { fetchAppApi } from '../utils/fetchApi.js';

const LIMITS = [25, 100, 500];
// Every page re-reads the whole result server-side, so fetch a few at a time.
const CONCURRENCY = 5;

function pageParams(options) {
  const limit = options.limit === undefined ? 500 : Number(options.limit);
  const offset = options.offset === undefined ? 0 : Number(options.offset);
  if (!LIMITS.includes(limit)) throw new Error(`--limit must be one of: ${LIMITS.join(', ')}.`);
  if (!Number.isInteger(offset) || offset < 0 || offset % limit) {
    throw new Error('--offset must be a non-negative multiple of --limit.');
  }
  return { limit, offset };
}

// One page of `key` from a backend /paginated endpoint (with its `total`), or
// with `all` every page from `offset` on, merged into one list.
export async function fetchPaginated(endpoint, body, tenant, key, options = {}) {
  const { limit, offset } = pageParams(options);
  const fetchPage = (pageOffset) => fetchAppApi(endpoint, 'POST', { ...body, limit, offset: pageOffset }, tenant);
  const first = await fetchPage(offset);
  if (!options.all) return first;

  const offsets = [];
  for (let next = offset + limit; next < first.total; next += limit) offsets.push(next);
  const pages = [first];
  for (let index = 0; index < offsets.length; index += CONCURRENCY) {
    pages.push(...await Promise.all(offsets.slice(index, index + CONCURRENCY).map(fetchPage)));
  }
  return { ...first, [key]: pages.flatMap((page) => page[key] || []) };
}
