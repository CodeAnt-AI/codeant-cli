import { PostHog } from 'posthog-node';
import { getConfigValue } from './config.js';

const POSTHOG_API_KEY = 'phc_TpsLE5AMwHYsrSQIYgI7uqvorzlDMsin3lDvTEv2DxO';
const POSTHOG_HOST = 'https://r.codeant.ai';

let client = null;

/** Check if telemetry is disabled via env var or config. */
export function isTelemetryDisabled() {
  const envVal = process.env.CODEANT_TELEMETRY_DISABLED;
  if (envVal !== undefined) {
    return envVal === '1' || envVal.toLowerCase() === 'true';
  }
  return getConfigValue('telemetryEnabled') === false;
}

function getClient() {
  if (!client) {
    client = new PostHog(POSTHOG_API_KEY, { host: POSTHOG_HOST, flushAt: 1, flushInterval: 0 });
  }
  return client;
}

/** Use the API key directly as distinct ID */
function getDistinctId() {
  return process.env.CODEANT_API_TOKEN || getConfigValue('apiKey') || 'anonymous';
}

/**
 * Track an analytics event. Fire-and-forget — never throws or blocks the CLI.
 * Respects telemetry opt-out via config or CODEANT_TELEMETRY_DISABLED env var.
 * @param {string} event - Event name (e.g. 'review_triggered')
 * @param {Object} [properties={}] - Event properties
 */
export function track(event, properties = {}) {
  try {
    if (isTelemetryDisabled()) return;
    getClient().capture({
      distinctId: getDistinctId(),
      event,
      properties: { source: 'cli', cli_version: process.env.npm_package_version || 'unknown', ...properties },
    });
  } catch (_) {
    // Analytics should never break the CLI
  }
}

/** Flush pending events. Call before process exits. */
export async function shutdown() {
  try {
    if (client) await client.shutdown();
  } catch (_) {
    // noop
  }
}
