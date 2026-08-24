import ReviewApiHelper from './utils/reviewApiHelper.js';
import { fetchApi } from './utils/fetchApi.js';
import { executeTool } from './tools/executeTool.js';
import { getConfigValue, setConfigValue } from './utils/config.js';
import { track } from './utils/analytics.js';

const MAX_TURNS = 5;

/**
 * Run a single agent turn loop (planner, generator, or rejector).
 */
async function runTurnLoop(initialPayload, gitRoot, isRejectorLoop) {
  let nextPayload = initialPayload;
  let finalMessage = null;
  let finalOutput = null;
  let rejectorInput = null;

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
    if (resp.rejector_input) rejectorInput = resp.rejector_input;

    if (done) {
      if (isRejectorLoop && resp.parsing_error) {
        console.error('Warning: parsing error in rejector response');
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

  return { finalMessage, finalOutput, rejectorInput };
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
    let riskHypotheses = '';
    try {
      onProgress(`Planning risks across ${totalFiles} file${totalFiles !== 1 ? 's' : ''}...`);
      const plannerResult = await runTurnLoop(
        {
          diff_content: requestBody.diff_content,
          prompt_template_name: 'risk_planner',
        },
        gitRoot,
        false
      );
      riskHypotheses = plannerResult.finalOutput?.risk_hypotheses || '';
    } catch (err) {
      console.error(`[warning] Risk planner failed; continuing without hypotheses: ${err.message}`);
    }
    onProgress(`Analyzing ${totalFiles} file${totalFiles !== 1 ? 's' : ''}...`);

    // ── Per-batch agent turn loops (parallel, fault-tolerant) ────────────
    // Each review session covers a batch of up to five files.
    const perFileResults = await Promise.all(
      perFileRequests.map(async (fileReq) => {
        const filenames = fileReq._filenames || [];
        const payload = {
          ...fileReq,
          extra_variables: { risk_hypotheses: riskHypotheses },
        };
        delete payload._filenames;
        const label = filenames.join(', ');

        try {
          onProgress(`Reviewing ${label}...`);
          const result = await runTurnLoop(payload, gitRoot, false);
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
      file_contents: fileReq.file_contents,
      generator_output: perFileResults[i].finalOutput,
      rejector_input: perFileResults[i].rejectorInput,
    })).filter(r => r.generator_output?.code_suggestions?.length > 0);

    const filesWithSuggestions = new Set(
      perFileWithSuggestions.flatMap(r =>
        (r.generator_output?.code_suggestions || []).map(s => (s.relevant_file || '').trim()).filter(Boolean)
      )
    ).size;
    onProgress(`${filesWithSuggestions} file${filesWithSuggestions !== 1 ? 's' : ''} have suggestions, running rejector...`);

    // ── Per-batch rejector loops (parallel, fault-tolerant) ──────────────
    const rejectorResults = await Promise.all(
      perFileWithSuggestions.map(async ({ diff_content, file_contents, rejector_input }, i) => {
        try {
          return await runTurnLoop(
            {
              diff_content,
              file_contents,
              prompt_template_name: 'rejector',
              extra_variables: rejector_input,
            },
            gitRoot,
            true
          );
        } catch (err) {
          console.error(`[error] Rejector failed for batch ${i}: ${err.message}`);
          return { finalMessage: null, finalOutput: null };
        }
      })
    );

    const finalizedResults = await Promise.all(
      rejectorResults.map((result, i) => fetchApi(
        '/extension/pr-review/agent/finalize',
        'POST',
        {
          diff_content: perFileWithSuggestions[i].diff_content,
          generator_output: perFileWithSuggestions[i].generator_output,
          rejector_output: result.finalOutput || { code_suggestions: [] },
        }
      ))
    );

    const issues = finalizedResults.flatMap(r =>
      (r.output?.code_suggestions || []).map(issue => ({
        issue_content: issue.suggestion_content || issue.one_sentence_summary || '',
        relevant_file: issue.relevant_file || 'Unknown',
        start_line: issue.relevant_lines_start || 0,
        label: issue.label || 'Code Quality',
      }))
    );

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
