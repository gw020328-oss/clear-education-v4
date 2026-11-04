import {exactKeys, requireRule as check} from '../../src/policy/values.mjs';
import {createMoodleLoginIntents} from './moodle-login-intent.mjs';
import {createMoodleLoginBrowser} from './moodle-login-browser.mjs';
import {createMoodleLoginAuthority, createMoodleLoginProofs} from './moodle-login-wire.mjs';

// The run owner supplies fixed topology, credentials and scope through its
// already hash-pinned module. None can be selected by an HTTP caller.
export function createNormalMoodleLogin({options, ownerRunId, runExpiresAtExclusive, authentication, wallets, now, signal, native = false}) {
  exactKeys(options, ['moodleOrigin', 'scope', 'proofKey', 'reverseKey', 'reverseCa', 'connectionPort'], 'MOODLE_LOGIN_CONFIG');
  check(options.proofKey !== options.reverseKey, 'MOODLE_LOGIN_CONFIG');
  const proofs = createMoodleLoginProofs(options.proofKey);
  let authority, intents;
  const close = () => { intents?.close(); authority?.close(); proofs.close(); };
  try {
    authority = createMoodleLoginAuthority({moodleOrigin: options.moodleOrigin, reverseKey: options.reverseKey, ca: options.reverseCa,
      connectionPort: options.connectionPort, signal, now});
    intents = createMoodleLoginIntents({
      ownerRunId, runExpiresAtExclusive, scope: options.scope, wallets, verifyMoodle: authority.verify,
      deriveBrowserProof: proofs.deriveBrowserProof, deriveFinishProof: proofs.deriveFinishProof, now,
      authenticateClear: context => {
        authentication.authorizeWorkflow(context, true);
        const {wallet, role, expiresAt} = authentication.whoami(context);
        return {wallet, role, expiresAt};
      },
    });
    const browser = createMoodleLoginBrowser({origin: authentication.origin, moodleOrigin: options.moodleOrigin,
      ownerRunId, intents, now, signal, native});
    const owner = Object.freeze({issue: intents.issue, status: intents.status, end: intents.end, finish: intents.finish});
    return Object.freeze({browser, owner, close});
  } catch (error) { close(); throw error; }
}
