// Owner-side binding of an already-registered direct approval to a fresh
// operator preview context.
//
// B's relay.bindApproval() is an owner-only method with no HTTP route. The
// owner has the operator's session context only while that operator's own
// request is running, so the binding happens inside the same prepare request:
// after relay.prepare() returns PREPARED, if the owner previously recorded a
// direct approval for EXACTLY this bodyHash and D bindingHash, bind it once.
//
// This never creates an approval. Recording one is the separate owner step
// that also registers the same ref in D's durable single-use store (the D
// administration path). A grant is taken out of this registry when bound and
// is never restored: a discarded context needs a new direct approval.
const fail = code => { throw Object.assign(new Error(code), {code}); };
const check = (ok, code) => { if (!ok) fail(code); };
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);

export function createOwnerApprovalRegistry({clock = Date.now} = {}) {
  const grants = new Map();
  const key = (bodyHash, bindingHash) => `${bodyHash}:${bindingHash}`;
  const prune = () => { const now = clock(); for (const [k, g] of grants) if (g.expiresAt <= now) grants.delete(k); };
  return Object.freeze({
    /** Owner process only (never an HTTP route). */
    record({bodyHash, bindingHash, approvalRef, expiresAt}) {
      check(hex(bodyHash) && hex(bindingHash) && typeof approvalRef === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(approvalRef)
        && Number.isSafeInteger(expiresAt) && expiresAt > clock() && expiresAt <= clock() + 3600000, 'OWNER_APPROVAL_INVALID');
      prune();
      check(!grants.has(key(bodyHash, bindingHash)) && grants.size < 64, 'OWNER_APPROVAL_EXISTS');
      grants.set(key(bodyHash, bindingHash), Object.freeze({bodyHash, bindingHash, approvalRef, expiresAt}));
    },
    take(bodyHash, bindingHash) {
      prune();
      const g = grants.get(key(bodyHash, bindingHash)) ?? null;
      if (g) grants.delete(key(bodyHash, bindingHash));
      return g;
    },
    size() { prune(); return grants.size; },
  });
}

/**
 * Relay facade for the HTTP handler. Same methods; prepare additionally binds
 * a pre-recorded exact approval inside the operator's own request.
 */
export function withOwnerApprovals(relay, {registry, bindingHash, version = 'clear-operator-preview.1'}) {
  check(typeof relay?.prepare === 'function' && typeof relay.bindApproval === 'function'
    && typeof registry?.take === 'function' && hex(bindingHash), 'OWNER_APPROVAL_CONFIG');
  return Object.freeze({
    ...relay,
    async prepare(context, input, options) {
      const prepared = await relay.prepare(context, input, options);
      if (prepared?.stage !== 'PREPARED') return prepared;
      const grant = registry.take(prepared.bodyHash, bindingHash);
      if (!grant) return prepared;
      return relay.bindApproval(context, {version, contextRef: prepared.contextRef, revision: prepared.revision,
        bodyHash: prepared.bodyHash, bindingHash, approvalRef: grant.approvalRef, expiresAt: grant.expiresAt}, options);
    },
  });
}
