import CommonApiHelper from './commonApiHelper.js';
import path from 'path';
import fs from 'fs';
import { minimatch } from 'minimatch';

const MAX_REVIEW_FILES = 10;
const MAX_FILE_LINES = 5000;
const MAX_FILE_SIZE_BYTES = 200 * 1024; // 200 KB

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
  '.csv', '.tsv', '.parquet', '.avro', '.ndjson',
  // Database
  '.sqlite', '.db',
]);

function matchesPatterns(filePath, includePatterns, excludePatterns) {
  if (includePatterns.length > 0) {
    const included = includePatterns.some(pattern => minimatch(filePath, pattern, { matchBase: true }));
    if (!included) return false;
  }
  if (excludePatterns.length > 0) {
    const excluded = excludePatterns.some(pattern => minimatch(filePath, pattern, { matchBase: true }));
    if (excluded) return false;
  }
  return true;
}

function isReviewableFile(filePath) {
  const basename = path.basename(filePath);

  if (EXCLUDED_FILENAMES.has(basename)) return false;

  const ext = path.extname(basename).toLowerCase();
  if (EXCLUDED_EXTENSIONS.has(ext)) return false;

  // Check for .min.js / .min.css (double extension)
  if (basename.endsWith('.min.js') || basename.endsWith('.min.css')) return false;

  return true;
}

/**
 * Transforms git diff data into the format expected by the agentic review API
 */
class ReviewApiHelper extends CommonApiHelper {
  /**
   * Pass structured diffs through so buildReviewApiRequest can filter them
   */
  _transformDiffsToApiFormat(diffs) {
    return diffs;
  }

  /**
   * Build the complete request body for the agentic review API
   */
  async buildReviewApiRequest(type = 'staged-only', includePatterns = [], excludePatterns = [], options = {}) {
    const diffs = await this.getFilesForType(type, options);

    // diffs is either a string (from getAllDiffs) or an array of structured diff objects
    if (typeof diffs === 'string') {
      // Split the raw diff into per-file sections and filter out deleted files
      const gitRoot = this.getGitRoot() || process.cwd();
      const fileContents = {};
      const fileSections = diffs.split(/(?=^diff --git )/m).filter(Boolean);
      const keptSections = [];
      const skipped = [];

      for (const section of fileSections) {
        const nameMatch = section.match(/^diff --git a\/.+ b\/(.+)$/m);
        if (!nameMatch) continue;
        const f = nameMatch[1];
        if (!isReviewableFile(f)) {
          skipped.push({ file: f, reason: 'binary/generated' });
          continue;
        }
        // Apply user-specified --include/--exclude glob patterns
        if (!matchesPatterns(f, includePatterns, excludePatterns)) {
          skipped.push({ file: f, reason: 'excluded by pattern' });
          continue;
        }

        // Skip deleted files — no file content to review, diff alone isn't actionable
        if (/deleted file mode/m.test(section) || /\+\+\+ \/dev\/null/m.test(section)) {
          skipped.push({ file: f, reason: 'deleted' });
          continue;
        }

        // Skip files exceeding size or line limits to avoid blowing up the AI context window
        try {
          const fullPath = path.resolve(gitRoot, f);
          if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            if (stats.size > MAX_FILE_SIZE_BYTES) {
              skipped.push({ file: f, reason: `too large (${(stats.size / 1024).toFixed(0)} KB, max ${MAX_FILE_SIZE_BYTES / 1024} KB)` });
              continue;
            }
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lineCount = content.split('\n').length;
            if (lineCount > MAX_FILE_LINES) {
              skipped.push({ file: f, reason: `too large (${lineCount} lines, max ${MAX_FILE_LINES})` });
              continue;
            }
            keptSections.push(section);
            fileContents[f] = content;
          } else {
            keptSections.push(section);
          }
        } catch {
          // Skip files that can't be read
        }
      }

      const reviewedFiles = Object.keys(fileContents);
      return {
        diff_content: keptSections.join(''),
        file_contents: fileContents,
        _meta: {
          reviewed_files: reviewedFiles,
          total_changed: fileSections.length,
          skipped,
          capped: false,
          max_files: MAX_REVIEW_FILES,
        },
      };
    }

    // Filter and track skipped files
    const skipped = [];
    const allUniqueFiles = new Set(diffs.map(d => d.filename_str));
    const reviewable = [];

    for (const d of diffs) {
      if (!isReviewableFile(d.filename_str)) {
        skipped.push({ file: d.filename_str, reason: 'binary/generated' });
        continue;
      }
      if (d.edit_type_str === 'DELETED') {
        skipped.push({ file: d.filename_str, reason: 'deleted' });
        continue;
      }
      if (!matchesPatterns(d.filename_str, includePatterns, excludePatterns)) {
        skipped.push({ file: d.filename_str, reason: 'excluded by pattern' });
        continue;
      }
      reviewable.push(d);
    }

    // Dedupe skipped entries
    const seenSkipped = new Set();
    const dedupedSkipped = skipped.filter(s => {
      if (seenSkipped.has(s.file)) return false;
      seenSkipped.add(s.file);
      return true;
    });

    // Dedupe by filename, keeping all hunks, but limit unique files to MAX_REVIEW_FILES
    const fileOrder = [];
    const fileHunks = new Map();
    let capped = false;
    for (const d of reviewable) {
      const f = d.filename_str;
      if (!fileHunks.has(f)) {
        if (fileOrder.length >= MAX_REVIEW_FILES) {
          capped = true;
          if (!seenSkipped.has(f)) {
            dedupedSkipped.push({ file: f, reason: `exceeded ${MAX_REVIEW_FILES}-file limit` });
            seenSkipped.add(f);
          }
          continue;
        }
        fileOrder.push(f);
        fileHunks.set(f, []);
      }
      fileHunks.get(f).push(d);
    }

    // Reconstruct a combined diff string from the filtered hunks
    const parts = [];
    for (const f of fileOrder) {
      const hunks = fileHunks.get(f);
      // Build a file-level diff header + all hunk patches
      const header = `diff --git a/${f} b/${f}\n--- a/${f}\n+++ b/${f}`;
      const hunkPatches = hunks.map(h => h.patch_str).filter(Boolean);
      if (hunkPatches.length > 0) {
        parts.push(header + '\n' + hunkPatches.join('\n'));
      }
    }

    // Use head_file_str from diffs so file content matches the diff version (avoids working tree mismatch for --last-commit etc.)
    const fileContents = {};
    const skippedLargeFiles = new Set();
    for (const f of fileOrder) {
      const hunks = fileHunks.get(f);
      const content = hunks[0]?.head_file_str || '';
      if (content) {
        const contentSize = Buffer.byteLength(content, 'utf-8');
        if (contentSize > MAX_FILE_SIZE_BYTES) {
          skippedLargeFiles.add(f);
          dedupedSkipped.push({ file: f, reason: `too large (${(contentSize / 1024).toFixed(0)} KB, max ${MAX_FILE_SIZE_BYTES / 1024} KB)` });
          continue;
        }
        const lineCount = content.split('\n').length;
        if (lineCount > MAX_FILE_LINES) {
          skippedLargeFiles.add(f);
          dedupedSkipped.push({ file: f, reason: `too large (${lineCount} lines, max ${MAX_FILE_LINES})` });
          continue;
        }
        fileContents[f] = content;
      }
    }

    // Remove diff sections for skipped files
    const filteredParts = parts.filter((_, i) => !skippedLargeFiles.has(fileOrder[i]));

    const reviewedFiles = fileOrder.filter(f => !skippedLargeFiles.has(f));
    return {
      diff_content: filteredParts.join('\n'),
      file_contents: fileContents,
      _meta: {
        reviewed_files: reviewedFiles,
        total_changed: allUniqueFiles.size,
        skipped: dedupedSkipped,
        capped,
        max_files: MAX_REVIEW_FILES,
      },
    };
  }

  /**
   * Split a combined review request into per-file payloads.
   * Each payload has a single file's diff and content.
   */
  static splitIntoPerFileRequests(requestBody) {
    if (!requestBody?.diff_content?.length) return [];

    const fileSections = requestBody.diff_content.split(/(?=^diff --git )/m).filter(Boolean);
    const perFileRequests = [];

    for (const section of fileSections) {
      const nameMatch = section.match(/^diff --git a\/.+ b\/(.+)$/m);
      if (!nameMatch) continue;
      const filename = nameMatch[1];

      const fileContents = {};
      if (requestBody.file_contents?.[filename]) {
        fileContents[filename] = requestBody.file_contents[filename];
      }

      perFileRequests.push({
        diff_content: section,
        file_contents: fileContents,
        _filename: filename,
      });
    }

    return perFileRequests;
  }
}

export default ReviewApiHelper;
