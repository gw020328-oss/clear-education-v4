// runCommand port for B's createOperatorPreviewHandler on the Moodle-native host.
//
// The browser sends every preview POST through its existing Moodle command grant
// (authorize-command → x-clear-command-ref / x-clear-command-binding), exactly like
// any other native write. This port reserves that grant for exactly this
// method/path/body/idempotency key through A's commandScope and hands work() a
// fence that, on every call, re-checks the reservation, the CLEAR operator
// session (with the scope's context binding) and a deadline that never exceeds
// the relay's own 45 s. Nothing is renewed, retried or extended.
import {hash} from './index.mjs';

export const NATIVE_PREVIEW_COMMAND_FENCE = 'MOODLE_NATIVE_COMMAND_FENCE.1';
const fail = code => { throw Object.assign(new Error(code), {code}); };
const check = (ok, code) => { if (!ok) fail(code); };
const header = (request, name) => { const v = request?.headers?.[name]; return typeof v === 'string' ? v : null; };

export function createNativePreviewCommand({commandScope, authentication, clock = Date.now, maxMs = 45000} = {}) {
  check(typeof commandScope?.run === 'function' && typeof commandScope.assert === 'function'
    && typeof commandScope.memoryCommitted === 'function' && typeof authentication?.authorizeWorkflow === 'function'
    && Number.isSafeInteger(maxMs) && maxMs > 0 && maxMs <= 45000, 'COMMAND_FENCE_CONFIG');
  return async function runCommand({request, context, command, signal}, work) {
    check(typeof work === 'function' && signal instanceof AbortSignal && command?.method === 'POST'
      && typeof command.path === 'string', 'COMMAND_FENCE_INPUT');
    const requestRef = header(request, 'x-clear-command-ref'), commandBinding = header(request, 'x-clear-command-binding');
    const idempotencyKey = header(request, 'idempotency-key');
    // Without the native grant headers there is nothing to reserve: refuse instead of running unfenced.
    check(requestRef && commandBinding && idempotencyKey, 'COMMAND_FENCE_NATIVE_REQUIRED');
    const actor = authentication.authorizeWorkflow(context, true);
    check(actor?.role === 'operator', 'COMMAND_FENCE_FORBIDDEN');
    const binding = hash({method: command.method, path: command.path, body: command.body});
    const deadline = clock() + maxMs;
    let open = true, ran = false;
    return commandScope.run({requestRef, commandBinding, context, signal,
      command: {method: 'POST', path: command.path, body: command.body, idempotencyKey}}, async () => {
      const fence = Object.freeze({
        kind: NATIVE_PREVIEW_COMMAND_FENCE,
        assertCurrent() {
          check(open && !signal.aborted && clock() < deadline, 'COMMAND_FENCE_EXPIRED');
          check(hash({method: command.method, path: command.path, body: command.body}) === binding, 'COMMAND_FENCE_CHANGED');
          commandScope.assert();
          const now = authentication.authorizeWorkflow(context, true);
          check(now?.role === 'operator' && now.wallet === actor.wallet, 'COMMAND_FENCE_FORBIDDEN');
        },
      });
      try {
        fence.assertCurrent();
        check(!ran, 'COMMAND_FENCE_REUSED'); ran = true;
        const result = await work(fence);
        fence.assertCurrent();
        // DISPLAY_ONLY: no store write; mark this one grant consumed so it cannot be replayed.
        commandScope.memoryCommitted();
        return result;
      } finally { open = false; }
    });
  };
}
