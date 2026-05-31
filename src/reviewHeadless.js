import ReviewApiHelper from './utils/reviewApiHelper.js';
import { fetchApi } from './utils/fetchApi.js';
import { executeTool } from './tools/executeTool.js';
import { getConfigValue, setConfigValue } from './utils/config.js';
import { track } from './utils/analytics.js';

const MAX_TURNS = 5;

/**
 * Run a single agent turn loop (per-file or reflector).
 */
async function runTurnLoop(initialPayload, gitRoot, isReflectorLoop) {
  let nextPayload = initialPayload;
  let finalMessage = null;
  let finalOutput = null;

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const resp = await fetchApi('/extension/pr-review/agent/turn', 'POST', nextPayload);

    if (!resp || typeof resp !== 'object') {
      throw new Error('Invalid response from agent API');
    }

    const sessionId = resp.session_id;
    const assistantMsg = resp.response;
    const done = resp.done;

    if (!sessionId) {
      throw new Error('Missing session_id in agent response');
    }

    finalMessage = assistantMsg;
    if (resp.output) finalOutput = resp.output;

    if (done) {
      if (isReflectorLoop && resp.parsing_error) {
        console.error('Warning: parsing error in reflector response');
      }
      break;
    }

    const toolCalls = assistantMsg?.tool_calls || [];
    if (toolCalls.length === 0) break;

    const toolResults = await Promise.all(
      toolCalls.map(async (tc) => ({
        tool_call_id: tc.id,
        content: await executeTool(tc, gitRoot),
      }))
    );

    nextPayload = { session_id: sessionId, tool_results: toolResults };
  }

  return { finalMessage, finalOutput };
}

/**
 * Headless review runner — no React/Ink, returns plain JSON.
 *
 * @param {Object} options
 * @param {string}  options.workspacePath  - Absolute path to the repo/workspace
 * @param {string}  [options.apiKey]       - API key (overrides env/config)
 * @param {string}  [options.baseUrl]      - API base URL (overrides env/config)
 * @param {string}  [options.scanType='all'] - all|committed|uncommitted|staged-only|last-commit|last-n-commits|base-branch|base-commit
 * @param {string[]} [options.include=[]]  - Glob patterns to include
 * @param {string[]} [options.exclude=[]]  - Glob patterns to exclude
 * @param {number}  [options.lastNCommits=1]
 * @param {string}  [options.baseBranch]
 * @param {string}  [options.baseCommit]
 * @param {function} [options.onProgress]  - Optional callback(message) for progress updates
 * @returns {Promise<{issues: Array, meta: Object|null, error: string|null}>}
 */
export async function runReviewHeadless(options = {}) {
  const {
    workspacePath,
    apiKey,
    baseUrl,
    scanType = 'all',
    include = [],
    exclude = [],
    lastNCommits = 1,
    baseBranch = null,
    baseCommit = null,
    selectedCommits = [],
    onProgress = () => {},
    onFilesReady = () => {},
  } = options;

  // If the CLI config doesn't have an apiKey but the extension passed one, persist it
  if (apiKey && !getConfigValue('apiKeyV2')) {
    setConfigValue('apiKeyV2', apiKey);
  }

  // Temporarily set env vars so fetchApi picks them up
  const prevToken = process.env.CODEANT_API_TOKEN;
  const prevUrl = process.env.CODEANT_API_URL;

  if (apiKey) process.env.CODEANT_API_TOKEN = apiKey;
  if (baseUrl) process.env.CODEANT_API_URL = baseUrl;

  const reviewStartTime = Date.now();
  track('review_triggered', { scan_type: scanType, source: 'headless' });

  try {
    // ── Fetch diff ──────────────────────────────────────────────────────
    onProgress('Fetching diff...');

    const helper = new ReviewApiHelper(workspacePath);
    await helper.init();
    const gitRoot = helper.getGitRoot() || workspacePath;
    const requestBody = await helper.buildReviewApiRequest(scanType, include, exclude, { lastNCommits, baseBranch, baseCommit, selectedCommits });

    const meta = requestBody?._meta || null;
    delete requestBody._meta;

    // Notify caller about files being reviewed as soon as we know
    onFilesReady(meta?.reviewed_files || [], meta);

    if (!requestBody?.diff_content?.length) {
      track('review_completed', { scan_type: scanType, source: 'headless', issue_count: 0, file_count: 0, duration_ms: Date.now() - reviewStartTime, no_files: true });
      return { issues: [], meta, error: null, noFiles: true };
    }

    // ── Split into per-file requests ────────────────────────────────────
    const perFileRequests = ReviewApiHelper.splitIntoPerFileRequests(requestBody);

    const totalFiles = perFileRequests.reduce((n, r) => n + (r._filenames?.length || 0), 0);
    onProgress(`Analyzing ${totalFiles} file${totalFiles !== 1 ? 's' : ''}...`);

    // ── Per-batch agent turn loops (parallel, fault-tolerant) ────────────
    // Each batch covers up to 5 files; backend reviews the multi-file diff
    // in a single session (matches pragent's FileBatcher).
    const perFileResults = await Promise.all(
      perFileRequests.map(async (fileReq) => {
        const filenames = fileReq._filenames || [];
        delete fileReq._filenames;
        const label = filenames.join(', ');

        // Single-file batch: still pass file_content/file_path so backend can
        // build head_file_str. Multi-file batches drop these (head_file_str
        // becomes empty; agent gathers context via tools instead).
        if (filenames.length === 1 && fileReq.file_contents?.[filenames[0]]) {
          fileReq.file_content = fileReq.file_contents[filenames[0]];
          fileReq.file_path = filenames[0];
        }
        delete fileReq.file_contents;

        try {
          onProgress(`Reviewing ${label}...`);
          const result = await runTurnLoop(fileReq, gitRoot, false);
          onProgress(`Done reviewing ${label}`);
          return result;
        } catch (err) {
          console.error(`[error] Failed to review ${label}: ${err.message}`);
          return { finalMessage: null, finalOutput: null };
        }
      })
    );

    // Pair each file's suggestions with its own diff — skip files with no real suggestions
    const perFileWithSuggestions = perFileRequests.map((fileReq, i) => ({
      diff_content: fileReq.diff_content,
      suggestions: perFileResults[i].finalMessage?.content,
      output: perFileResults[i].finalOutput,
    })).filter(r => r.output?.code_suggestions?.length > 0);

    const filesWithSuggestions = new Set(
      perFileWithSuggestions.flatMap(r =>
        (r.output?.code_suggestions || []).map(s => (s.relevant_file || '').trim()).filter(Boolean)
      )
    ).size;
    onProgress(`${filesWithSuggestions} file${filesWithSuggestions !== 1 ? 's' : ''} have suggestions, running reflector...`);

    // ── Per-file reflector loops (parallel, fault-tolerant) ──────────────
    const reflectorResults = await Promise.all(
      perFileWithSuggestions.map(async ({ diff_content, suggestions }, i) => {
        try {
          return await runTurnLoop(
            {
              diff_content,
              prompt_template_name: 'reflector',
              extra_variables: { suggestion_str: suggestions },
            },
            gitRoot,
            true
          );
        } catch (err) {
          console.error(`[error] Reflector failed for file ${i}: ${err.message}`);
          return { finalMessage: null, finalOutput: null };
        }
      })
    );

    // ── Parse results, carrying generator labels through reflector ──────
    // Pragent's rejector schema drops `label`; preserve it by matching the
    // reflector's per-issue (file, start_line) back to the generator's output.
    const issues = reflectorResults.flatMap((r, i) => {
      const genSuggestions = perFileWithSuggestions[i]?.output?.code_suggestions || [];
      const norm = (v) => (typeof v === 'string' ? v.trim() : v);
      const labelFor = (issue) => {
        if (norm(issue.label)) return norm(issue.label);
        // Match by summary (pragent's primary strategy): rejector's
        // suggestion_summary (renamed to issue_content server-side) is
        // "Repeated from the input" — i.e. the generator's one_sentence_summary.
        const summary = norm(issue.issue_content);
        if (summary) {
          const exact = genSuggestions.find(g => norm(g.one_sentence_summary) === summary);
          if (norm(exact?.label)) return norm(exact.label);
        }
        // Fallback: first generator suggestion in the same file with a label.
        const file = norm(issue.relevant_file);
        const sameFile = genSuggestions.find(g => norm(g.relevant_file) === file && norm(g.label));
        return norm(sameFile?.label) || 'Code Quality';
      };
      return (r.finalOutput?.code_suggestions || []).map((issue) => ({
        issue_content: issue.issue_content || '',
        relevant_file: issue.relevant_file || 'Unknown',
        start_line: issue.start_line || 0,
        label: labelFor(issue),
      }));
    });

    const labelCounts = {};
    for (const i of issues) { labelCounts[i.label] = (labelCounts[i.label] || 0) + 1; }
    track('review_completed', {
      scan_type: scanType, source: 'headless', issue_count: issues.length,
      file_count: perFileRequests.length, duration_ms: Date.now() - reviewStartTime,
      label_counts: labelCounts,
    });

    return { issues, meta, error: null, noFiles: false };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    track('review_error', { scan_type: scanType, source: 'headless', error: errMsg });
    return { issues: [], meta: null, error: errMsg, noFiles: false };
  } finally {
    // Restore env vars
    if (prevToken !== undefined) process.env.CODEANT_API_TOKEN = prevToken;
    else delete process.env.CODEANT_API_TOKEN;
    if (prevUrl !== undefined) process.env.CODEANT_API_URL = prevUrl;
    else delete process.env.CODEANT_API_URL;
  }
}
