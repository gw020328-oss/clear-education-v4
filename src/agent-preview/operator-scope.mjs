// Server-owned supplier for B's resolveOperatorPreviewScope port.
//
// The existing CLEAR server already fixes "which wallet operates which course"
// through operatorBindings [{wallet, courseOperatorRef}] (store option or
// resolveOperatorBindings). It has NO mapping from a course to D's numeric
// institution/course/operator IDs or to a D deployment. That join is supplied
// here as explicit server configuration: one preview binding per
// courseOperatorRef, copied from the approved D deployment profile.
//
// Never derived from the browser, a wallet string or role==='operator' alone.
// No binding, more than one binding, a changed binding or a lost course
// authority all fail closed.
import {hash} from './index.mjs';

export const OPERATOR_SCOPE_CONFIG_VERSION = 'clear-operator-preview-scope.1';
const PREVIEW_MODEL = 'gemini-3.5-flash-lite';

const fail = code => { throw Object.assign(new Error(code), {code}); };
const check = (ok, code) => { if (!ok) fail(code); };
const exact = (v, keys, code) => check(v && Object.getPrototypeOf(v) === Object.prototype
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)), code);
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const positive = v => Number.isSafeInteger(v) && v > 0;
const wallet = v => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const sync = fn => {
  const v = fn();
  if (v && typeof v.then === 'function') { Promise.resolve(v).catch(() => {}); fail('OPERATOR_SCOPE_ASYNC'); }
  return v;
};

/**
 * Validate the server-owned preview scope configuration. One entry per
 * courseOperatorRef; one D actor tuple is never shared by two courses.
 */
export function validateOperatorScopeConfig(raw) {
  const c = structuredClone(raw);
  exact(c, ['version', 'bindings'], 'OPERATOR_SCOPE_CONFIG');
  check(c.version === OPERATOR_SCOPE_CONFIG_VERSION && Array.isArray(c.bindings)
    && c.bindings.length > 0 && c.bindings.length <= 32, 'OPERATOR_SCOPE_CONFIG');
  const refs = new Set(), actors = new Set();
  for (const b of c.bindings) {
    exact(b, ['courseOperatorRef', 'scopeRef', 'authorityRevision', 'expiresAtMs', 'dActor', 'deployment'], 'OPERATOR_SCOPE_CONFIG');
    check(typeof b.courseOperatorRef === 'string' && /^[a-z][a-z0-9.-]{0,63}$/.test(b.courseOperatorRef)
      && typeof b.scopeRef === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(b.scopeRef)
      && positive(b.authorityRevision) && positive(b.expiresAtMs), 'OPERATOR_SCOPE_CONFIG');
    exact(b.dActor, ['institutionId', 'courseId', 'operatorId'], 'OPERATOR_SCOPE_CONFIG');
    check(typeof b.dActor.institutionId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(b.dActor.institutionId)
      && ['courseId', 'operatorId'].every(k => typeof b.dActor[k] === 'string' && /^[1-9][0-9]{0,9}$/.test(b.dActor[k])),
    'OPERATOR_SCOPE_CONFIG');
    exact(b.deployment, ['artifactHash', 'deploymentEpoch', 'bindingHash', 'model', 'limitsHash'], 'OPERATOR_SCOPE_CONFIG');
    check(['artifactHash', 'bindingHash', 'limitsHash'].every(k => hex(b.deployment[k]))
      && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(b.deployment.deploymentEpoch)
      && b.deployment.model === PREVIEW_MODEL, 'OPERATOR_SCOPE_CONFIG');
    const actor = hash(b.dActor);
    check(!refs.has(b.courseOperatorRef) && !actors.has(actor), 'OPERATOR_SCOPE_DUPLICATE');
    refs.add(b.courseOperatorRef); actors.add(actor);
  }
  return freeze(c);
}

/**
 * @param {object} ports
 * @param {{authorizeWorkflow:Function, whoami:Function}} ports.authentication  existing application service
 * @param {() => Array<{wallet:string,courseOperatorRef:string}>} ports.operatorBindings
 *   the same current course-operator source the bootcamp store uses
 * @param {() => object} ports.previewBindings  current validated scope config (validateOperatorScopeConfig)
 * @param {() => number} [ports.clock]  ms
 * @returns {(context:object, options:{signal:AbortSignal}) => object} resolveOperatorPreviewScope
 */
export function createOperatorScopeResolver({authentication, operatorBindings, previewBindings, clock = Date.now} = {}) {
  check(typeof authentication?.authorizeWorkflow === 'function' && typeof authentication?.whoami === 'function'
    && typeof operatorBindings === 'function' && typeof previewBindings === 'function'
    && typeof clock === 'function', 'OPERATOR_SCOPE_PORTS');

  // One synchronous lookup. Used for the initial snapshot and for every
  // assertCurrent; the two must agree on the exact same binding.
  function lookup(context) {
    const actor = sync(() => authentication.authorizeWorkflow(context, true));
    check(actor?.role === 'operator' && wallet(actor.wallet), 'OPERATOR_SCOPE_FORBIDDEN');
    const session = sync(() => authentication.whoami(context));
    check(session?.role === 'operator' && session.wallet === actor.wallet && positive(session.expiresAt), 'OPERATOR_SCOPE_FORBIDDEN');
    const me = actor.wallet.toLowerCase();
    const bindings = sync(operatorBindings);
    check(Array.isArray(bindings), 'OPERATOR_SCOPE_UNAVAILABLE');
    const courses = new Set();
    for (const b of bindings) {
      check(b && wallet(b.wallet) && typeof b.courseOperatorRef === 'string', 'OPERATOR_SCOPE_UNAVAILABLE');
      if (b.wallet.toLowerCase() === me) courses.add(b.courseOperatorRef);
    }
    // Course authority comes only from the existing server binding.
    check(courses.size > 0, 'OPERATOR_SCOPE_FORBIDDEN');
    const config = validateOperatorScopeConfig(sync(previewBindings));
    const matches = config.bindings.filter(b => courses.has(b.courseOperatorRef));
    // The browser DTO carries no course selector, so the server must resolve
    // exactly one course. Zero = preview not configured for this course.
    check(matches.length === 1, matches.length === 0 ? 'OPERATOR_SCOPE_NOT_CONFIGURED' : 'OPERATOR_SCOPE_AMBIGUOUS');
    const binding = matches[0], now = sync(clock);
    check(positive(now), 'OPERATOR_SCOPE_CLOCK');
    const expiresAtMs = Math.min(binding.expiresAtMs, session.expiresAt * 1000);
    check(now < expiresAtMs, 'OPERATOR_SCOPE_EXPIRED');
    return {me, binding, expiresAtMs, fingerprint: hash({wallet: me, binding})};
  }

  return function resolveOperatorPreviewScope(context, {signal} = {}) {
    check(signal instanceof AbortSignal && !signal.aborted, 'OPERATOR_SCOPE_CANCELLED');
    const first = lookup(context);
    const {binding} = first;
    return {
      scopeRef: binding.scopeRef,
      authorityRevision: binding.authorityRevision,
      expiresAtMs: first.expiresAtMs,
      dActor: {...binding.dActor},
      deployment: {...binding.deployment},
      // Synchronous currentness of this exact snapshot: same session wallet,
      // same course authority, same preview binding, not expired.
      assertCurrent() {
        const now = lookup(context);
        check(now.me === first.me && now.fingerprint === first.fingerprint && now.expiresAtMs === first.expiresAtMs,
          'OPERATOR_SCOPE_CHANGED');
      },
    };
  };
}
