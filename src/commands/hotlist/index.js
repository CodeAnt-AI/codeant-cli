import { runHotlistGet, runHotlistList } from '../../hotlist/client.js';

function addTenantOptions(command) {
  return command
    .option('--org <org>', 'Organization name (auto-picked when unambiguous)')
    .option('--service <service>', 'github, gitlab, bitbucket, or azuredevops')
    .option('--provider-base-url <url>', 'Override the authenticated provider base URL')
    .option('--max-wait <seconds>', 'Wait for an initial Hotlist build', Number, 60);
}

export default function registerHotlistCommands(program, { runCmd }) {
  const hotlist = program
    .command('hotlist')
    .description('Query organization-wide prioritized Hotlist findings');

  addTenantOptions(
    hotlist
      .command('list')
      .description('List Hotlist findings using the same filters and ranking as the app')
      .option('--search <text>', 'Search title, repository, path, package, CVE, or check ID')
      .option('--type <values>', 'Comma-separated finding types')
      .option('--location <values>', 'Comma-separated repositories or cloud accounts')
      .option('--severity <values>', 'Comma-separated severities')
      .option('--ticket-status <values>', 'created,not_created')
      .option('--compliance <values>', 'Comma-separated compliance frameworks')
      .option('--validation <values>', 'Comma-separated validation flags (for example exploit_confirmed)')
      .option('--limit <n>', 'Page size from 1 to 100', Number, 30)
      .option('--cursor <cursor>', 'Continue from a previous next_cursor')
      .option('--all', 'Fetch every matching page', false),
  ).action((options) => runCmd(() => runHotlistList({
    org: options.org,
    service: options.service,
    providerBaseUrl: options.providerBaseUrl,
    maxWaitSeconds: options.maxWait,
    search: options.search,
    types: options.type,
    locations: options.location,
    severities: options.severity,
    ticketStatuses: options.ticketStatus,
    compliance: options.compliance,
    validation: options.validation,
    limit: options.limit,
    cursor: options.cursor,
    all: options.all,
  })));

  addTenantOptions(
    hotlist
      .command('get <finding-id>')
      .description('Get one finding by the stable ID shown in the Hotlist detail panel'),
  ).action((findingId, options) => runCmd(() => runHotlistGet({
    findingId,
    org: options.org,
    service: options.service,
    providerBaseUrl: options.providerBaseUrl,
    maxWaitSeconds: options.maxWait,
  })));
}
