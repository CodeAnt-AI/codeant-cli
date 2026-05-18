import { runBranchesAll, runBranchesDefault, runBranchesUpdateDefault } from './branches.js';
import { runFeatureFlagsGet, runFeatureFlagsUpdate } from './feature-flags.js';
import { runAnalysisFeatureFlagsGet, runAnalysisFeatureFlagsUpdate } from './analysis-feature-flags.js';
import { runPrInstructionsGet, runPrInstructionsSave, runPrInstructionsEdit, runPrInstructionsDelete } from './pr-instructions.js';

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
}
