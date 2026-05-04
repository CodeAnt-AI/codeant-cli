import { runOrgs } from './orgs.js';
import { runRepos } from './repos.js';
import { runHistory } from './history.js';
import { runGet } from './get.js';
import { runResults } from './results.js';
import { runDismissed } from './dismissed.js';
import { runStartScan } from './start-scan.js';
import { setQuiet, setNoColor } from './lib/log.js';
import { setNoColor as tableSetNoColor } from './formatters/table.js';

/**
 * Register all `codeant scans <verb>` subcommands.
 *
 * @param {import('commander').Command} program
 * @param {{ runCmd: Function }} helpers
 */
export default function registerScansCommands(program, { runCmd }) {
  const scans = program.command('scans').description('Fetch and explore scan results');

  // ── orgs ───────────────────────────────────────────────────────────────────
  scans
    .command('orgs')
    .description('List authenticated organizations')
    .action(() => runCmd(() => runOrgs()));

  // ── repos ──────────────────────────────────────────────────────────────────
  scans
    .command('repos')
    .description('List repositories')
    .option('--org <org>', 'Organization name (auto-picked when only one is authenticated)')
    .action((opts) => runCmd(() => runRepos({ org: opts.org })));

  // ── history ────────────────────────────────────────────────────────────────
  scans
    .command('history')
    .description('Show scan history for a repository')
    .requiredOption('--repo <repo>', 'Repository (owner/repo)')
    .option('--branch <name>', 'Filter by branch name')
    .option('--since <iso>', 'Show scans since ISO date')
    .option('--limit <n>', 'Max results (default: 20)', parseInt, 20)
    .action((opts) =>
      runCmd(() => runHistory({ repo: opts.repo, branch: opts.branch, since: opts.since, limit: opts.limit }))
    );

  // ── get ────────────────────────────────────────────────────────────────────
  scans
    .command('get')
    .description('Scan metadata + severity/category summary (no findings)')
    .requiredOption('--repo <repo>', 'Repository (owner/repo)')
    .option('--scan <sha>', 'Specific commit SHA to use')
    .option('--branch <name>', 'Resolve latest scan on this branch')
    .option('--types <list>', 'Comma-separated scan types (default: all)', 'all')
    .option('--quiet', 'Suppress progress output')
    .action((opts) => {
      setQuiet(opts.quiet);
      runCmd(() => runGet({ repo: opts.repo, scan: opts.scan, branch: opts.branch, types: opts.types }));
    });

  // ── results ────────────────────────────────────────────────────────────────
  scans
    .command('results')
    .description('Fetch full scan findings')
    .requiredOption('--repo <repo>', 'Repository (owner/repo)')
    .option('--scan <sha>', 'Specific commit SHA to use')
    .option('--branch <name>', 'Resolve latest scan on this branch')
    .option(
      '--types <list>',
      'Comma-separated types: sast,sca,secrets,iac,dead_code,sbom,anti_patterns,docstring,complex_functions,all',
      'all'
    )
    .option('--severity <list>', 'Filter by severity (e.g. critical,high)')
    .option('--path <glob>', 'Filter by file path glob')
    .option('--check <regex>', 'Filter by check ID or name (regex)')
    .option('--filter-dismissed', 'Exclude dismissed findings (default: false)')
    .option('--no-false-positives', 'Exclude false positives (default: included)')
    .option('--format <fmt>', 'Output format: json|sarif|csv|md|table (default: json)', 'json')
    .option('--output <path>', 'Write output to file instead of stdout')
    .option('--fields <list>', 'Project findings to subset of fields (comma-separated)')
    .option('--limit <n>', 'Max findings per page (default: 100)', parseInt, 100)
    .option('--offset <n>', 'Pagination offset (default: 0)', parseInt, 0)
    .option('--fail-fast', 'Exit 3 on first category fetch failure')
    .option('--no-color', 'Disable ANSI color (auto-disabled when not a TTY)')
    .option('--quiet', 'Suppress progress output on stderr')
    .action(async (opts) => {
      setQuiet(opts.quiet);
      if (opts.noColor) {
        setNoColor(true);
        tableSetNoColor(true);
      }

      try {
        await runResults({
          repo: opts.repo,
          scan: opts.scan,
          branch: opts.branch,
          types: opts.types,
          severity: opts.severity,
          path: opts.path,
          check: opts.check,
          filterDismissed: opts.filterDismissed || false,
          includeFalsePositives: opts.falsePositives ?? true,
          format: opts.format,
          output: opts.output,
          fields: opts.fields,
          limit: opts.limit,
          offset: opts.offset,
          failFast: opts.failFast || false,
        });
      } catch (err) {
        process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
        process.exit(err.exitCode ?? 1);
      }
    });

  // ── dismissed ──────────────────────────────────────────────────────────────
  scans
    .command('dismissed')
    .description('List dismissed alerts for a repository')
    .requiredOption('--repo <repo>', 'Repository (owner/repo)')
    .option('--analysis-type <type>', 'Analysis type: security|secrets (default: security)', 'security')
    .action((opts) =>
      runCmd(() => runDismissed({ repo: opts.repo, analysisType: opts.analysisType }))
    );

  // ── start-scan ─────────────────────────────────────────────────────────────
  scans
    .command('start-scan')
    .description('Trigger a new analysis run for a repository')
    .option('--repo <repo>', 'Repository (owner/repo, auto-detected from git remote)')
    .option('--branch <name>', 'Branch to scan (auto-detected from current checkout)')
    .option('--commit <sha>', 'Commit SHA to scan (resolved from remote if omitted)')
    .option('--include <paths>', 'Comma-separated file path glob patterns to include')
    .option('--exclude <paths>', 'Comma-separated file path glob patterns to exclude')
    .action(async (opts) => {
      try {
        await runStartScan({
          repo: opts.repo,
          branch: opts.branch,
          commit: opts.commit,
          include: opts.include,
          exclude: opts.exclude,
        });
      } catch (err) {
        process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
        process.exit(err.exitCode ?? 1);
      }
    });
}
