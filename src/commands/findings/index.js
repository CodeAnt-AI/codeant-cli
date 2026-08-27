import { runRepos } from '../scans/repos.js';
import { runResults } from '../scans/results.js';
import { setQuiet, setNoColor } from '../scans/lib/log.js';
import { setNoColor as tableSetNoColor } from '../scans/formatters/table.js';
import { runHotlistGet, runHotlistList } from '../../hotlist/client.js';
import { runOrganizationAntipatterns } from '../../findings/antipatterns.js';
import { runCloudFindingGet, runCloudFindings, runCloudHistory } from '../../findings/cloud.js';
import { runPentestHistory, runPentestIssues, runPentestReport } from '../../findings/pentest.js';

function addTenantOptions(command) {
  return command
    .option('--org <org>', 'Organization name (auto-picked when unambiguous)')
    .option('--service <service>', 'github, gitlab, bitbucket, or azuredevops')
    .option('--provider-base-url <url>', 'Override the authenticated provider base URL');
}

function tenantOptions(options) {
  return {
    org: options.org,
    service: options.service,
    providerBaseUrl: options.providerBaseUrl,
  };
}

function addHotlistOptions(command) {
  return addTenantOptions(command)
    .option('--search <text>', 'Search title, repository, path, package, CVE, or check ID')
    .option('--type <values>', 'Comma-separated types: SAST,SCA,Secrets,IaC,Infrastructure,AI Exploitation')
    .option('--location <values>', 'Comma-separated repositories or cloud accounts')
    .option('--severity <values>', 'Comma-separated severities')
    .option('--ticket-status <values>', 'created,not_created')
    .option('--compliance <values>', 'Comma-separated compliance frameworks')
    .option('--validation <values>', 'Comma-separated validation flags')
    .option('--limit <n>', 'Page size from 1 to 100', Number, 30)
    .option('--cursor <cursor>', 'Continue from a previous next_cursor')
    .option('--all', 'Fetch every matching page', false)
    .option('--max-wait <seconds>', 'Wait for an initial Hotlist build', Number, 60);
}

function hotlistOptions(options) {
  return {
    ...tenantOptions(options),
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
    maxWaitSeconds: options.maxWait,
  };
}

function addCloudScopeOptions(command) {
  return addTenantOptions(command)
    .requiredOption('--provider <provider>', 'Cloud provider: aws, azure, or gcp')
    .option('--kind <kind>', 'Finding kind: cspm, vm, or container', 'cspm')
    .requiredOption('--scan-id <id>', 'Cloud scan ID')
    .option('--account-id <id>', 'AWS account ID')
    .option('--tenant-id <id>', 'Azure tenant ID')
    .option('--project-id <id>', 'GCP project ID')
    .option('--cloud-service <name>', 'Provider service filter or finding service');
}

function cloudOptions(options) {
  return {
    ...tenantOptions(options),
    provider: options.provider,
    kind: options.kind,
    scanId: options.scanId,
    accountId: options.accountId,
    tenantId: options.tenantId,
    projectId: options.projectId,
    cloudService: options.cloudService,
    severity: options.severity,
    status: options.status,
    framework: options.framework,
    subscriptionId: options.subscriptionId,
    exploitAttemptedOnly: options.exploitAttemptedOnly,
    minDaysUnused: options.minDaysUnused,
  };
}

function runRepoResults(options) {
  setQuiet(options.quiet);
  if (options.noColor) {
    setNoColor(true);
    tableSetNoColor(true);
  }
  return runResults({
    repo: options.repo,
    scan: options.scan,
    branch: options.branch,
    types: options.types,
    severity: options.severity,
    path: options.path,
    check: options.check,
    filterDismissed: options.filterDismissed || false,
    includeFalsePositives: options.falsePositives ?? true,
    format: options.format,
    output: options.output,
    fields: options.fields,
    limit: options.limit,
    offset: options.offset,
    failFast: options.failFast || false,
  });
}

export default function registerFindingsCommands(program, { runCmd }) {
  const findings = program.command('findings').description('Access CodeAnt findings from repositories, Hotlist, cloud security, and pentesting');

  findings
    .command('repos')
    .description('List repositories available for repo-level findings')
    .option('--org <org>', 'Organization name (auto-picked when only one is authenticated)')
    .action((options) => runCmd(() => runRepos({ org: options.org })));

  findings
    .command('repo')
    .description('Fetch repo-level SAST, SCA, IaC, secrets, anti-pattern, and quality findings')
    .requiredOption('--repo <repo>', 'Repository (owner/repo)')
    .option('--scan <sha>', 'Specific commit SHA to use')
    .option('--branch <name>', 'Resolve latest scan on this branch')
    .option('--types <list>', 'Comma-separated types: sast,sca,secrets,iac,dead_code,sbom,anti_patterns,docstring,complex_functions,all', 'all')
    .option('--severity <list>', 'Filter by severity')
    .option('--path <glob>', 'Filter by file path glob')
    .option('--check <regex>', 'Filter by check ID or name')
    .option('--filter-dismissed', 'Exclude dismissed findings')
    .option('--no-false-positives', 'Exclude false positives')
    .option('--format <fmt>', 'json|sarif|csv|md|table', 'json')
    .option('--output <path>', 'Write output to a file')
    .option('--fields <list>', 'Project findings to a subset of fields')
    .option('--limit <n>', 'Max findings per page', Number, 100)
    .option('--offset <n>', 'Pagination offset', Number, 0)
    .option('--fail-fast', 'Stop on the first category error')
    .option('--no-color', 'Disable ANSI color')
    .option('--quiet', 'Suppress progress output')
    .action(async (options) => {
      try { await runRepoResults(options); }
      catch (err) {
        process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
        process.exitCode = err.exitCode ?? 1;
      }
    });

  addHotlistOptions(findings.command('list').description('List organization-wide Hotlist findings'))
    .action((options) => runCmd(() => runHotlistList(hotlistOptions(options))));

  addTenantOptions(findings.command('get <finding-id>').description('Get one Hotlist finding by its stable ID'))
    .option('--max-wait <seconds>', 'Wait for an initial Hotlist build', Number, 60)
    .action((findingId, options) => runCmd(() => runHotlistGet({
      findingId,
      ...tenantOptions(options),
      maxWaitSeconds: options.maxWait,
    })));

  addTenantOptions(findings.command('antipatterns').description('List anti-pattern findings across selected or all organization repositories'))
    .option('--repos <repos>', 'Comma-separated owner/repo values; defaults to every repository')
    .action((options) => runCmd(() => runOrganizationAntipatterns({ ...tenantOptions(options), repos: options.repos })));

  const cloud = findings.command('cloud').description('Cloud security CSPM, VM, and container findings');
  addTenantOptions(cloud.command('history').description('List cloud scan history, or latest scans'))
    .option('--provider <provider>', 'aws, azure, gcp, or all', 'all')
    .option('--kind <kind>', 'Finding kind: cspm, vm, or container', 'cspm')
    .option('--latest', 'Return only latest CSPM scans')
    .action((options) => runCmd(() => runCloudHistory({ ...tenantOptions(options), provider: options.provider, kind: options.kind, latest: options.latest })));

  addCloudScopeOptions(cloud.command('list').description('List findings for a cloud scan'))
    .option('--severity <value>', 'Severity filter')
    .option('--status <value>', 'Finding status filter')
    .option('--framework <value>', 'Compliance framework filter')
    .option('--subscription-id <id>', 'Azure subscription ID filter')
    .option('--exploit-attempted-only', 'AWS findings with validation attempts only')
    .option('--min-days-unused <n>', 'Minimum unused age in days', Number)
    .action((options) => runCmd(() => runCloudFindings(cloudOptions(options))));

  addCloudScopeOptions(cloud.command('get').description('Get one cloud finding with full detail'))
    .requiredOption('--uid <uid>', 'Finding UID')
    .action((options) => runCmd(() => runCloudFindingGet({ ...cloudOptions(options), uid: options.uid })));

  const pentest = findings.command('pentest').description('Pentest histories, issues, and reports');
  addTenantOptions(pentest.command('history').description('List pentest engagements'))
    .action((options) => runCmd(() => runPentestHistory(tenantOptions(options))));

  addTenantOptions(pentest.command('issues').description('List all issues for a pentest engagement'))
    .requiredOption('--report-id <id>', 'Pentest report/engagement ID')
    .option('--variant <variant>', 'prod or test', 'prod')
    .action((options) => runCmd(() => runPentestIssues({ ...tenantOptions(options), reportId: options.reportId, variant: options.variant })));

  addTenantOptions(pentest.command('report').description('Get the full pentest customer report'))
    .requiredOption('--report-id <id>', 'Pentest report/engagement ID')
    .option('--variant <variant>', 'prod or test', 'prod')
    .action((options) => runCmd(() => runPentestReport({ ...tenantOptions(options), reportId: options.reportId, variant: options.variant })));
}
