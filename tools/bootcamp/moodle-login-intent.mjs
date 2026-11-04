import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {canonical, exactKeys, requireRule as check} from '../../src/policy/values.mjs';

export const MOODLE_LOGIN_INTENT = 'clear-moodle-login-intent.1';
const roles = ['PARTICIPANT', 'COURSE_OPERATOR'];
const requestKeys = ['version', 'requestRef', 'ownerRunId', 'moodleAuthorityRef', 'role', 'expiresAtExclusive'];
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const ref = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const address = value => typeof value === 'string' && /^0x[a-f0-9]{40}$/.test(value) && !/^0x0+$/.test(value);
const token = () => randomBytes(32).toString('hex');
const digest = value => createHash('sha256').update(value).digest();
const matches = (value, expected) => hex(value) && Buffer.isBuffer(expected) && timingSafeEqual(digest(value), expected);
const routes = Object.freeze({PARTICIPANT: '/onboarding', COURSE_OPERATOR: '/operator'});

// Private owner state only. The transport authenticates each wire request and
// the independent verifier checks the original Moodle session and current ACL.
export function createMoodleLoginIntents({
  ownerRunId, runExpiresAtExclusive, scope, wallets, verifyMoodle, authenticateClear, deriveBrowserProof, deriveFinishProof,
  now = () => Math.floor(Date.now() / 1000), monotonic = () => performance.now(),
}) {
  exactKeys(scope, ['installationRef', 'courseRef', 'subjectRef', 'actorRefs'], 'MOODLE_LOGIN_CONFIG');
  exactKeys(scope.actorRefs, roles, 'MOODLE_LOGIN_CONFIG');
  exactKeys(wallets, roles, 'MOODLE_LOGIN_CONFIG');
  check(ref(ownerRunId) && Number.isSafeInteger(runExpiresAtExclusive)
    && [scope.installationRef, scope.courseRef, scope.subjectRef, ...Object.values(scope.actorRefs)].every(ref)
    && scope.actorRefs.PARTICIPANT === scope.subjectRef && scope.actorRefs.COURSE_OPERATOR !== scope.subjectRef
    && Object.values(wallets).every(address) && wallets.PARTICIPANT !== wallets.COURSE_OPERATOR
    && [verifyMoodle, authenticateClear, deriveBrowserProof, deriveFinishProof, now, monotonic].every(f => typeof f === 'function'), 'MOODLE_LOGIN_CONFIG');
  scope = structuredClone(scope);
  wallets = structuredClone(wallets);

  const attempts = new Map(), launches = new Map(), browsers = new Map(), bootstraps = new Map();
  let closed = false, wallFloor = 0, monoFloor = 0;
  const time = () => {
    const wall = now(), mono = monotonic();
    check(!closed && Number.isSafeInteger(wall) && wall > 0 && wall >= wallFloor
      && Number.isFinite(mono) && mono >= monoFloor, 'MOODLE_LOGIN_CLOCK');
    wallFloor = wall;
    monoFloor = mono;
    return {wall, mono};
  };
  const initial = time();
  const runMonotonicEnd = initial.mono + (runExpiresAtExclusive - initial.wall) * 1000;
  const live = (a, t) => t.wall < Math.min(a.expiresAtExclusive, runExpiresAtExclusive)
    && t.mono < Math.min(a.monotonicEnd, runMonotonicEnd);
  function requireLive(attempt, signal) {
    signal?.throwIfAborted();
    check(live(attempt, time()), 'MOODLE_LOGIN_EXPIRED');
  }
  function clearAttempt(a, phase) {
    launches.delete(a.launchHash);
    browsers.delete(a.browserHash);
    a.finishProofHash = a.handbackHash = a.handback = a.context = null;
    a.phase = phase;
  }
  function request(input, operation, t) {
    const tail = operation === 'start' ? [] : operation === 'finish' ? ['intentRef', 'handback', 'finishProof'] : ['intentRef'];
    exactKeys(input, [...requestKeys, ...tail], 'MOODLE_LOGIN_REQUEST');
    const q = Object.freeze(structuredClone(input));
    check(q.version === MOODLE_LOGIN_INTENT && q.ownerRunId === ownerRunId && roles.includes(q.role)
      && hex(q.requestRef) && hex(q.moodleAuthorityRef) && Number.isSafeInteger(q.expiresAtExclusive)
      && t.wall < q.expiresAtExclusive && q.expiresAtExclusive <= t.wall + 5
      && (!tail.length || hex(q.intentRef) && q.requestRef !== q.intentRef)
      && (operation !== 'finish' || hex(q.handback) && hex(q.finishProof)), 'MOODLE_LOGIN_REQUEST');
    return q;
  }
  async function authority(operation, q, t, signal) {
    signal?.throwIfAborted();
    const grant = structuredClone(await verifyMoodle(Object.freeze({operation, request: q}), {signal}));
    signal?.throwIfAborted();
    const checked = time();
    check(checked.wall < q.expiresAtExclusive && checked.mono - t.mono < 5000, 'MOODLE_LOGIN_LEASE_EXPIRED');
    exactKeys(grant, ['ownerRunId', 'role', 'installationRef', 'courseRef', 'subjectRef',
      'actorRef', 'sessionRef', 'expiresAtExclusive'], 'MOODLE_LOGIN_AUTHORITY');
    check(grant.ownerRunId === ownerRunId && grant.role === q.role
      && ['installationRef', 'courseRef', 'subjectRef'].every(key => grant[key] === scope[key])
      && grant.actorRef === scope.actorRefs[q.role] && hex(grant.sessionRef)
      && Number.isSafeInteger(grant.expiresAtExclusive) && checked.wall < grant.expiresAtExclusive, 'MOODLE_LOGIN_AUTHORITY');
    const {expiresAtExclusive, ...identity} = grant;
    return {identity: canonical(identity), expiresAtExclusive};
  }
  function clearExpiry(role, context) {
    const actor = authenticateClear(context);
    check(actor?.role === (role === 'PARTICIPANT' ? 'participant' : 'operator')
      && actor.wallet?.toLowerCase() === wallets[role] && Number.isSafeInteger(actor.expiresAt)
      && time().wall < actor.expiresAt, 'MOODLE_LOGIN_CLEAR_ACTOR');
    return actor.expiresAt;
  }
  const answer = (q, status, expiresAtExclusive = null, handback = null) => ({
    version: MOODLE_LOGIN_INTENT, requestRef: q.requestRef, status, expiresAtExclusive, handback,
  });

  async function inspect(input, operation, {signal} = {}) {
    const t = time(), q = request(input, operation, t), a = attempts.get(q.intentRef);
    if (!a?.identity || a.request.role !== q.role) return answer(q, 'UNAVAILABLE');
    const before = a.phase;
    try {
      const grant = await authority(operation, q, t, signal);
      if (grant.identity !== a.identity || a.phase !== before) return answer(q, 'UNAVAILABLE');
      if (!live(a, time())) {
        clearAttempt(a, 'EXPIRED');
        return answer(q, 'EXPIRED');
      }
      if (operation === 'end') {
        clearAttempt(a, 'ENDED');
        return answer(q, 'UNAVAILABLE');
      }
      const expiry = Math.min(grant.expiresAtExclusive, a.expiresAtExclusive);
      if (before === 'CONNECTED' || before === 'RETURN_REQUIRED') {
        clearExpiry(q.role, a.context);
        return answer(q, before, expiry, before === 'RETURN_REQUIRED' ? a.handback : null);
      }
      if (['ISSUED', 'WAITING', 'COMPLETING'].includes(before)) return answer(q, 'WAITING', expiry);
      return answer(q, 'UNAVAILABLE');
    } catch {
      return answer(q, 'UNAVAILABLE');
    }
  }

  return Object.freeze({
    async issue(input, {signal} = {}) {
      const t = time(), q = request(input, 'start', t);
      for (const a of attempts.values()) if (!live(a, t)) clearAttempt(a, 'EXPIRED');
      check(t.wall < runExpiresAtExclusive && attempts.size < 32 && !attempts.has(q.requestRef), 'MOODLE_LOGIN_REPLAY');
      const a = {request: q, expiresAtExclusive: Math.min(t.wall + 300, runExpiresAtExclusive),
        monotonicEnd: t.mono + 300000, phase: 'VERIFYING'};
      attempts.set(q.requestRef, a);
      try {
        const grant = await authority('start', q, t, signal);
        requireLive(a, signal);
        a.moodleHorizon = grant.expiresAtExclusive;
        a.moodleMonotonicEnd = t.mono + (a.moodleHorizon - t.wall) * 1000;
        a.expiresAtExclusive = Math.min(a.expiresAtExclusive, a.moodleHorizon);
        a.identity = grant.identity;
        const launchCode = token();
        const finishProof = deriveFinishProof({ownerRunId, intentRef: q.requestRef, launchCode});
        check(hex(finishProof), 'MOODLE_LOGIN_PROOF');
        a.finishProofHash = digest(finishProof);
        a.launchHash = digest(launchCode).toString('hex');
        a.launchExpires = Math.min(t.wall + 120, a.expiresAtExclusive);
        a.launchMonotonicEnd = t.mono + 120000;
        a.phase = 'ISSUED';
        launches.set(a.launchHash, a);
        return {version: MOODLE_LOGIN_INTENT, requestRef: q.requestRef, status: 'WAITING',
          expiresAtExclusive: a.launchExpires, launchCode};
      } catch (error) {
        clearAttempt(a, 'FAILED');
        throw error;
      }
    },
    bootstrap() {
      const t = time();
      for (const [key, pending] of bootstraps) if (!live(pending, t)) bootstraps.delete(key);
      check(t.wall < runExpiresAtExclusive && bootstraps.size < 32, 'MOODLE_LOGIN_BOOTSTRAP');
      const challenge = token(), bootstrapCookie = token();
      const expiresAtExclusive = Math.min(runExpiresAtExclusive, t.wall + 120);
      bootstraps.set(digest(challenge).toString('hex'), {cookieHash: digest(bootstrapCookie),
        expiresAtExclusive, monotonicEnd: t.mono + 120000});
      return {challenge, bootstrapCookie, expiresAtExclusive};
    },
    redeem({code, browserProof, challenge, bootstrapCookie}) {
      check(hex(code) && hex(challenge), 'MOODLE_LOGIN_LAUNCH');
      const a = launches.get(digest(code).toString('hex')), t = time(), challengeHash = digest(challenge).toString('hex');
      const pending = bootstraps.get(challengeHash);
      check(a?.phase === 'ISSUED' && live(a, t) && t.wall < a.launchExpires && t.mono < a.launchMonotonicEnd
        && pending && live(pending, t) && matches(bootstrapCookie, pending.cookieHash), 'MOODLE_LOGIN_LAUNCH');
      const expected = deriveBrowserProof({ownerRunId, intentRef: a.request.requestRef, launchCode: code, challenge});
      check(hex(expected) && matches(browserProof, digest(expected)) && !matches(browserProof, a.finishProofHash), 'MOODLE_LOGIN_LAUNCH');
      bootstraps.delete(challengeHash);
      launches.delete(a.launchHash);
      const browserBinding = token();
      a.browserHash = digest(browserBinding).toString('hex');
      a.phase = 'WAITING';
      browsers.set(a.browserHash, a);
      return {location: routes[a.request.role], browserBinding, expiresAtExclusive: a.expiresAtExclusive};
    },
    async complete(browserBinding, context, {signal} = {}) {
      check(hex(browserBinding), 'MOODLE_LOGIN_BROWSER');
      const a = browsers.get(digest(browserBinding).toString('hex'));
      check(a?.phase === 'WAITING', 'MOODLE_LOGIN_BROWSER');
      requireLive(a, signal);
      exactKeys(context, ['token', 'wallet', 'chainId', 'csrf'], 'MOODLE_LOGIN_CONTEXT');
      const clearContext = Object.freeze(structuredClone(context)), role = a.request.role;
      const expiry = clearExpiry(role, clearContext), t = time();
      // This server-originated operation uses a fresh lease. The expired start
      // request remains an intent reference and is never a verification input.
      const q = Object.freeze({...a.request, requestRef: token(), intentRef: a.request.requestRef,
        expiresAtExclusive: t.wall + 5});
      a.phase = 'COMPLETING';
      try {
        const grant = await authority('complete', q, t, signal);
        requireLive(a, signal);
        check(a.phase === 'COMPLETING' && grant.identity === a.identity
          && clearExpiry(role, clearContext) === expiry, 'MOODLE_LOGIN_AUTHORITY_CHANGED');
        const checked = time();
        a.moodleHorizon = Math.min(a.moodleHorizon, grant.expiresAtExclusive);
        a.expiresAtExclusive = Math.min(a.expiresAtExclusive, checked.wall + 60, grant.expiresAtExclusive, expiry);
        a.monotonicEnd = Math.min(a.monotonicEnd, checked.mono + 60000);
        a.context = clearContext;
        a.handback = token();
        a.handbackHash = digest(a.handback);
        a.phase = 'RETURN_REQUIRED';
        return {status: 'RETURN_REQUIRED'};
      } catch (error) {
        if (a.phase === 'COMPLETING') clearAttempt(a, 'FAILED');
        throw error;
      } finally {
        browsers.delete(a.browserHash);
      }
    },
    async finish(input, {signal} = {}) {
      const t = time(), q = request(input, 'finish', t), a = attempts.get(q.intentRef);
      if (a?.phase !== 'RETURN_REQUIRED' || a.request.role !== q.role || !live(a, t)
        || !matches(q.handback, a.handbackHash) || !matches(q.finishProof, a.finishProofHash)) return answer(q, 'UNAVAILABLE');
      a.phase = 'FINISHING';
      try {
        const expiry = clearExpiry(q.role, a.context);
        const grant = await authority('finish', q, t, signal);
        requireLive(a, signal);
        check(a.phase === 'FINISHING' && grant.identity === a.identity
          && clearExpiry(q.role, a.context) === expiry, 'MOODLE_LOGIN_AUTHORITY_CHANGED');
        a.expiresAtExclusive = Math.min(runExpiresAtExclusive, a.moodleHorizon, grant.expiresAtExclusive, expiry);
        a.monotonicEnd = Math.min(runMonotonicEnd, a.moodleMonotonicEnd, t.mono + (a.expiresAtExclusive - t.wall) * 1000);
        a.finishProofHash = a.handbackHash = a.handback = null;
        a.phase = 'CONNECTED';
        return answer(q, 'CONNECTED', a.expiresAtExclusive);
      } catch {
        if (a.phase === 'FINISHING') clearAttempt(a, 'FAILED');
        return answer(q, 'UNAVAILABLE');
      }
    },
    status(input, options) { return inspect(input, 'status', options); },
    end(input, options) { return inspect(input, 'end', options); },
    close() {
      closed = true;
      for (const a of attempts.values()) clearAttempt(a, 'ENDED');
      attempts.clear();
      bootstraps.clear();
    },
  });
}
