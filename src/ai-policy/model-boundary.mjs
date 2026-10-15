import { freeze, requireRule as check } from '../policy/values.mjs';

// Trusted scripted adapters only. No provider, credential lookup, storage or transport.
export async function invokeMockObservation(adapter, input, { signal, timeoutMs = 1000 } = {}) {
  check(adapter?.execution === 'MOCK' && typeof adapter.observe === 'function', 'AI_MOCK_ADAPTER_REQUIRED');
  check(Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 30000, 'AI_TIMEOUT');
  if (signal?.aborted) return freeze({ status: 'CANCELLED', execution: 'MOCK', output: null });
  const detached = structuredClone(input), controller = new AbortController();
  const timeoutReason = Symbol(), cancelReason = Symbol();
  let timer, abort;
  const stop = new Promise((resolve, reject) => {
    abort = () => { reject(cancelReason); controller.abort(); };
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { reject(timeoutReason); controller.abort(); }, timeoutMs);
  });
  try {
    const output = await Promise.race([Promise.resolve().then(() => {
      if (controller.signal.aborted) throw cancelReason;
      return adapter.observe(detached, { signal: controller.signal });
    }), stop]);
    if (output?.status === 'REFUSED') return freeze({ status: 'REFUSED', execution: 'MOCK', output: null });
    return { status: 'SUCCEEDED', execution: 'MOCK', output };
  } catch (error) {
    return freeze({ status: error === timeoutReason ? 'TIMED_OUT' : error === cancelReason ? 'CANCELLED' : 'FAILED', execution: 'MOCK', output: null });
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
