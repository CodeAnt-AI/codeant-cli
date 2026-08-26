import { readFile } from 'node:fs/promises';

import { fetchApiResponse } from '../../utils/fetchApi.js';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const BLOCKED_HEADERS = new Set(['authorization', 'cookie', 'host', 'content-length']);

export function normalizeApiPath(path) {
  const value = String(path || '').trim();
  if (!value.startsWith('/') || value.startsWith('//')) {
    throw new Error('API path must be relative to the configured CodeAnt API URL and start with `/`.');
  }
  const resolved = new URL(value, 'https://codeant.invalid');
  if (resolved.origin !== 'https://codeant.invalid') {
    throw new Error('API path must stay on the configured CodeAnt API host.');
  }
  return `${resolved.pathname}${resolved.search}`;
}

export function parseJsonObject(value, label) {
  const parsed = parseJsonValue(value, label);
  if (parsed === undefined) return undefined;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

export function parseJsonValue(value, label) {
  if (value === undefined || value === null || value === '') return undefined;
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch (error) {
    throw new Error(`Invalid ${label} JSON: ${error.message}`);
  }
  return parsed;
}

export function parseHeaders(values = []) {
  const headers = {};
  for (const entry of values || []) {
    const separator = String(entry).indexOf(':');
    if (separator < 1) throw new Error(`Invalid header ${JSON.stringify(entry)}; expected "Name: value".`);
    const name = String(entry).slice(0, separator).trim();
    const value = String(entry).slice(separator + 1).trim();
    if (BLOCKED_HEADERS.has(name.toLowerCase())) {
      throw new Error(`Header ${name} is managed by CodeAnt CLI and cannot be overridden.`);
    }
    headers[name] = value;
  }
  return headers;
}

export async function runApiRequest({ path, method, query, body, bodyFile, headers } = {}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (!METHODS.has(normalizedMethod)) {
    throw new Error(`Unsupported method ${normalizedMethod}. Use ${[...METHODS].join(', ')}.`);
  }
  if (body !== undefined && bodyFile) {
    throw new Error('Use either --body or --body-file, not both.');
  }

  let requestBody = parseJsonValue(body, 'body');
  if (bodyFile) {
    requestBody = parseJsonValue(await readFile(bodyFile, 'utf8'), 'body file');
  }

  const response = await fetchApiResponse(normalizeApiPath(path), {
    method: normalizedMethod,
    query: parseJsonObject(query, 'query'),
    body: requestBody,
    headers: parseHeaders(headers),
    allowHttpError: true,
  });
  return { ok: response.ok, status: response.status, data: response.data };
}
