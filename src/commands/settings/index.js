import { runBranchesAll, runBranchesDefault, runBranchesUpdateDefault } from './branches.js';
import { runFeatureFlagsGet, runFeatureFlagsUpdate } from './feature-flags.js';

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
}
