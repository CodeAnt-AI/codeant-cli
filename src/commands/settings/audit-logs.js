import { fetchApi } from '../../utils/fetchApi.js';

export async function runAuditLogsSettings({ days, page, limit } = {}) {
  return fetchApi('/extension/account/audit/settings', 'POST', {
    days: days !== undefined ? Number(days) : 30,
    page: page !== undefined ? Number(page) : 1,
    limit: limit !== undefined ? Number(limit) : 50,
  });
}
