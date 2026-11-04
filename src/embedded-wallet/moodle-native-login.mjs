// C receives only its sesskey and original-tab proof, never a CLEAR cookie,
// CSRF value, wallet signature or provider token. Authority remains server-side.
const check = ok => { if (!ok) throw Error('MOODLE_LOGIN_UNAVAILABLE'); };
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const exact = (v, keys) => v && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export function createNativeMoodleLogin({config, api, fetch: fetchImpl = globalThis.fetch, locks = globalThis.navigator?.locks}) {
  check(config.surface === 'MOODLE_NATIVE' && Number.isSafeInteger(config.courseId) && config.courseId > 0
    && typeof config.sesskey === 'string' && /^[a-zA-Z0-9]{10,64}$/.test(config.sesskey) && locks?.request);
  let finishProof = null, pending = false, attempted = false;
  async function course(operation, fields, signal) {
    const response = await fetchImpl(config.origin + '/local/clearbridge/login_action.php', {
      method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal,
      body: new URLSearchParams({id: String(config.courseId), sesskey: config.sesskey, operation, ...fields}),
    });
    check(response.ok && !response.redirected);
    const result = await response.json(); signal?.throwIfAborted(); return result;
  }
  return Object.freeze({
    async begin(signal) {
      check(!pending); pending = true; finishProof = null;
      try {
        await locks.request('clear-moodle-login-redeem', {signal}, async () => {
          signal.throwIfAborted();
          const boot = await api('/moodle/connect/bootstrap', {method: 'POST', body: {}, signal});
          check(exact(boot, ['challenge', 'expiresAtExclusive']) && hex(boot.challenge));
          attempted = true;
          const issued = await course('start', {challenge: boot.challenge}, signal);
          check(exact(issued, ['status', 'expiresAtExclusive', 'launchCode', 'browserProof', 'finishProof'])
            && issued.status === 'WAITING' && [issued.launchCode, issued.browserProof, issued.finishProof].every(hex));
          finishProof = issued.finishProof;
          const binding = await api('/moodle/connect/redeem', {method: 'POST', signal,
            body: {code: issued.launchCode, challenge: boot.challenge, browserProof: issued.browserProof}});
          check(exact(binding, ['status', 'role', 'expiresAtExclusive']) && binding.status === 'WAITING' && binding.role === config.role);
        });
      } catch (error) { finishProof = null; throw error; }
      finally { pending = false; }
    },
    async complete(session, signal) {
      check(hex(finishProof));
      const result = await session.request('/auth/moodle-complete', {method: 'POST', body: {}, signal});
      check(exact(result, ['status']) && result.status === 'RETURN_TO_MOODLE');
    },
    async finish(signal) {
      check(hex(finishProof));
      let result;
      try { result = await course('finish', {finishProof}, signal); }
      catch (error) {
        // A read can confirm a lost response. Never repeat the finish mutation.
        if (signal.aborted) throw error;
        result = await course('status', {}, signal);
      }
      check(exact(result, ['status']) && result.status === 'CONNECTED');
      finishProof = null;
    },
    async end(signal) {
      finishProof = null;
      if (!attempted) return;
      const result = await course('end', {}, signal);
      check(exact(result, ['status']) && ['ENDED', 'UNAVAILABLE', 'EXPIRED'].includes(result.status));
      attempted = false;
    },
  });
}
