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

## Follow-up — final review P2: refresh after close / replaced visit (2026-11-05)

Base: remote PR head `6f38da67c7b2a56a66d509df10d0fbe085a675b7`. The worktree was clean and detached at that head, and the remote was unchanged before the fix. Recommended model: GPT-6.1 Sol / Medium. Actual model: Claude Opus 5.5.

**Problem.** `requestRefresh` awaits `read()` before it sends refresh. During that await, the tracker could be closed (logout, application switch) or the condition's visit could be replaced by a new `depart`/`recheck`. Either way, the earlier request was still sent after the read returned. A refresh reply that arrived after the visit was replaced also overwrote the new visit's state and `refresh` result.

**Fix.** Only `web/src/bootcamp/condition-return/tracker.js` changed. There is no structural change.
- Each visit gets an in-memory `visitRef`. It is assigned on `depart`, `recheck` and on restore from storage, and is not persisted.
- The loop stops once the tracker is closed.
- After `await read()`, the request is sent only if all of these hold:
  - the tracker is still open,
  - the live visit has the same `visitRef`,
  - it still needs refresh,
  - its `nextAllowedAt` has passed.
- If the visit changed while the refresh reply was in flight, the reply does not touch the new visit's state, `refresh` or `needsRefresh`. A RATE_LIMITED reply only carries the per-condition `nextAllowedAt` forward, taking the later time.
- Unchanged:
  - the latest snapshot's `decision.revision` is still what gets sent;
  - per-condition `nextAllowedAt` gating and the RATE_LIMITED/stale-revision behavior are as before.
- Known limit: a `recheck` made while a check is in flight is not sent by that in-flight pass. It stays `needsRefresh`, and the next scheduled or manual check sends it.

**Reproduction.** Five tests were added to `web/tests/condition-flow.test.mjs`. On `6f38da6`, four of them fail:
- close during read: 1 refresh was sent;
- re-depart during read: the earlier request was sent;
- re-depart during the refresh reply: the new visit was overwritten;
- recheck during read: the earlier request was sent.

The normal active-visit test (latest revision 12, exactly 1 refresh) passes before and after the fix.

**Validation** (pinned Node 24.21.0 via `PATH=/private/tmp/clear-node24.NPoAsu/node-v24.21.0-darwin-arm64/bin:$PATH ./tools/node`):
- focused `condition-flow` + `condition-return`: 44/44, including the existing stale-revision and RATE_LIMITED regressions;
- final `web/tests/*.test.mjs` once: 405/405;
- `git diff --check` clean.

Server auth, Moodle, payment and sealed files were not modified. No real login, Gemini call, deploy, push or merge. This fix is a local candidate commit.

## Follow-up — late final read and current develop integration (2026-11-05)

User authorized remaining P2 fix, latest develop integration, CI confirmation and report to idea chat; no PR merge. Independent worktree `/tmp/clear165-final-fix` preserves the Claude-owned `/tmp/clear165-fix` worktree.

Starting remote PR HEAD: `140fed73e4181efe85fb61c1f12c5362a1e52311`. Integrated `origin/develop` `e4d3c205c43804a02b2360b816e5e7a6dd975a3b` by history merge `1cbb087`, without conflicts or manual edits to incoming changes.

Remaining P2: final stored-verdict read could apply an old result to a newly departed/rechecked visit, marking it UPDATED and suppressing subsequent arrival refresh. A late read error could likewise overwrite the replacement visit. Each check now captures its target visitRefs; both final observe and error handling ignore replaced visits. Independent host observe remains unchanged. A replacement recheck with zero attempts gets the first follow-up interval so it recovers without relying on the stale check incrementing its attempts.

Three new regression cases (late success after depart, late success after five rechecks, late error after five rechecks) all failed before the fix and pass afterward. They assert exact replacement-state preservation and exactly one new send on arrival/next timer. Existing close, refresh-reply replacement, latest revision and cooldown tests remain passing.

Validation: fixed Node24.21.0; focused 47/47; integrated full web tests once 453/453; diff check clean. Full test count includes the latest develop frontend additions. Public history pre-push and final HEAD CI are reported in the task final response. No actual login/Gemini/Moodle runtime/payment/contract or sealed-file changes. PR remains Draft, no merge or ready transition performed.

Recommended GPT-6.1 Sol / High for asynchronous state changes; actual model GPT-6.1 Sol per runtime, reasoning level not independently observable.
