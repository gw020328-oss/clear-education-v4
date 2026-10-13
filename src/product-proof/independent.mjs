import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { freeze, requireRule, RuleError } from '../policy/values.mjs';
import { MAX_VERIFIER_BYTES, PRODUCT_PROOF_VERSION, publicVerificationInput } from './contract.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
let activeChildren = 0;
// forkChild/timeoutMs exist for process failure tests, never in service config or HTTP.
export async function verifyProductIndependently(input, { signal, forkChild = fork, timeoutMs = 30000 } = {}) {
  signal?.throwIfAborted();
  const bytes = Buffer.from(JSON.stringify(publicVerificationInput(input)));
  if (bytes.length > MAX_VERIFIER_BYTES) { bytes.fill(0); throw new RuleError('PRODUCT_SIZE'); }
  if (activeChildren >= 4) { bytes.fill(0); throw new RuleError('PRODUCT_VERIFIER_BUSY'); }
  activeChildren++;
  let child;
  try {
    child = forkChild(new URL('./worker.mjs', import.meta.url), [], {
      execArgv: ['--permission', '--allow-fs-read=' + root + 'src', '--allow-fs-read=' + root + 'node_modules', '--allow-fs-read=' + root + 'package.json'],
      env: { PATH: '/usr/bin:/bin', LOG_LEVEL: 'silent' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    return await new Promise((resolve, reject) => {
      let response, messages = 0, failed = false, stopping = false;
      const stop = () => { failed = true; if (!stopping) { stopping = true; child.kill('SIGKILL'); } };
      const timer = setTimeout(stop, timeoutMs);
      signal?.addEventListener('abort', stop, { once: true }); child.on('error', stop);
      child.on('message', value => { if (++messages !== 1) stop(); else response = value; });
      child.once('close', code => {
        clearTimeout(timer); signal?.removeEventListener('abort', stop);
        if (!failed && !signal?.aborted && code === 0 && response?.ok === true
          && response.result?.version === PRODUCT_PROOF_VERSION) resolve(freeze(response.result));
        else reject(new RuleError('PRODUCT_VERIFICATION_FAILED'));
      });
      try { child.send(bytes.toString('utf8'), error => { if (error) stop(); }); } catch { stop(); }
      if (signal?.aborted) stop();
    });
  } catch { throw new RuleError('PRODUCT_VERIFICATION_FAILED'); }
  finally { bytes.fill(0); activeChildren--; }
}
