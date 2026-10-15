import template from '../../../specs/m1/learning-example.json' with { type: 'json' };
import { digest, same } from '../../policy/mvp/contract.mjs';
import { validateLearningFactsShape } from '../../policy/mvp/learning-contract.mjs';
import { requireRule as check, freeze } from '../../policy/values.mjs';
import { factsDigest, pageDigest } from './daily.mjs';

export const localSourceHash = (domain, value) => digest(domain, value).slice(2);
export async function collectLocalMoodleFacts(registry, sourcePin, client, { now, signal } = {}) {
  let output;
  try {
    registry = structuredClone(registry); sourcePin = structuredClone(sourcePin);
    check(!signal?.aborted, 'LOCAL_CANCELLED');
    check(client.profile === 'clear-local-moodle.1' && client.transport === 'LOOPBACK_HTTP_ONLY', 'LOCAL_TRANSPORT');
    const identity = await client.identity(signal);
    check(identity.labOnly === true && same(identity.sourceBinding, registry.sourceBinding), 'LOCAL_ACCOUNT_BINDING');
    const m = await client.readManifest(sourcePin.revision, signal), unsigned = { ...m }; delete unsigned.manifestHash;
    check(m.profile === 'clear-local-moodle.1' && m.revision === sourcePin.revision && m.labOnly === true && m.manifestHash === sourcePin.manifestHash
      && localSourceHash('CLEAR-LOCAL-MANIFEST', unsigned) === m.manifestHash, 'LOCAL_MANIFEST_PIN');
    check(same(m.sourceBinding, registry.sourceBinding) && m.activitySetHash === registry.inventory.activitySetHash
      && same(m.sourceVersions, registry.sourceVersions)
      && m.inventoryVersion === registry.inventory.activitySetVersion && m.periodStart === registry.period.from
      && m.periodEndExclusive === registry.period.until && m.pages.length <= 100 && m.totalRows <= 10000, 'LOCAL_SOURCE_SCOPE');
    check(Number.isSafeInteger(m.observationLowerBound) && Number.isSafeInteger(m.observedAt)
      && Number.isSafeInteger(m.validUntil) && m.observationLowerBound >= m.periodStart
      && m.observationLowerBound <= m.observedAt && m.observedAt <= m.validUntil
      && m.validUntil <= m.observationLowerBound + 300
      && m.coverageEndExclusive === Math.min(m.observationLowerBound, m.periodEndExclusive), 'LOCAL_OBSERVATION_WINDOW');
    let offset = 0; const ids = new Set(), rows = [];
    for (const p of m.pages) {
      check(!ids.has(p.pageId) && p.offset === offset && p.rowCount > 0 && p.rowCount <= 100, 'LOCAL_PAGE_CHAIN'); ids.add(p.pageId);
      const page = await client.readPage(m.revision, p.pageId, signal);
      check(page.profile === m.profile && page.revision === m.revision && page.pageId === p.pageId && Array.isArray(page.records)
        && page.records.length === p.rowCount && localSourceHash('CLEAR-LOCAL-PAGE', page.records) === p.pageHash, 'LOCAL_PAGE_CHAIN');
      rows.push(...page.records); offset += p.rowCount;
    }
    check(rows.length === m.totalRows && m.terminalPageId === m.pages.at(-1)?.pageId, 'LOCAL_PAGE_CHAIN');
    check(same(m, await client.readManifest(m.revision, signal)), 'LOCAL_EXPORT_CHANGED');
    const f = structuredClone(template);
    f.dataMode = 'LOCAL_LMS_RECORD'; f.scenario = 'SHORT_REAL_PLAYBACK'; f.binding = structuredClone(registry.rawBinding);
    f.inventory = structuredClone(registry.inventory);
    f.trust = { assurance: 'SERVER_BOUNDED_CLIENT_TELEMETRY', sourceSignatureVerified: false, signerRef: null, humanAttentionProven: false,
      paymentAuthorized: false, limitations: ['LOOPBACK_HTTP_NOT_TLS','LOCAL_TEST_ACCOUNT_NOT_REAL_IDENTITY','TELEMETRY_NOT_ATTENTION','NOT_OFFICIAL_ACADEMY','SHORT_RECORD_NOT_90_100_DAYS'] };
    const seen = new Set();
    f.records = rows.map(row => {
      const a = registry.activityMappings.find(a => a.activityId === row.activityId);
      check(row.recordRevision === m.revision && a && !seen.has(row.activityId) && a.lectureId === row.lectureId && a.activityType === row.activityType && a.cmid === row.cmid, 'LOCAL_ACTIVITY_BINDING'); seen.add(row.activityId);
      const present = row.sourceStatus === 'PRESENT', absent = row.sourceStatus === 'NO_RECORD';
      if (present || absent) check(row.sourcePolicyHash === a.sourcePolicyHash && row.durationMs === a.durationMs, 'LOCAL_MEDIA_PIN');
      const r = structuredClone(template.records[0]);
      return { ...r, activityId: a.activityId, lectureId: a.lectureId, activityType: a.activityType,
        sourceRecordRef: registry.sourceBinding.sourceAccountRef + '.' + a.activityId, recordRevision: m.revision, supersedesRecordRef: null,
        sourcePolicyHash: present || absent ? row.sourcePolicyHash : null, sourceRecordStatus: row.sourceStatus,
        durationMs: present || absent ? row.durationMs : null, effectiveMs: present ? row.effectiveMs : null,
        mediaCoveredMs: present ? row.mediaCoveredMs : null, lastPositionMs: present ? row.lastPositionMs : null,
        effectiveTimeMeaning: present ? 'SERVER_BOUNDED_CLIENT_TELEMETRY' : 'UNKNOWN', providerProgressBps: null, progressRuleVersion: null,
        speedCompliance: 'UNKNOWN', normalCloseAcknowledged: present ? row.normalCloseAcknowledged : absent ? false : null,
        closedAtMs: present ? row.closedAtMs : null, sourceCreditDay: present ? row.creditDay : null, sourceReportedCredit: present ? row.sourceReportedCredit : absent ? false : null,
        dateAttributionRuleVersion: registry.dateVersion,
        deliveryMode: present && row.captureChannel === 'LOCAL_CLEARWATCH_ONLINE_PROTOCOL' ? 'STREAMING' : 'UNKNOWN',
        fieldProvenance: { measurements:'AUTHENTICATED_LOCAL_API_TELEMETRY',activityMapping:'INDEPENDENT_LOCAL_LAB_REGISTRY',identityBinding:'LOCAL_TEST_TOKEN_SUBJECT',
          progress:'NOT_PROVIDED',speed:'NOT_PROVIDED',date:'EXPLICIT_FINISH_SERVER_KST' } };
    });
    check(registry.activityMappings.length === seen.size, 'LOCAL_ACTIVITY_MISSING');
    const pages = [];
    for (let start = 0; start < f.records.length; start += 100) {
      const part = f.records.slice(start,start+100); pages.push({ pageId:'page-'+pages.length,offset:start,rowCount:part.length,pageDigest:pageDigest(part) });
    }
    const sourceCorrection = m.cause === 'LAB_CORRECTION' ? 'CORRECTED' : m.cause === 'OBSERVED_CHANGE' ? 'UNKNOWN' : 'UNCHANGED';
    f.snapshot = { collectionId:'local-export-'+m.revision,observedAt:String(m.observedAt),validUntil:String(m.validUntil),
      periodStart:String(m.periodStart),periodEndExclusive:String(m.periodEndExclusive),coverageStart:String(m.coverageStart),coverageEndExclusive:String(m.coverageEndExclusive),
      sourceRevision:m.revision,sourceCompleteness:'COMPLETE',correctionState:sourceCorrection,totalRows:f.records.length,
      pageManifest:{pages,terminalPageId:pages.at(-1).pageId,manifestDigest:digest('CLEAR-MOODLE-MANIFEST',{
        sourceRevision:m.revision,totalRows:f.records.length,terminalPageId:pages.at(-1).pageId,pages})},normalizedDigest:null };
    f.snapshot.normalizedDigest = factsDigest(f); validateLearningFactsShape(f);
    const clock = now();
    check(Number.isSafeInteger(clock) && clock >= m.observedAt && clock <= m.validUntil, 'LOCAL_STALE');
    output = { status:'COLLECTED_LOCAL_LAB',mode:'LOCAL_LAB',facts:f,sourceRevision:m.revision,sourceManifestHash:m.manifestHash,
      productConnected:false,sourceSignatureVerified:false,humanAttentionProven:false,paymentAllowed:false };
  } catch(e) {
    const codes = new Set(['LOCAL_ACCOUNT_BINDING','LOCAL_MANIFEST_PIN','LOCAL_SOURCE_SCOPE','LOCAL_PAGE_CHAIN','LOCAL_EXPORT_CHANGED','LOCAL_ACTIVITY_BINDING','LOCAL_MEDIA_PIN',
      'LOCAL_OBSERVATION_WINDOW','LOCAL_ACTIVITY_MISSING','LOCAL_STALE','LOCAL_REVISION_CHANGED','LOCAL_AUTH_REJECTED','LOCAL_ACCESS_REJECTED','LOCAL_CANCELLED','LOCAL_TIMEOUT','LOCAL_AUTH_UNAVAILABLE','LOCAL_RESPONSE_LIMIT','LOCAL_SOURCE_UNAVAILABLE']);
    output = {status:'ON_HOLD',mode:'LOCAL_LAB',reason:codes.has(e?.message)?e.message:'LOCAL_SOURCE_UNAVAILABLE',facts:null,productConnected:false,paymentAllowed:false};
  } finally { try { await client.close(); } catch { output={status:'ON_HOLD',mode:'LOCAL_LAB',reason:'LOCAL_CLEANUP_FAILED',facts:null,productConnected:false,paymentAllowed:false}; } }
  if (signal?.aborted) output = {status:'ON_HOLD',mode:'LOCAL_LAB',reason:'LOCAL_CANCELLED',facts:null,productConnected:false,paymentAllowed:false};
  return freeze(output);
}
