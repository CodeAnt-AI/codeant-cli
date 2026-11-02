---
name: codeant-ralf-loop
description: Review local changes with CodeAnt, validate and fix actionable findings, then repeat until no new suggestions remain or suggestions repeat. Use when asked for a RALF loop or iterative CodeAnt review and fix cycle.
---

# CodeAnt RALF loop

Use the CodeAnt CLI to review, fix, and iterate on the user's selected changes. Default to at most five review passes unless the user specifies a different budget.

## Review scope

Run from the repository root. Preserve the requested scope and include/exclude patterns across passes. Default to `--uncommitted`. For a branch review, resolve the merge-base once and use `--base-commit <sha>` on every pass so that fixes in the working tree stay in scope. For `--last-commit`, `--last-n-commits`, or `--committed`, resolve the corresponding starting commit and likewise use `--base-commit <sha>`; rerunning only committed changes would miss fixes. For staged review, do not stage changes automatically; verify working-tree fixes with `--uncommitted` limited to the original staged file paths.

```bash
codeant review --uncommitted --max-files 150 --headless
```

Use the user's file limit. The default is 100; `--max-files <n>` changes only that invocation. A global default can be set with `codeant set-review-max-files 150` or `CODEANT_REVIEW_MAX_FILES=150`. Do not change global configuration merely to run the loop.

Read JSON from stdout and progress from stderr. The response contains `issues`, `meta`, `error`, and `noFiles`. Findings contain `relevant_file`, `start_line`, `label`, and `issue_content`.

## Each pass

1. Run the review and inspect `error`, `meta.reviewed_files`, `meta.skipped`, and `meta.capped` before interpreting findings. An error is not a clean review. If capped, increase the per-run limit within the user's scope or report incomplete coverage. Report other skipped files too.
2. Track findings by file, category, and underlying problem. Compare their meaning across all prior passes; line shifts or paraphrasing do not make a repeated suggestion new. Stop when no findings remain, no new suggestions remain, or the agent repeats the same suggestions. Keep unresolved repeated findings in the final report.
3. Read each new finding in context, validate it against callers and intended behavior, and apply a minimal fix when justified. Record false positives, stale findings, and findings that need a user decision. If no actionable fixes remain, stop.
4. Run the repository's checks appropriate to the fixes. If checks fail because of a fix, correct or revert that fix; stop and report when the failure cannot be resolved within scope.
5. Review the updated code with the same base, filters, and file limit. Stop after the pass budget even if findings remain; do not apply unverified fixes on the final pass.

Do not commit, push, publish, or modify unrelated work unless the user requested it. An empty diff (`noFiles`) means there was nothing to review. Report the number of passes, reviewed scope and coverage, fixes, verification results, unresolved findings, and the exact reason the loop stopped. Claim a clean result only after a successful review with no findings, and qualify any skipped files.
