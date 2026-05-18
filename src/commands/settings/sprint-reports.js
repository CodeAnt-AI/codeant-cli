import { fetchApi } from '../../utils/fetchApi.js';

export async function runSprintReportsList({ repo, status, configId } = {}) {
  return fetchApi('/extension/metrics/sprint-reports/list', 'POST', { repo, status, config_id: configId });
}

export async function runSprintReportsCreate({ name, repo, scheduleConfig, reportConfig, description, notificationConfig, createdBy } = {}) {
  if (!name) {
    const err = new Error('--name is required');
    err.exitCode = 1;
    throw err;
  }
  return fetchApi('/extension/metrics/sprint-reports/create', 'POST', {
    name,
    repo,
    schedule_config: scheduleConfig ? JSON.parse(scheduleConfig) : undefined,
    report_config: reportConfig ? JSON.parse(reportConfig) : undefined,
    description,
    notification_config: notificationConfig ? JSON.parse(notificationConfig) : undefined,
    created_by: createdBy,
  });
}

export async function runSprintReportsUpdate({ configId, status, name, description, scheduleConfig, reportConfig, notificationConfig } = {}) {
  if (!configId) {
    const err = new Error('--config-id is required');
    err.exitCode = 1;
    throw err;
  }
  return fetchApi('/extension/metrics/sprint-reports/update', 'POST', {
    config_id: configId,
    status,
    name,
    description,
    schedule_config: scheduleConfig ? JSON.parse(scheduleConfig) : undefined,
    report_config: reportConfig ? JSON.parse(reportConfig) : undefined,
    notification_config: notificationConfig ? JSON.parse(notificationConfig) : undefined,
  });
}
