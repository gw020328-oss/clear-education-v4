# PR 165 review fixes — 2026-11-05

Base/head reviewed: 3790655a0a193b66e1e267325312e4668f00448d. Independent detached worktree /tmp/clear165-fix; existing owner worktree untouched. Remote head unchanged before implementation/push; no local worktree owns the PR branch. Fast-forward push only; no merge authorization.

Recommended model: GPT-6.1 Sol / Medium (bounded frontend implementation). Actual model: GPT-6.1 Sol per runtime instruction; reasoning setting not independently observable.

Changes: web/src/bootcamp/condition-return/tracker.js and web/tests/condition-flow.test.mjs.
- Each eligible source-refresh first reads the latest application snapshot and uses its decision.revision directly (controller read can return fresh data without updating getState). Condition comparison baseline is preserved. Conflict is recorded as REQUEST_FAILED; no automatic conflict resend. A manual retry reads again and can recover.
- Per-condition response-time nextAllowedAt gates every source-refresh entry. Saved verdict reads continue. Deadline survives repeat departure and session persistence; timer delay uses remaining time.
- Prior application-revision semantics, same-state new-evidence distinction, previous reflection labeling and disabled missing HR resume remain covered by existing tests.

Reproduction: new tests on original tracker fail 2/2: expected latest revision 8 but sent 7; 1ms manual retry sent twice under 60-second limit. Fixed tests pass: read-only host stays at 7 while command uses 8; after conflict manual retry uses 9; manual/return/other-condition timer do not bypass cooldown; expiry allows retry.

Validation: fixed Node 24.21.0; focused existing tests 37/37, expanded condition-flow tests 15/15; final web/tests/*.mjs once 400/400; git diff --check clean. These are synthetic/offline checks. Actual login, Gemini, Moodle runtime, contracts/payment and sealed files were not exercised or modified.

Commit is the commit containing this handoff. PR remains open and unmerged. Post-push CI status is recorded in the task final response (not a claim about pre-push checks).
