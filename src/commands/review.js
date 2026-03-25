import React, { useEffect, useState } from 'react';
import { useApp } from 'ink';
import { getConfigValue } from '../utils/config.js';
import ReviewApiHelper from '../utils/reviewApiHelper.js';
import { fetchApi } from '../utils/fetchApi.js';
import fs from 'fs';
import path from 'path';
import { executeTool } from '../tools/executeTool.js';
import { track, shutdown as analyticsShutdown } from '../utils/analytics.js';
import {
  renderInitializing,
  renderFetchingDiff,
  renderReviewing,
  renderNoFiles,
  renderError,
  renderNotLoggedIn,
  renderDone,
  mapLabelToSeverity,
} from '../components/ReviewUI.js';

const MAX_TURNS = 5;

export default function Review({ scanType = 'all', lastNCommits = 1, failOn = 'CRITICAL', include = [], exclude = [], baseBranch = null, baseCommit = null }) {
  const { exit } = useApp();
  const [status, setStatus] = useState('initializing');
  const [error, setError] = useState(null);
  const [currentMessage, setCurrentMessage] = useState('');
  const [issues, setIssues] = useState([]);
  const [summary, setSummary] = useState(null);
  const [startTime] = useState(() => Date.now());
  const [fileCount, setFileCount] = useState(0);
  const [reviewMeta, setReviewMeta] = useState(null);

  const apiKey = getConfigValue('apiKey');

  useEffect(() => {
    if (!apiKey) {
      if (process.stdin.isTTY) {
        // Interactive session: don't exit immediately, let component render the error
        return;
      }
      const id = setTimeout(() => exit(new Error('Not logged in')), 0);
      return () => clearTimeout(id);
    }
  }, [apiKey, exit]);

  if (!apiKey) {
    return renderNotLoggedIn();
  }

  useEffect(() => {
    let cancelled = false;

    async function runReview() {
      const reviewStartTime = Date.now();
      track('review_triggered', { scan_type: scanType, source: 'cli_interactive' });

      try {
        // ── Fetch diff ─────────────────────────────────────────────────────
        setStatus('fetching_diff');

        const helper = new ReviewApiHelper(process.cwd());
        await helper.init();
        const gitRoot = helper.getGitRoot() || process.cwd();
        const requestBody = await helper.buildReviewApiRequest(scanType, include, exclude, { lastNCommits, baseBranch, baseCommit });

        const meta = requestBody?._meta || null;
        setFileCount(meta?.reviewed_files?.length || Object.keys(requestBody?.file_contents || {}).length);
        setReviewMeta(meta);

        // Strip _meta before sending to API
        delete requestBody._meta;

        if (!requestBody?.diff_content?.length) {
          if (!cancelled) setStatus('no_files');
          return;
        }

        if (cancelled) return;
        setStatus('reviewing');

        // ── Split into per-file requests ───────────────────────────────────
        const perFileRequests = ReviewApiHelper.splitIntoPerFileRequests(requestBody);

        // ── Per-file agent turn loops (parallel) ──────────────────────────
        setCurrentMessage(`Analyzing ${perFileRequests.length} file${perFileRequests.length !== 1 ? 's' : ''} in parallel...`);

        const perFileResults = await Promise.all(
          perFileRequests.map((fileReq) => {
            const filename = fileReq._filename;
            delete fileReq._filename;

            // Convert file_contents dict → file_content/file_path for API
            if (fileReq.file_contents?.[filename]) {
              fileReq.file_content = fileReq.file_contents[filename];
              fileReq.file_path = filename;
            }
            delete fileReq.file_contents;

            return runTurnLoop(
              fileReq,
              gitRoot,
              () => cancelled,
              () => {},
              false
            );
          })
        );

        // Pair each file's suggestions with its own diff — skip files with no real suggestions
        const perFileWithSuggestions = perFileRequests.map((fileReq, i) => ({
          diff_content: fileReq.diff_content,
          suggestions: perFileResults[i].finalMessage?.content,
          output: perFileResults[i].finalOutput,
        })).filter(r => r.output?.code_suggestions?.length > 0);

        if (cancelled) return;

        // ── Per-file reflector loops (parallel) ─────────────────────────────
        setCurrentMessage('Running reflector...');
        const reflectorResults = await Promise.all(
          perFileWithSuggestions.map(({ diff_content, suggestions }) =>
            runTurnLoop(
              {
                diff_content,
                prompt_template_name: 'reflector',
                extra_variables: { suggestion_str: suggestions },
              },
              gitRoot,
              () => cancelled,
              () => {},
              true
            )
          )
        );

        if (cancelled) return;

        const reviewIssues = reflectorResults.flatMap(r =>
          (r.finalOutput?.code_suggestions || []).map(issue => ({
            issue_content: issue.issue_content || '',
            relevant_file: issue.relevant_file || 'Unknown',
            start_line: issue.start_line || 0,
            label: issue.label || 'Code Quality',
          }))
        );
        setIssues(reviewIssues);
        setSummary(null);
        setStatus('done');

        const labelCounts = {};
        for (const i of reviewIssues) { labelCounts[i.label] = (labelCounts[i.label] || 0) + 1; }
        track('review_completed', {
          scan_type: scanType,
          source: 'cli_interactive',
          issue_count: reviewIssues.length,
          file_count: perFileRequests.length,
          duration_ms: Date.now() - reviewStartTime,
          label_counts: labelCounts,
        });
        await analyticsShutdown();

      } catch (err) {
        if (!cancelled) {
          const errMsg = err instanceof Error ? err.message : String(err);
          track('review_error', { scan_type: scanType, source: 'cli_interactive', error: errMsg });
          await analyticsShutdown();
          setError(errMsg);
          setStatus('error');
        }
      }
    }

    runReview();
    return () => { cancelled = true; };
  }, [scanType, lastNCommits, apiKey]);

  // Handle exit on terminal states
  useEffect(() => {
    if (status === 'done') {
      const severityOrder = ['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER'];
      const failOnIndex = severityOrder.indexOf(failOn);
      if (failOnIndex === -1) {
        setTimeout(() => { process.exitCode = 1; exit(new Error(`Invalid failOn value: ${failOn}`)); }, 100);
        return;
      }
      const hasBlocking = issues.some(issue =>
        severityOrder.indexOf(mapLabelToSeverity(issue.label)) >= failOnIndex
      );
      if (hasBlocking) {
        setTimeout(() => { process.exitCode = 1; exit(new Error('Issues detected')); }, 100);
      } else {
        setTimeout(() => exit(), 100);
      }
    } else if (status === 'no_files') {
      setTimeout(() => exit(), 100);
    } else if (status === 'error') {
      setTimeout(() => exit(new Error(error)), 100);
    }
  }, [status, issues, failOn, exit, error]);

  // ── Renders ──────────────────────────────────────────────────────────────

  if (status === 'initializing') return renderInitializing(startTime);
  if (status === 'fetching_diff') return renderFetchingDiff(startTime);
  if (status === 'reviewing') return renderReviewing(currentMessage, startTime, reviewMeta);
  if (status === 'no_files') return renderNoFiles(scanType, lastNCommits);
  if (status === 'error') return renderError(error);
  if (status === 'done') return renderDone(issues, summary, failOn, startTime, fileCount, reviewMeta);

  return null;
}

// ── Turn loop ──────────────────────────────────────────────────────────────

async function runTurnLoop(initialPayload, gitRoot, isCancelled, onMessage, isReflectorLoop) {
  let nextPayload = initialPayload;
  let finalMessage = null;
  let finalOutput = null;

  for (let turn = 0; turn < MAX_TURNS; turn+=1) {
    if (isCancelled()) break;

    onMessage('Analyzing code...');

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
      // Handle parsing errors in final message by dumping response content (only on reflector loop)
      if (isReflectorLoop && resp.parsing_error) {
        const dumpDir = path.join(gitRoot, '.codeant', 'codeSuggestions');
        const dumpFile = path.join(dumpDir, `code_suggestions_${Date.now()}.txt`);
        let dumpContent = resp.response?.content || JSON.stringify(resp, null, 2);

        // Ensure dumpContent is a string
        if (typeof dumpContent !== 'string') {
          dumpContent = JSON.stringify(dumpContent, null, 2);
        }

        // Unescape all serialization escape sequences
        dumpContent = dumpContent
          .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, '\\');

        try {
          // Create directories if they don't exist
          await fs.promises.mkdir(dumpDir, { recursive: true });
          await fs.promises.writeFile(dumpFile, dumpContent, 'utf8');
          console.error(`⚠ Parsing error encountered. Full response dumped to: ${dumpFile}`);
        } catch (writeErr) {
          console.error(`⚠ Parsing error encountered (could not dump to file: ${writeErr.message})`);
        }
      }
      break;
    }

    const toolCalls = assistantMsg?.tool_calls || [];
    if (toolCalls.length === 0) break;

    // Run tool calls in parallel to avoid serial latency when agent requests multiple reads
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

