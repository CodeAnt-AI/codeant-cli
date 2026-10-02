# Changelog

## [0.5.9] - 02/10/2026
- Added `duplicate_code` to `scans results` / `findings repo`
- Dismissed and false-positive flags are kept on IaC and dead-code findings, and shown as `metadata.dismissed` / `metadata.false_positive`
- Added `scans overrides` (and the `codeant_scans_overrides` MCP tool) for user false-positive, confidence, and severity overrides
- `scans dismissed` accepts every analysis type and no longer drops SCA dismissals
- SCA severity is read from the advisory rating instead of defaulting to medium
- Extra dead-code file paths no longer end in the result file name
- Removed a debug dump of full scan responses to stderr
- Fixed numeric options with defaults (`scans results --limit`, `scans history --limit`, PR comment `--limit`) being parsed in the wrong radix; numeric options now reject non-integers, negative values, zero counts, and values above the documented maximum
- The dismissal comment (`metadata.comment_for_dismiss`) and secrets with a `FALSE_POSITIVE` confidence are reported in `metadata`

## [0.5.8] - 02/10/2026
- `findings antipatterns` and VM/container `findings cloud list` are paged (`--limit`, `--offset`, `--all`), so large organizations and scans no longer fail with a 502

## [0.5.7] - 28/09/2026
- Login tokens are prefixed with `cli___` so CLI logins show up as CLI on the IDE users page

## [0.5.6] - 09/09/2026
- Run secrets protection in a pre-commit hook with `--staged` instead of a pre-push hook.

## [0.5.4] - 27/08/2026
- Stop silently falling back to app.codeant.ai for login on a custom/self-hosted base URL
- Added `set-dashboard-url`, `get-dashboard-url`, and `remove-dashboard-url` commands to explicitly configure the login dashboard URL

## [0.5.3] - 24/08/2026
- Improved consistency between interactive and headless local reviews
- Added shared multi-file planning and verification before returning findings
- Increased local review coverage to 15 files, processed in batches of up to five

## [0.5.2] - 07/08/2026
- Use the configured CodeAnt dashboard URL during login

## [0.5.1] - 31/05/2026
- AI code review increasing coverage

## [0.4.12] - 19/05/2026
- Settings added

## [0.4.10] - 04/05/2026
- Scans filtering added

## [0.4.9] - 29/05/2026
- Login Url

## [0.4.8] - 29/05/2026
- Start scan

## [0.4.7] - 22/05/2026
- Scans center

## [0.4.6] - 17/04/2026
- Secrets false positive

## [0.4.5] - 13/04/2026
- Selected commits review

## [0.4.4] - 09/04/2026
- Secrets location in hooks

## [0.4.3] - 06/04/2026
- Interactive terminal for pre-push

## [0.4.2] - 06/04/2026
- Dynamic config

## [0.4.1] - 06/04/2026
- CLI path

## [0.4.0] - 04/04/2026
- Set api key

## [0.3.9] - 04/04/2026
- Secrets bypass

## [0.3.8] - 03/04/2026
- Graceful handling of review

## [0.3.7] - 03/04/2026
- Pre-push hook

## [0.3.6] - 02/04/2026
- new login approach

## [0.3.5] - 01/04/2026
- Local secret detection

## [0.3.4] - 25/03/2026
- Telemetry opt-out flag

## [0.3.3] - 25/03/2026
- Bug fixes

## [0.3.2] - 23/03/2026
- Add resolve conversation feature for all SCM providers (GitHub, GitLab, Bitbucket, Azure DevOps)
- Add `codeant pr resolve` CLI command

## [0.3.1] - 23/03/2026
- Bug fixes

## [0.3.0] - 23/03/2026
- Token optimization

## [0.2.9] - 23/03/2026
- Updated url

## [0.2.8] - 23/03/2026
- Updated url

## [0.2.7] - 22/03/2026
- Analytics tracking

## [0.2.6] - 21/03/2026
- API Key mapping

## [0.2.5] - 21/03/2026
- Secrets matching better

## [0.2.4] - 21/03/2026
- Deprecation of some features

## [0.2.3] - 21/03/2026
- Better CodeAnt review matching

## [0.2.2] - 20/03/2026
- Headless mode

## [0.2.1] - 20/03/2026
- Per-file parallel agentic review

## [0.2.0] - 19/03/2026
- Add SCM integration layer with support for GitHub, GitLab, Bitbucket, and Azure DevOps

## [0.1.9] - 19/03/2026
- Bug fixes

## [0.1.8] - 19/03/2026
- Bug fixes

## [0.1.7] - 19/03/2026
- Bug fixes

## [0.1.6] - 19/03/2026
- CLI UI Improvements
- More review trigger options
