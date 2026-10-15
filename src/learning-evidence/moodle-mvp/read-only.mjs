import { validateContract, same } from '../../policy/mvp/contract.mjs';
import { validateLearningFactsShape } from '../../policy/mvp/learning-contract.mjs';
import { factsDigest, pageDigest } from './daily.mjs';
import { exactKeys, freeze, requireRule as check } from '../../policy/values.mjs';

const PROFILE = 'synthetic-moodle-export.1';
const flags = { mode: 'SYNTHETIC', collectionEnabled: false, sourceAuthenticityVerified: false,
  productConnected: false, humanAttentionProven: false, paymentAllowed: false };
const fail = reason => freeze({ ...flags, status: 'ON_HOLD', reason, facts: null });
function decode(reply) {
  check(typeof reply === 'string' && Buffer.byteLength(reply) <= 262144, 'LEARNING_RESPONSE_LIMIT');
  const inner = JSON.parse(reply);
  check(typeof inner === 'string' && Buffer.byteLength(inner) <= 262144, 'LEARNING_RESPONSE_SHAPE');
  return JSON.parse(inner);
}

// Preparation transport is injected and IN_MEMORY_ONLY. It cannot perform HTTP,
// authenticate users, discover URLs, access tokens, or invoke exchange/begin.
export async function collectSyntheticMoodleFacts(trusted, client, { now, signal, timeoutMs = 1000 } = {}) {
  validateContract('SourceBinding', trusted.sourceBinding);
  validateContract('Binding', trusted.binding);
  check(typeof now === 'function' && Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000, 'LEARNING_DRIVER_CONFIG');
  if (client?.profile !== PROFILE || client.transport !== 'IN_MEMORY_ONLY') return fail('LEARNING_TRANSPORT_BLOCKED');
  const pin = structuredClone(trusted), query = { sourceBinding: pin.sourceBinding, expectedRevision: pin.sourceRevision };
  let result, closeFailed = false;
  const request = async (fn, q) => {
    if (signal?.aborted) throw new Error('LEARNING_CANCELLED');
    let timer, abort;
    try {
      const stop = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('LEARNING_TIMEOUT')), timeoutMs);
        abort = () => reject(new Error('LEARNING_CANCELLED'));
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
      // Start after registering cancellation. Late replies cannot mutate pins or
      // an already returned result; each request receives its own query clone.
      const response = Promise.resolve().then(() => fn(structuredClone(q), signal));
      return decode(await Promise.race([response, stop]));
    } finally {
      clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort);
    }
  };
  try {
    const manifest = await request(client.readManifest.bind(client), query);
    exactKeys(manifest, ['profile', 'header'], 'LEARNING_EXPORT_SCHEMA'); check(manifest.profile === PROFILE, 'LEARNING_EXPORT_SCHEMA');
    const h = manifest.header;
    check(h && !Object.hasOwn(h, 'records'), 'LEARNING_EXPORT_SCHEMA');
    validateLearningFactsShape({ ...h, records: [] });
    check(h.dataMode === 'SYNTHETIC' && same(h.binding, pin.rawBinding) && same(h.inventory, pin.inventory), 'LEARNING_EXPORT_SCOPE');
    const b = h.binding, sb = pin.sourceBinding;
    check(b.institutionId === sb.institutionId && b.providerInstanceId === sb.providerInstanceId
      && b.courseId === sb.courseId && b.accountBindingId === sb.accountBindingId && b.accountBindingVersion === sb.accountBindingVersion
      && b.applicationId === pin.binding.applicationId && b.subjectRef === pin.binding.subjectRef
      && b.policyHash === pin.binding.policyHash && b.policyVersion === pin.binding.policyVersion, 'LEARNING_EXPORT_SCOPE');
    const s = h.snapshot, m = s.pageManifest;
    check(s.sourceRevision === pin.sourceRevision && s.normalizedDigest === pin.factsHash && m !== null
      && s.totalRows !== null && s.totalRows > 0, 'LEARNING_EXPORT_PIN');
    const rows = [], ids = new Set(); let offset = 0;
    check(m.terminalPageId === m.pages.at(-1).pageId, 'LEARNING_PAGE_CHAIN');
    for (const page of m.pages) {
      check(!ids.has(page.pageId) && page.offset === offset && page.rowCount > 0, 'LEARNING_PAGE_CHAIN');
      ids.add(page.pageId);
      const p = await request(client.readPage.bind(client), { ...query, pageId: page.pageId });
      exactKeys(p, ['profile', 'revision', 'pageId', 'records'], 'LEARNING_EXPORT_SCHEMA');
      check(p.profile === PROFILE && p.revision === pin.sourceRevision && p.pageId === page.pageId
        && Array.isArray(p.records) && p.records.length === page.rowCount && pageDigest(p.records) === page.pageDigest, 'LEARNING_PAGE_CHAIN');
      rows.push(...p.records); offset += page.rowCount;
    }
    check(rows.length === s.totalRows && rows.length <= 10000, 'LEARNING_PAGE_CHAIN');
    const finalManifest = await request(client.readManifest.bind(client), query);
    check(same(manifest, finalManifest), 'LEARNING_EXPORT_CHANGED');
    const facts = { ...h, records: rows }; validateLearningFactsShape(facts);
    check(factsDigest(facts) === pin.factsHash, 'LEARNING_EXPORT_PIN');
    result = { ...flags, status: 'COLLECTED_SYNTHETIC', reason: null, facts };
  } catch (error) {
    const allowed = new Set(['LEARNING_CANCELLED', 'LEARNING_TIMEOUT', 'LEARNING_RESPONSE_LIMIT', 'LEARNING_RESPONSE_SHAPE',
      'LEARNING_EXPORT_SCHEMA', 'LEARNING_EXPORT_SCOPE', 'LEARNING_EXPORT_PIN', 'LEARNING_PAGE_CHAIN', 'LEARNING_EXPORT_CHANGED']);
    result = fail(error.message === 'EXPORT_REVISION_CHANGED' ? 'LEARNING_SOURCE_REVISION_CHANGED'
      : error.message === 'EXPORT_SCOPE' ? 'LEARNING_EXPORT_SCOPE'
      : allowed.has(error.message) ? error.message : 'LEARNING_SOURCE_UNAVAILABLE');
  } finally {
    let closeTimer;
    try {
      await Promise.race([Promise.resolve().then(() => client.close()), new Promise((_, reject) => {
        closeTimer = setTimeout(() => reject(new Error('CLOSE_TIMEOUT')), timeoutMs);
      })]);
    } catch { closeFailed = true; } finally { clearTimeout(closeTimer); }
  }
  if (closeFailed) return fail('LEARNING_CLEANUP_FAILED');
  if (signal?.aborted) return fail('LEARNING_CANCELLED');
  if (result.facts) {
    const clock = now(), s = result.facts.snapshot;
    if (!Number.isSafeInteger(clock) || clock < 0 || clock > 4102444800 || s.validUntil === null
      || BigInt(s.observedAt) > BigInt(clock) || BigInt(s.validUntil) < BigInt(clock)) return fail('LEARNING_STALE');
  }
  return freeze(result);
}
