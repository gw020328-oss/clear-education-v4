// Exact owned refresh only. Older intake generations remain immutable evidence.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url));
const sha=p=>createHash('sha256').update(read(p)).digest('hex');
const check=(ok,code)=>{if(!ok)throw Error(code);};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const V9_PATH='specs/bootcamp/hackathon-test-memory-source-intake-v9.json';
export const V9_SHA='19261eca5c089bf8ae68626bfdfff87b935bb7c4b0a9c783bb52709c9a2870fc';
export const V9_SOURCE_HEAD='26d451701186632ba7a37729b9937f28ce3a1f83';
export function consumeReviewedV11Sources(v6){
 check(sha(V9_PATH)===V9_SHA,'STAGE_V9_FILE_PIN');const v9=JSON.parse(read(V9_PATH)),previous=v9.previousCompatibilityRecord;
 check(v9.version==='clear-hackathon-test-memory-source-intake.9'&&v9.currentSourceCandidateHead===V9_SOURCE_HEAD,'STAGE_V9_GENERATION');
 check(previous.path==='specs/bootcamp/hackathon-test-memory-source-intake-v8.json'&&previous.sha256==='ca37fb5574a293ac6873d4d22e136fcc2f214f58a60b0a8d7f46e09dd786ed33'
  &&sha(previous.path)===previous.sha256&&previous.candidateHead==='cbda762ba41e94413e5aa582bc22a3a4db71ff74'&&previous.preserveOriginalBytes===true,'STAGE_V9_PREVIOUS');
 const v8=JSON.parse(read(previous.path));
 check(v8.previousCompatibilityRecord.path==='specs/bootcamp/hackathon-test-memory-source-intake-v7.json'
  &&sha(v8.previousCompatibilityRecord.path)==='4b82c1356b95e284d52e166928dc70823548e4ee1e1bb6785c221398c5740107','STAGE_V9_PREVIOUS');
 const v7=JSON.parse(read(v8.previousCompatibilityRecord.path));
 check(v7.previousCompatibilityRecord.candidateHead===v6.currentSourceCandidateHead&&sha(v7.previousCompatibilityRecord.path)==='247326385d1514c57383553a9f7290a3a59f9ba1182f91600443f35027d32f22','STAGE_V9_PREVIOUS');
 check(eq(v9.normativeBoundary,v6.normativeBoundary)&&eq(v9.allowedRuntimeKinds,['FRESH_ISOLATED_MEMORY_EVM_STAGE_HARNESS'])
  &&['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'].every(k=>v9[k]===false),'STAGE_V9_SCOPE');
 const old=v8.sourceArtifactSha256,changed=['src/bootcamp/http.mjs','tools/bootcamp/explicit-consents.mjs','tools/bootcamp/live-context.mjs','tools/bootcamp/normal-chain.mjs'];
 check(eq(v9.changedFromV8,changed)&&eq(Object.keys(v9.sourceDelta).sort(),changed)&&Object.keys(v9.sourceAdditions).length===0,'STAGE_V9_DELTA');
 check(Object.keys(old).length===135&&eq(Object.keys(v9.sourceArtifactSha256).sort(),Object.keys(old).sort()),'STAGE_V9_SOURCES');
 for(const [p,before]of Object.entries(old)){
  const after=v9.sourceArtifactSha256[p],delta=v9.sourceDelta[p];check(delta?delta.before===before&&delta.after===after&&before!==after:before===after,'STAGE_V9_DELTA');
 }
 check(v9.humanWait.canonicalSnapshotTtlSeconds===5&&v9.humanWait.snapshotTtlChanged===false&&v9.humanWait.originalSourceExpiryExtended===false&&v9.humanWait.originalReviewCapExtended===false,'STAGE_V9_WINDOW');

 check(sha('src/hackathon-test-vault/reviewed-source-v9.mjs')==='1373afb09529f2cccf266193126ff2e6ff2f76a1d1be785aecef22bed782ee8d','STAGE_SOURCE_PIN');
 const path='specs/bootcamp/hackathon-test-memory-source-intake-v10.json';
 check(sha(path)==='823761592e8178e682ad2f2c39dd6d95423dcbcebad9ffdd15bb2ccfb4424ba8','STAGE_V10_FILE_PIN');const v10=JSON.parse(read(path));
 check(v10.version==='clear-hackathon-test-memory-source-intake.10'&&v10.currentSourceCandidateHead==='3c086b6f755bce880031bf1be92aa7df5905ab41','STAGE_V10_GENERATION');
 check(v10.previousCompatibilityRecord.path===V9_PATH&&v10.previousCompatibilityRecord.sha256===V9_SHA&&v10.previousCompatibilityRecord.candidateHead===V9_SOURCE_HEAD&&v10.previousCompatibilityRecord.preserveOriginalBytes===true,'STAGE_V10_PREVIOUS');
 check(eq(v10.normativeBoundary,v6.normativeBoundary)&&eq(v10.allowedRuntimeKinds,v9.allowedRuntimeKinds)&&['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'].every(k=>v10[k]===false),'STAGE_V10_SCOPE');
 const currentChanges=["src/bootcamp/http.mjs", "src/bootcamp/normal-client.mjs", "tools/bootcamp/frontend-server.mjs", "tools/bootcamp/live-context.mjs"],additions=["docs/hackathon-test-vault/e5b/normal-source-pins.json", "docs/hackathon-test-vault/e5b/source-pins.json", "specs/bootcamp/hackathon-test-operations-v1.json", "specs/bootcamp/p0-addendum-r2.json", "specs/bootcamp/p0-policy.json", "specs/bootcamp/p0-runtime-mapping.json", "specs/bootcamp/reflection-example.json", "src/dev/tls.mjs", "src/product-proof/worker.mjs", "tests/ai-review-precheck/e6-free-approval-plan.json", "tests/ai-review-precheck/e6-paid-eight-approval-plan.json", "tests/ai-review-precheck/e6-paid-usage-v2-approval-plan.json", "tests/ai-review-precheck/e6-paid-wire-v3-approval-plan.json", "tests/ai-review-precheck/e6-python-corpus.json", "tests/ai-review-precheck/e6-python-gold.json", "tests/ai-review-precheck/e6-rest-wire-fixture-v3.json", "tests/ai-review-precheck/e6-usage-definition-evidence-v2.json", "tests/ai-review-precheck/e6-wire-evidence-v3.json", "tools/bootcamp/normal-host-config.mjs", "tools/bootcamp/normal-host-flow.mjs", "tools/bootcamp/normal-host-launch.mjs", "tools/bootcamp/normal-host-prepared-server.mjs", "tools/bootcamp/normal-host-worker.mjs", "tools/bootcamp/normal-host.mjs"];
 check(eq(v10.changedFromV9,currentChanges)&&eq(Object.keys(v10.sourceDelta).sort(),currentChanges)&&eq(Object.keys(v10.sourceAdditions).sort(),additions),'STAGE_V10_DELTA');
 check(Object.keys(v10.sourceArtifactSha256).length===159&&eq(Object.keys(v10.sourceArtifactSha256).sort(),[...Object.keys(v9.sourceArtifactSha256),...additions].sort()),'STAGE_V10_SOURCES');
 for(const [p,before]of Object.entries(v9.sourceArtifactSha256)){const after=v10.sourceArtifactSha256[p],delta=v10.sourceDelta[p];check(delta?delta.before===before&&delta.after===after&&before!==after:before===after,'STAGE_V10_DELTA');}
 for(const [p,h]of Object.entries(v10.sourceAdditions))check(v10.sourceArtifactSha256[p]===h,'STAGE_V10_DELTA');
 const host=v10.normalHost;check(host.configVersion==='clear-bootcamp-normal-host-config.1'&&host.sessionVersion==='clear-bootcamp-normal-session.1'&&host.explicitActivationRequired===true&&host.exactFreshAiApprovalRequired===true
  &&['prepareCreatesApplication','prepareCreatesRealm','prepareIssuesSourceLease','registryOpensBrowser','existingSourceReviewExpiryExtended','frontendOwnedTreeEdited'].every(k=>host[k]===false),'STAGE_V10_HOST_BOUNDARY');
 check(sha('src/hackathon-test-vault/reviewed-source-v10.mjs')==='084cbd6ff143206faefd65aab16eb2edcec2f1cd4d0a69c3970cffce5e590cc3','STAGE_SOURCE_PIN');
 const nextPath='specs/bootcamp/hackathon-test-memory-source-intake-v11.json';
 check(sha(nextPath)==='55c2986611b5ed0b3df69cc2e5294e3932715a847649ca5adc36f4f52146b65d','STAGE_V11_FILE_PIN');const v11=JSON.parse(read(nextPath));
 check(v11.version==='clear-hackathon-test-memory-source-intake.11'&&v11.currentSourceCandidateHead==='34d3661d558e4b07ed68e9cc26aa59eb499fe386','STAGE_V11_GENERATION');
 check(v11.previousCompatibilityRecord.path===path&&v11.previousCompatibilityRecord.sha256==='823761592e8178e682ad2f2c39dd6d95423dcbcebad9ffdd15bb2ccfb4424ba8'&&v11.previousCompatibilityRecord.candidateHead===v10.currentSourceCandidateHead&&v11.previousCompatibilityRecord.guardHead==='944afafda1543cff70cb257915ccd7d7a0fa8cf3'&&v11.previousCompatibilityRecord.preserveOriginalBytes===true,'STAGE_V11_PREVIOUS');
 check(eq(v11.normativeBoundary,v10.normativeBoundary)&&eq(v11.allowedRuntimeKinds,v10.allowedRuntimeKinds)&&eq(v11.normalHost,v10.normalHost)&&['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'].every(k=>v11[k]===false),'STAGE_V11_SCOPE');
 const leaseChange=['tools/bootcamp/live-context.mjs'];
 check(eq(v11.changedFromV10,leaseChange)&&eq(Object.keys(v11.sourceDelta),leaseChange)&&Object.keys(v11.sourceAdditions).length===0,'STAGE_V11_DELTA');
 check(Object.keys(v11.sourceArtifactSha256).length===159&&eq(Object.keys(v11.sourceArtifactSha256),Object.keys(v10.sourceArtifactSha256)),'STAGE_V11_SOURCES');
 for(const [p,before]of Object.entries(v10.sourceArtifactSha256)){const after=v11.sourceArtifactSha256[p],d=v11.sourceDelta[p];check(d?d.before===before&&d.after===after&&before!==after:before===after,'STAGE_V11_DELTA');}
 const fix=v11.sourceLeaseFix;check(['sameStoreTransactionReentryRemoved','authenticatedWalletComparedInCanonicalLowercase','currentSessionAndCsrfRequired','boundApplicationAndParticipantRequired'].every(k=>fix[k]===true)&&['sourceExpiryExtended','signaturePolicyChanged','paymentPolicyChanged'].every(k=>fix[k]===false),'STAGE_V11_LEASE_BOUNDARY');
 for(const [p,h]of Object.entries(v11.sourceArtifactSha256))check(sha(p)===h,'STAGE_SOURCE_PIN');
 return {sources:v11.sourceArtifactSha256,currentSourceCandidateHead:v11.currentSourceCandidateHead};
}
