import { runBranchesAll, runBranchesDefault, runBranchesUpdateDefault } from './branches.js';
import { runFeatureFlagsGet, runFeatureFlagsUpdate } from './feature-flags.js';
import { runAnalysisFeatureFlagsGet, runAnalysisFeatureFlagsUpdate } from './analysis-feature-flags.js';
import { runPrInstructionsGet, runPrInstructionsSave, runPrInstructionsEdit, runPrInstructionsDelete } from './pr-instructions.js';
import { runSlackChannels, runSlackChannelGet } from './slack.js';
import { runTeamsChannels, runTeamsChannelGet } from './teams.js';
import { runRecurringScanslist, runRecurringScansCreate, runRecurringScansUpdate } from './recurring-scans.js';
import { runSprintReportsList, runSprintReportsCreate, runSprintReportsUpdate } from './sprint-reports.js';
import { runCveReportingList, runCveReportingCreate, runCveReportingUpdate } from './cve-reporting.js';

/**
 * Register all `codeant settings <verb>` subcommands.
 *
 * Each subcommand implementation lives in its own file alongside this index
 * and exports a single async function named run<Command>(opts).
 *
 * To add a new subcommand:
 *   1. Create src/commands/settings/<name>.js exporting run<Name>(opts).
 *   2. Import it here.
 *   3. Add a settings.command(...).action(...) block below following the
 *      existing pattern.
 *
 * @param {import('commander').Command} program
 * @param {{ runCmd: Function }} helpers
 */
export default function registerSettingsCommands(program, { runCmd }) {
  const settings = program
    .command('settings')
    .description('Manage CodeAnt AI settings');

  // ── branches all ───────────────────────────────────────────────────────────
  settings
    .command('branches-all')
    .description('List all branches for a repository')
    .requiredOption('--repo <repo>', 'Repository (owner/repo)')
    .action((opts) => runCmd(() => runBranchesAll({ repo: opts.repo })));

  // ── branches default ───────────────────────────────────────────────────────
  settings
    .command('branches-default')
    .description('Get the default branch for a repository')
    .requiredOption('--repo <repo>', 'Repository (owner/repo)')
    .action((opts) => runCmd(() => runBranchesDefault({ repo: opts.repo })));

  // ── branches update-default ────────────────────────────────────────────────
  settings
    .command('branches-update-default')
    .description('Set the default branch for a repository')
    .requiredOption('--repo <repo>', 'Repository (owner/repo)')
    .requiredOption('--branch <name>', 'Branch name to set as default')
    .action((opts) => runCmd(() => runBranchesUpdateDefault({ repo: opts.repo, branch: opts.branch })));

  // ── feature-flags get ──────────────────────────────────────────────────────
  settings
    .command('feature-flags-get')
    .description('Get feature flags for a repository')
    .requiredOption('--repo <repo>', 'Repository (owner/repo)')
    .option('--v2', 'Use v2 feature flags', false)
    .action((opts) => runCmd(() => runFeatureFlagsGet({ repo: opts.repo, v2: opts.v2 })));

  // ── feature-flags update ───────────────────────────────────────────────────
  settings
    .command('feature-flags-update')
    .description('Update feature flags for a repository')
    .requiredOption('--repo <repo>', 'Repository (owner/repo)')
    .requiredOption('--flags <json>', 'Feature flags as a JSON string (e.g. \'{"pr_review":"enable"}\')')
    .option('--v2', 'Use v2 feature flags', false)
    .action((opts) => runCmd(() => runFeatureFlagsUpdate({ repo: opts.repo, flags: opts.flags, v2: opts.v2 })));

  // ── analysis feature-flags get ─────────────────────────────────────────────
  settings
    .command('analysis-feature-flags-get')
    .description('Get analysis feature flags for a repository')
    .requiredOption('--repo <repo>', 'Repository (owner/repo)')
    .action((opts) => runCmd(() => runAnalysisFeatureFlagsGet({ repo: opts.repo })));

  // ── analysis feature-flags update ─────────────────────────────────────────
  settings
    .command('analysis-feature-flags-update')
    .description('Update analysis feature flags for a repository')
    .requiredOption('--repo <repo>', 'Repository (owner/repo)')
    .requiredOption('--flags <json>', 'Feature flags as a JSON string (e.g. \'{"sast_analysis":"enabled"}\')')
    .action((opts) => runCmd(() => runAnalysisFeatureFlagsUpdate({ repo: opts.repo, flags: opts.flags })));

  // ── pr-instructions get ────────────────────────────────────────────────────
  settings
    .command('pr-instructions-get')
    .description('Get PR review instructions')
    .option('--type <type>', 'Instruction type (e.g. custom)')
    .action((opts) => runCmd(() => runPrInstructionsGet({ instructionsType: opts.type })));

  // ── pr-instructions save ───────────────────────────────────────────────────
  settings
    .command('pr-instructions-save')
    .description('Save a new PR review instruction')
    .option('--type <type>', 'Instruction type (e.g. custom)')
    .option('--file-pattern <pattern>', 'File pattern (e.g. *.py)')
    .option('--description <text>', 'Instruction description')
    .option('--description-file <path>', 'Path to a file containing the description')
    .option('--instruction-id <id>', 'Instruction ID (for upsert)')
    .action((opts) => runCmd(() => runPrInstructionsSave({
      instructionType: opts.type,
      filePattern: opts.filePattern,
      description: opts.description,
      descriptionFile: opts.descriptionFile,
      instructionId: opts.instructionId,
    })));

  // ── pr-instructions edit ───────────────────────────────────────────────────
  settings
    .command('pr-instructions-edit')
    .description('Edit an existing PR review instruction')
    .requiredOption('--instruction-id <id>', 'Instruction ID to edit')
    .option('--type <type>', 'Instruction type (e.g. custom)')
    .option('--description <text>', 'Updated description')
    .option('--description-file <path>', 'Path to a file containing the description')
    .option('--file-pattern <pattern>', 'Updated file pattern')
    .action((opts) => runCmd(() => runPrInstructionsEdit({
      instructionType: opts.type,
      instructionId: opts.instructionId,
      description: opts.description,
      descriptionFile: opts.descriptionFile,
      filePattern: opts.filePattern,
    })));

  // ── pr-instructions delete ─────────────────────────────────────────────────
  settings
    .command('pr-instructions-delete')
    .description('Delete a PR review instruction')
    .requiredOption('--instruction-id <id>', 'Instruction ID to delete')
    .option('--type <type>', 'Instruction type (e.g. custom)')
    .action((opts) => runCmd(() => runPrInstructionsDelete({
      instructionType: opts.type,
      instructionId: opts.instructionId,
    })));

  // ── slack channels ─────────────────────────────────────────────────────────
  settings
    .command('slack-channels')
    .description('List all available Slack channels')
    .action(() => runCmd(() => runSlackChannels()));

  // ── slack channel get ──────────────────────────────────────────────────────
  settings
    .command('slack-channel-get')
    .description('Get saved Slack channel configuration')
    .action(() => runCmd(() => runSlackChannelGet()));

  // ── teams channels ─────────────────────────────────────────────────────────
  settings
    .command('teams-channels')
    .description('List all available Microsoft Teams channels')
    .action(() => runCmd(() => runTeamsChannels()));

  // ── teams channel get ──────────────────────────────────────────────────────
  settings
    .command('teams-channel-get')
    .description('Get saved Microsoft Teams channel configuration')
    .action(() => runCmd(() => runTeamsChannelGet()));

  // ── recurring-scans list ───────────────────────────────────────────────────
  settings
    .command('recurring-scans-list')
    .description('List recurring scan schedules')
    .option('--repo <repo>', 'Filter by repository (owner/repo)')
    .option('--status <status>', 'Filter by status (e.g. ACTIVE)')
    .option('--schedule-id <id>', 'Filter by schedule ID')
    .action((opts) => runCmd(() => runRecurringScanslist({ repo: opts.repo, status: opts.status, scheduleId: opts.scheduleId })));

  // ── recurring-scans create ─────────────────────────────────────────────────
  settings
    .command('recurring-scans-create')
    .description('Create a recurring scan schedule')
    .requiredOption('--name <name>', 'Schedule name')
    .option('--repo <repo>', 'Repository (owner/repo)')
    .option('--schedule-config <json>', 'Schedule config as JSON (e.g. \'{"frequency":"weekly"}\')')
    .option('--scan-config <json>', 'Scan config as JSON')
    .option('--description <text>', 'Description')
    .option('--notification-config <json>', 'Notification config as JSON')
    .option('--created-by <user>', 'Creator identifier')
    .action((opts) => runCmd(() => runRecurringScansCreate({
      name: opts.name,
      repo: opts.repo,
      scheduleConfig: opts.scheduleConfig,
      scanConfig: opts.scanConfig,
      description: opts.description,
      notificationConfig: opts.notificationConfig,
      createdBy: opts.createdBy,
    })));

  // ── recurring-scans update ─────────────────────────────────────────────────
  settings
    .command('recurring-scans-update')
    .description('Update a recurring scan schedule')
    .requiredOption('--schedule-id <id>', 'Schedule ID to update')
    .option('--status <status>', 'New status (e.g. ACTIVE, INACTIVE)')
    .option('--name <name>', 'New name')
    .option('--description <text>', 'New description')
    .option('--schedule-config <json>', 'Schedule config as JSON')
    .option('--scan-config <json>', 'Scan config as JSON')
    .option('--notification-config <json>', 'Notification config as JSON')
    .action((opts) => runCmd(() => runRecurringScansUpdate({
      scheduleId: opts.scheduleId,
      status: opts.status,
      name: opts.name,
      description: opts.description,
      scheduleConfig: opts.scheduleConfig,
      scanConfig: opts.scanConfig,
      notificationConfig: opts.notificationConfig,
    })));

  // ── sprint-reports list ────────────────────────────────────────────────────
  settings
    .command('sprint-reports-list')
    .description('List sprint report configurations')
    .option('--repo <repo>', 'Filter by repository (owner/repo)')
    .option('--status <status>', 'Filter by status (e.g. ACTIVE)')
    .option('--config-id <id>', 'Filter by config ID')
    .action((opts) => runCmd(() => runSprintReportsList({ repo: opts.repo, status: opts.status, configId: opts.configId })));

  // ── sprint-reports create ──────────────────────────────────────────────────
  settings
    .command('sprint-reports-create')
    .description('Create a sprint report configuration')
    .requiredOption('--name <name>', 'Report name')
    .option('--repo <repo>', 'Repository (owner/repo)')
    .option('--schedule-config <json>', 'Schedule config as JSON (e.g. \'{"frequency":"weekly"}\')')
    .option('--report-config <json>', 'Report config as JSON')
    .option('--description <text>', 'Description')
    .option('--notification-config <json>', 'Notification config as JSON')
    .option('--created-by <user>', 'Creator identifier')
    .action((opts) => runCmd(() => runSprintReportsCreate({
      name: opts.name,
      repo: opts.repo,
      scheduleConfig: opts.scheduleConfig,
      reportConfig: opts.reportConfig,
      description: opts.description,
      notificationConfig: opts.notificationConfig,
      createdBy: opts.createdBy,
    })));

  // ── sprint-reports update ──────────────────────────────────────────────────
  settings
    .command('sprint-reports-update')
    .description('Update a sprint report configuration')
    .requiredOption('--config-id <id>', 'Config ID to update')
    .option('--status <status>', 'New status (e.g. ACTIVE, INACTIVE)')
    .option('--name <name>', 'New name')
    .option('--description <text>', 'New description')
    .option('--schedule-config <json>', 'Schedule config as JSON')
    .option('--report-config <json>', 'Report config as JSON')
    .option('--notification-config <json>', 'Notification config as JSON')
    .action((opts) => runCmd(() => runSprintReportsUpdate({
      configId: opts.configId,
      status: opts.status,
      name: opts.name,
      description: opts.description,
      scheduleConfig: opts.scheduleConfig,
      reportConfig: opts.reportConfig,
      notificationConfig: opts.notificationConfig,
    })));

  // ── cve-reporting list ─────────────────────────────────────────────────────
  settings
    .command('cve-reporting-list')
    .description('List CVE report configurations')
    .option('--repo <repo>', 'Filter by repository (owner/repo)')
    .option('--status <status>', 'Filter by status (e.g. ACTIVE)')
    .option('--report-id <id>', 'Filter by report ID')
    .action((opts) => runCmd(() => runCveReportingList({ repo: opts.repo, status: opts.status, reportId: opts.reportId })));

  // ── cve-reporting create ───────────────────────────────────────────────────
  settings
    .command('cve-reporting-create')
    .description('Create a CVE report configuration')
    .requiredOption('--name <name>', 'Report name')
    .option('--repo <repo>', 'Repository (owner/repo)')
    .option('--schedule-config <json>', 'Schedule config as JSON (e.g. \'{"frequency":"weekly"}\')')
    .option('--report-config <json>', 'Report config as JSON')
    .option('--description <text>', 'Description')
    .option('--notification-config <json>', 'Notification config as JSON')
    .option('--created-by <user>', 'Creator identifier')
    .action((opts) => runCmd(() => runCveReportingCreate({
      name: opts.name,
      repo: opts.repo,
      scheduleConfig: opts.scheduleConfig,
      reportConfig: opts.reportConfig,
      description: opts.description,
      notificationConfig: opts.notificationConfig,
      createdBy: opts.createdBy,
    })));

  // ── cve-reporting update ───────────────────────────────────────────────────
  settings
    .command('cve-reporting-update')
    .description('Update a CVE report configuration')
    .requiredOption('--report-id <id>', 'Report ID to update')
    .option('--status <status>', 'New status (e.g. ACTIVE, INACTIVE)')
    .option('--name <name>', 'New name')
    .option('--description <text>', 'New description')
    .option('--schedule-config <json>', 'Schedule config as JSON')
    .option('--report-config <json>', 'Report config as JSON')
    .option('--notification-config <json>', 'Notification config as JSON')
    .action((opts) => runCmd(() => runCveReportingUpdate({
      reportId: opts.reportId,
      status: opts.status,
      name: opts.name,
      description: opts.description,
      scheduleConfig: opts.scheduleConfig,
      reportConfig: opts.reportConfig,
      notificationConfig: opts.notificationConfig,
    })));
}
