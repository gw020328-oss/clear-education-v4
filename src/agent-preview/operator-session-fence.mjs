// runCommand port for B's createOperatorPreviewHandler in a SEPARATE local
// environment that has no Moodle-native command grant.
//
// This is NOT A's native Moodle commandScope (codex/native-activity-return).
// That scope reserves an existing Moodle intent grant (x-clear-command-ref,
// 5 s lease) and calls work() without a fence argument, so it cannot be
// plugged in as-is. Here the fence is the existing CLEAR wallet session:
//   - one command per session at a time, bound to the exact method/path/body
//   - work(fence) is awaited exactly once
//   - fence.assertCurrent() re-checks the session + CSRF, the binding, the
//     caller signal and a deadline that never exceeds the relay's own 45 s
//   - after finish the fence fails; nothing is renewed or extended
import {createHash} from 'node:crypto';
import {hash} from './index.mjs';

export const SESSION_COMMAND_FENCE = 'SEPARATE_ENV_SESSION_FENCE.1';
const fail = code => { throw Object.assign(new Error(code), {code}); };
const check = (ok, code) => { if (!ok) fail(code); };

export function createSessionCommandFence({authentication, clock = Date.now, maxMs = 45000} = {}) {
  check(typeof authentication?.authorizeWorkflow === 'function' && Number.isSafeInteger(maxMs)
    && maxMs > 0 && maxMs <= 45000, 'COMMAND_FENCE_CONFIG');
  const active = new Set();
  return async function runCommand({context, command, signal}, work) {
    check(typeof work === 'function' && signal instanceof AbortSignal, 'COMMAND_FENCE_INPUT');
    check(command?.method === 'POST' && typeof command.path === 'string', 'COMMAND_FENCE_INPUT');
    const session = createHash('sha256').update(String(context?.token)).digest('hex');
    check(!active.has(session), 'COMMAND_FENCE_BUSY');
    const actor = authentication.authorizeWorkflow(context, true);
    check(actor?.role === 'operator', 'COMMAND_FENCE_FORBIDDEN');
    const binding = hash({method: command.method, path: command.path, body: command.body});
    const deadline = clock() + maxMs;
    let open = true, ran = false;
    const fence = Object.freeze({
      kind: SESSION_COMMAND_FENCE,
      assertCurrent() {
        check(open && !signal.aborted && clock() < deadline, 'COMMAND_FENCE_EXPIRED');
        check(hash({method: command.method, path: command.path, body: command.body}) === binding, 'COMMAND_FENCE_CHANGED');
        const now = authentication.authorizeWorkflow(context, true);
        check(now?.role === 'operator' && now.wallet === actor.wallet, 'COMMAND_FENCE_FORBIDDEN');
      },
    });
    active.add(session);
    try {
      fence.assertCurrent();
      check(!ran, 'COMMAND_FENCE_REUSED'); ran = true;
      const result = await work(fence);
      fence.assertCurrent(); // before finish
      return result;
    } finally { open = false; active.delete(session); }
  };
}
