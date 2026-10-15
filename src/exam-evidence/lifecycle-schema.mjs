// Additive synthetic lifecycle contract. No live adapter or wire/API compatibility claim.
const obj = properties => ({type:'object', properties, required:Object.keys(properties), additionalProperties:false});
const fixed = value => ({const:value});
const one = (...values) => ({enum:values});
const integer = (minimum, maximum) => ({type:'integer', minimum, maximum});
const id = {type:'string', minLength:1, maxLength:64, pattern:'^[a-z][a-z0-9.-]*$'};
const hash = {type:'string', pattern:'^0x[0-9a-f]{64}$'};
const time = integer(0, 4102444800);
const nullableTime = {anyOf:[time,{type:'null'}]};
const revision = integer(1, 2147483647);
const purpose = one('BASELINE_HISTORY','ACHIEVEMENT');
const marker = {version:fixed('clear-exam-lifecycle.1'), mode:fixed('SYNTHETIC'), paymentAllowed:fixed(false)};
const binding = obj({applicationId:id, policyVersion:id, participantRef:id, bindingRevision:revision, recipientRef:id, instanceId:id});
const period = obj({from:time, until:time, boundaries:fixed('[from,until)')});
const status = one('MET_SYNTHETIC','NOT_MET','UNKNOWN');
const reason = one('NONE','SOURCE_UNVERIFIED','ACCOUNT_UNVERIFIED','COVERAGE_UNKNOWN','EMPTY_UNCONFIRMED',
  'PUBLICATION_UNKNOWN','PUBLICATION_AFTER_REGISTRATION','SCORE_UNKNOWN','THRESHOLD_NOT_MET','BASELINE_MISSING','ACHIEVEMENT_MISSING');
const evidenceBinding = {purpose, binding, policyDigest:hash, registeredAt:time, sessionId:id, nonce:id, revision, period};
export const lifecycleSchemas = {
  LifecyclePolicy:obj({...marker, policyVersion:id, sourceTrustProfile:fixed('synthetic-lifecycle-verifier.1'),
    officialBoundary:fixed('OPEN'), registrationEvent:fixed('SYNTHETIC_TERMS_ACCEPTED'), baselineRequired:{type:'boolean'},
    baselineLookbackSeconds:integer(1, 3*366*86400), baselineMaxScoreExclusive:integer(1,991),
    baselineCollectionLagSeconds:integer(0,86400), acceptanceMaxAgeSeconds:integer(1,3600),
    achievementFromOffsetSeconds:integer(0,366*86400), achievementUntilOffsetSeconds:integer(1,366*86400),
    achievementSubmitUntilOffsetSeconds:integer(1,400*86400), achievementMinScore:integer(0,990)}),
  LifecycleBinding:binding,
  LifecycleRegistration:obj({...marker,binding,policyDigest:hash,registeredAt:time,event:fixed('SYNTHETIC_TERMS_ACCEPTED')}),
  LifecycleSession:obj({...marker,...evidenceBinding,createdAt:time,acceptUntil:time}),
  LifecycleSubmission:obj({...marker,...evidenceBinding,sourceTrustProfile:fixed('synthetic-lifecycle-verifier.1'),
    sourceDigest:hash, collectedAt:time, signatureVerifiedSynthetic:{type:'boolean'}, accountBoundSynthetic:{type:'boolean'},
    coverage:one('COMPLETE_SYNTHETIC','UNKNOWN'), emptyMeaning:one('NO_RECORD_SYNTHETIC','UNKNOWN'),
    rows:{type:'array', maxItems:256, items:obj({examRef:id,examAt:time,availableAt:nullableTime,
      score:{anyOf:[integer(0,990),{type:'null'}]}})}}),
  LifecycleReceipt:obj({...marker,...evidenceBinding,sourceTrustProfile:fixed('synthetic-lifecycle-verifier.1'),
    verifierVersion:fixed('synthetic-lifecycle.1'),sourceDigest:hash,submissionDigest:hash,
    collectedAt:time,acceptedAt:time,freshAtAcceptance:fixed(true),status,reason,
    proofVerified:fixed(false),accountIdentityBound:fixed(false),fullHistoryProven:fixed(false)}),
  LifecycleEvaluation:obj({...marker,status,baselineStatus:one('MET_SYNTHETIC','NOT_MET','UNKNOWN','NOT_REQUIRED'),
    achievementStatus:status,evaluatedAt:time,productEligible:fixed(false),reason, binding,policyDigest:hash,
    baselineReceiptHash:{anyOf:[hash,{type:'null'}]},achievementReceiptHash:{anyOf:[hash,{type:'null'}]}})
};

// Consumers may inspect these definitions but cannot relax the SYNTHETIC boundary in place.
function freeze(value) {
  if (value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}
}
freeze(lifecycleSchemas);

export function validateLifecycleShape(value, schema) {
  const fail = () => {throw new Error('LIFECYCLE_SCHEMA');};
  if (schema.anyOf) {
    for (const option of schema.anyOf) {try {validateLifecycleShape(value,option);return;} catch { /* next exact variant */ }}
    fail();
  }
  if ('const' in schema && value!==schema.const) fail();
  if (schema.enum && !schema.enum.includes(value)) fail();
  if (schema.type==='object') {
    if (!value || typeof value!=='object' || Array.isArray(value)) fail();
    if (Object.keys(value).length!==schema.required.length || schema.required.some(k=>!Object.hasOwn(value,k))) fail();
    for (const [k,s] of Object.entries(schema.properties)) validateLifecycleShape(value[k],s);
  } else if (schema.type==='array') {
    if (!Array.isArray(value) || value.length>schema.maxItems) fail();
    for (const row of value) validateLifecycleShape(row,schema.items);
  } else if (schema.type==='integer') {
    if (!Number.isSafeInteger(value) || value<schema.minimum || value>schema.maximum) fail();
  } else if (schema.type==='string') {
    if (typeof value!=='string' || value.length<(schema.minLength??0) || value.length>(schema.maxLength??Infinity)
      || (schema.pattern&&!new RegExp(schema.pattern).test(value))) fail();
  } else if (schema.type==='boolean' && typeof value!=='boolean') fail();
  else if (schema.type==='null' && value!==null) fail();
}
