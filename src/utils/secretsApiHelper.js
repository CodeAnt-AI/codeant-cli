import CommonApiHelper from './commonApiHelper.js';
import path from 'path';
import { minimatch } from 'minimatch';

/**
 * Transforms git diff data into the format expected by the secrets detection API
 *
 * API Input Format:
 * {
 *   "files": [
 *     {
 *       "file_path": str,
 *       "code": str,
 *       "diffs": [{ "start_line": int, "end_line": int }]
 *     }
 *   ]
 * }
 */

const EXCLUDED_FILENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',
  'Gemfile.lock',
  'Cargo.lock',
  'poetry.lock',
  'Pipfile.lock',
  'go.sum',
  '.DS_Store',
  'Thumbs.db',
]);

const EXCLUDED_EXTENSIONS = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp', '.avif',
  // Fonts
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  // Binary / compiled
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.class', '.pyc', '.pyo',
  '.wasm', '.jar', '.war', '.ear',
  // Archives
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  // Media
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.flv', '.wmv', '.ogg', '.webm',
  // Data / generated
  '.min.js', '.min.css', '.map',
  '.pb', '.proto.bin',
  // PDF / docs
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  // Data / config (often large, auto-generated)
  '.parquet', '.avro',
  // Database
  '.sqlite', '.db',
]);

const MAX_FILE_LINES = 5000;
const MAX_FILE_SIZE_BYTES = 200 * 1024; // 200 KB

function isScannableFile(filePath) {
  const basename = path.basename(filePath);

  if (EXCLUDED_FILENAMES.has(basename)) return false;

  const ext = path.extname(basename).toLowerCase();
  if (EXCLUDED_EXTENSIONS.has(ext)) return false;

  if (basename.endsWith('.min.js') || basename.endsWith('.min.css')) return false;

  // Skip markdown files
  if (ext === '.md') return false;

  return true;
}

class SecretsApiHelper extends CommonApiHelper {
  /**
   * Transform diff info array to API format
   * Groups by file and extracts diff ranges
   */
  _transformDiffsToApiFormat(diffs) {
    // Group diffs by filename
    const fileMap = new Map();

    for (const diff of diffs) {
      const filePath = diff.filename_str;

      // Skip diffs with missing or invalid filename
      if (!filePath) {
        continue;
      }

      if (!fileMap.has(filePath)) {
        fileMap.set(filePath, {
          file_path: filePath,
          code: diff.head_file_str || '',
          diffs: []
        });
      }

      // Add diff range if available
      if (diff.start_line_str && diff.end_line_str) {
        const startLine = parseInt(diff.start_line_str, 10);
        const endLine = parseInt(diff.end_line_str, 10);

        if (!isNaN(startLine) && !isNaN(endLine)) {
          fileMap.get(filePath).diffs.push({
            start_line: startLine,
            end_line: endLine
          });
        }
      }
    }

    return Array.from(fileMap.values());
  }

  /**
   * Filter files based on include and exclude glob patterns
   * @param {Array} files - Array of file objects with 'file_path' property
   * @param {Array} includePatterns - Array of glob pattern strings to include
   * @param {Array} excludePatterns - Array of glob pattern strings to exclude
   */
  _filterFiles(files, includePatterns = [], excludePatterns = []) {
    return files.filter(fileObj => {
      const filePath = fileObj.file_path;

      // If include patterns are specified, file must match at least one
      if (includePatterns.length > 0) {
        const matchesInclude = includePatterns.some(pattern => {
          try {
            if (pattern instanceof RegExp) {
              return pattern.test(filePath);
            }
            return minimatch(filePath, pattern, { matchBase: true });
          } catch (e) {
            console.warn(`Invalid include pattern: ${pattern}`, e.message);
            return false;
          }
        });

        if (!matchesInclude) {
          return false;
        }
      }

      // If exclude patterns are specified, file must not match any
      if (excludePatterns.length > 0) {
        const matchesExclude = excludePatterns.some(pattern => {
          try {
            if (pattern instanceof RegExp) {
              return pattern.test(filePath);
            }
            return minimatch(filePath, pattern, { matchBase: true });
          } catch (e) {
            console.warn(`Invalid exclude pattern: ${pattern}`, e.message);
            return false;
          }
        });

        if (matchesExclude) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Build the complete request body for the secrets API
   * @param {string} type - Type of scan (staged-only, branch-diff, etc.)
   * @param {Array} includePatterns - Optional array of glob patterns to include files
   * @param {Array} excludePatterns - Optional array of glob patterns to exclude files
   * @param {Object} options - Additional options like lastNCommits
   */
  async buildSecretsApiRequest(type = 'staged-only', includePatterns = [], excludePatterns = [], options = {}) {
    let files = await this.getFilesForType(type, options);

    // Handle null/undefined return
    if (!files || !Array.isArray(files)) {
      files = [];
    }

    const totalChanged = files.length;
    const skipped = [];

    // Filter out non-scannable files (binary, lock files, markdown, etc.)
    files = files.filter(fileObj => {
      const filePath = fileObj.file_path;

      if (!isScannableFile(filePath)) {
        skipped.push({ file: filePath, reason: 'binary/generated' });
        return false;
      }

      // Skip test files — backend filters these out anyway
      if (filePath.toLowerCase().includes('test')) {
        skipped.push({ file: filePath, reason: 'test file' });
        return false;
      }

      // Skip deleted files (empty code)
      if (fileObj.code === '' || fileObj.code === undefined) {
        skipped.push({ file: filePath, reason: 'deleted' });
        return false;
      }

      // Skip files exceeding size or line limits
      if (fileObj.code) {
        const contentSize = Buffer.byteLength(fileObj.code, 'utf-8');
        if (contentSize > MAX_FILE_SIZE_BYTES) {
          skipped.push({ file: filePath, reason: `too large (${(contentSize / 1024).toFixed(0)} KB, max ${MAX_FILE_SIZE_BYTES / 1024} KB)` });
          return false;
        }
        const lineCount = fileObj.code.split('\n').length;
        if (lineCount > MAX_FILE_LINES) {
          skipped.push({ file: filePath, reason: `too large (${lineCount} lines, max ${MAX_FILE_LINES})` });
          return false;
        }
      }

      return true;
    });

    // Apply include/exclude filters
    const beforePatternFilter = files.length;
    files = this._filterFiles(files, includePatterns, excludePatterns);

    // Track pattern-excluded files
    if (files.length < beforePatternFilter) {
      // We don't have exact file names for pattern-excluded, but the count is in skipped
      const patternExcluded = beforePatternFilter - files.length;
      if (patternExcluded > 0) {
        skipped.push({ file: `${patternExcluded} file(s)`, reason: 'excluded by pattern' });
      }
    }

    const scannedFiles = files.map(f => f.file_path);

    return {
      files,
      _meta: {
        scanned_files: scannedFiles,
        total_changed: totalChanged,
        skipped,
      },
    };
  }
}

export default SecretsApiHelper;
