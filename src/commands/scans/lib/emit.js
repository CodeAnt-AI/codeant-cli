import fs from 'fs';
import path from 'path';

/**
 * Emit rendered content.
 * - If outputPath is set: write bytes to file, print JSON envelope to stdout.
 * - Otherwise: write to stdout.
 *
 * @param {string} content      - rendered string
 * @param {string|null} outputPath
 * @param {number} findingsCount - for the file envelope
 */
export function emit(content, outputPath, findingsCount = 0) {
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    fs.writeFileSync(resolved, content, 'utf8');
    const bytes = Buffer.byteLength(content, 'utf8');
    process.stdout.write(
      JSON.stringify({ output: resolved, bytes, findings: findingsCount }, null, 2) + '\n'
    );
  } else {
    process.stdout.write(content);
    if (!content.endsWith('\n')) process.stdout.write('\n');
  }
}
