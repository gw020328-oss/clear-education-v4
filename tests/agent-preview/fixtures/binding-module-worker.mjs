import { createBindingCoordinator, createSyntheticControlPlane, createSyntheticVerifier } from '../../../src/agent-preview/moodle-binding/index.mjs';
import { responseFor, context, timePolicy, sessionKey } from './binding-module-fixture.mjs';

let runtime, release;
process.on('message', async message => {
  try {
    if (message.op === 'run') {
      const verifier = createSyntheticVerifier(request => new Promise(resolve => {
        release = () => resolve(responseFor(request, message.policy, 1000));
        process.send({ phase: 'REMOTE_READY' });
      }));
      runtime = createBindingCoordinator({ paths: message.paths, control: createSyntheticControlPlane(message.policy), verifier,
        clock: { wall: () => 1000, monotonic: () => 1000 }, timePolicy, sessionKey });
      const value = await runtime.complete(context, 'app-a', message.body);
      process.send({ phase: 'RESULT', ok: true, value });
    } else if (message.op === 'respond') release();
  } catch (error) { process.send({ phase: 'RESULT', ok: false, reason: error.message }); }
});
process.on('disconnect', () => { runtime?.close(); process.exit(0); });
