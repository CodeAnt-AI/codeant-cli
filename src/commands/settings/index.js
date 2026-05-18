import { runBranchesAll, runBranchesDefault, runBranchesUpdateDefault } from './branches.js';

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
}
