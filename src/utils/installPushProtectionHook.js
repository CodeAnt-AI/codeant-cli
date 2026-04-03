import { execSync } from 'child_process';
import { readFileSync, writeFileSync, chmodSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import path from 'path';

const HOOK_MARKER = '# codeant-push-protection';

/**
 * Build the full pre-push hook script (with shebang).
 * @param {string} failOn - Severity threshold (e.g. "HIGH", "CRITICAL")
 */
function buildHookScript(failOn = 'HIGH') {
  return `#!/bin/sh
${buildHookBlock(failOn)}
`;
}

/**
 * Build just the CodeAnt block (no shebang), used when appending to an existing hook.
 * @param {string} failOn - Severity threshold
 */
function buildHookBlock(failOn = 'HIGH') {
  return `${HOOK_MARKER}
# Auto-installed by CodeAnt AI — blocks pushes containing secrets.
# To disable: delete this hook or run "codeant push-protection disable"
command -v codeant >/dev/null 2>&1 || exit 0
codeant secrets --committed --fail-on ${failOn}
${HOOK_MARKER_END}`;
}

const HOOK_MARKER_END = '# end-codeant-push-protection';

/**
 * Replace the CodeAnt block in a hook file with new content (or remove it).
 */
function replaceCodeAntBlock(fileContent, newBlock) {
  const startIdx = fileContent.indexOf(HOOK_MARKER);
  let endIdx = fileContent.indexOf(HOOK_MARKER_END);
  if (startIdx === -1) return fileContent;
  if (endIdx === -1) {
    // Legacy hook without end marker — remove from start marker to EOF
    endIdx = fileContent.length;
  } else {
    endIdx += HOOK_MARKER_END.length;
  }
  const before = fileContent.slice(0, startIdx);
  const after = fileContent.slice(endIdx);
  return (before + newBlock + after).replace(/\n{3,}/g, '\n\n');
}

/**
 * Find the git root directory for a given workspace path.
 */
function findGitRoot(workspacePath) {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd: workspacePath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Get the effective hooks directory (respects core.hooksPath).
 */
function getHooksDir(gitRoot) {
  try {
    const custom = execSync('git config --get core.hooksPath', {
      cwd: gitRoot,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (custom) return path.resolve(gitRoot, custom);
  } catch {
    // No custom hooksPath — use default
  }
  return path.join(gitRoot, '.git', 'hooks');
}

/**
 * Install a pre-push hook that runs secret scanning before push.
 *
 * @param {string} workspacePath - Path to the git repository
 * @param {object} [options]
 * @param {string} [options.failOn="HIGH"] - Severity threshold
 * @returns {{ installed: boolean, hookPath: string|null, message: string }}
 */
export function installPushProtectionHook(workspacePath, options = {}) {
  const { failOn = 'HIGH' } = options;

  const gitRoot = findGitRoot(workspacePath);
  if (!gitRoot) {
    return { installed: false, hookPath: null, message: 'Not a git repository' };
  }

  const hooksDir = getHooksDir(gitRoot);
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }
  const hookPath = path.join(hooksDir, 'pre-push');

  // If hook already exists, check if it's ours
  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, 'utf-8');
    if (existing.includes(HOOK_MARKER)) {
      // Replace only our block, preserve everything else
      const updated = replaceCodeAntBlock(existing, buildHookBlock(failOn));
      writeFileSync(hookPath, updated, 'utf-8');
      chmodSync(hookPath, 0o755);
      return { installed: true, hookPath, message: 'Hook updated' };
    }
    // There's a user-managed hook — append our block (no duplicate shebang)
    const appended = existing.trimEnd() + '\n\n' + buildHookBlock(failOn) + '\n';
    writeFileSync(hookPath, appended, 'utf-8');
    chmodSync(hookPath, 0o755);
    return { installed: true, hookPath, message: 'Hook appended to existing pre-push' };
  }

  writeFileSync(hookPath, buildHookScript(failOn), 'utf-8');
  chmodSync(hookPath, 0o755);
  return { installed: true, hookPath, message: 'Hook installed' };
}

/**
 * Remove the CodeAnt pre-push hook (or just our section if appended).
 *
 * @param {string} workspacePath
 * @returns {{ removed: boolean, message: string }}
 */
export function removePushProtectionHook(workspacePath) {
  const gitRoot = findGitRoot(workspacePath);
  if (!gitRoot) {
    return { removed: false, message: 'Not a git repository' };
  }

  const hooksDir = getHooksDir(gitRoot);
  const hookPath = path.join(hooksDir, 'pre-push');

  if (!existsSync(hookPath)) {
    return { removed: false, message: 'No pre-push hook found' };
  }

  const content = readFileSync(hookPath, 'utf-8');
  if (!content.includes(HOOK_MARKER)) {
    return { removed: false, message: 'Hook is not managed by CodeAnt' };
  }

  // Remove our block (between start and end markers)
  const remaining = replaceCodeAntBlock(content, '').trim();
  if (!remaining || remaining === '#!/bin/sh') {
    // Nothing left — delete the file
    unlinkSync(hookPath);
    return { removed: true, message: 'Hook removed' };
  }

  writeFileSync(hookPath, remaining + '\n', 'utf-8');
  chmodSync(hookPath, 0o755);
  return { removed: true, message: 'CodeAnt section removed from hook' };
}
