import { fetchApi } from '../../utils/fetchApi.js';

export async function runRecurringScanslist({ repo, status, scheduleId } = {}) {
  return fetchApi('/extension/analysis/recurring-scans/list', 'POST', { repo, status, schedule_id: scheduleId });
}

export async function runRecurringScansCreate({ name, repo, scheduleConfig, scanConfig, description, notificationConfig, createdBy } = {}) {
  if (!name) {
    const err = new Error('--name is required');
    err.exitCode = 1;
    throw err;
  }
  return fetchApi('/extension/analysis/recurring-scans/create', 'POST', {
    name,
    repo,
    schedule_config: scheduleConfig ? JSON.parse(scheduleConfig) : undefined,
    scan_config: scanConfig ? JSON.parse(scanConfig) : undefined,
    description,
    notification_config: notificationConfig ? JSON.parse(notificationConfig) : undefined,
    created_by: createdBy,
  });
}

export async function runRecurringScansUpdate({ scheduleId, repo, status, name, description, scheduleConfig, scanConfig, notificationConfig } = {}) {
  if (!scheduleId) {
    const err = new Error('--schedule-id is required');
    err.exitCode = 1;
    throw err;
  }
  return fetchApi('/extension/analysis/recurring-scans/update', 'POST', {
    schedule_id: scheduleId,
    repo,
    status,
    name,
    description,
    schedule_config: scheduleConfig ? JSON.parse(scheduleConfig) : undefined,
    scan_config: scanConfig ? JSON.parse(scanConfig) : undefined,
    notification_config: notificationConfig ? JSON.parse(notificationConfig) : undefined,
  });
}
