// Exact read-only C3 delta. V7 remains an immutable historical generation, not a runtime wildcard.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url));
const sha=p=>createHash('sha256').update(read(p)).digest('hex');
const check=(ok,code)=>{if(!ok)throw Error(code);};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const V8_PATH='specs/bootcamp/hackathon-test-memory-source-intake-v8.json';
export const V8_SHA='ca37fb5574a293ac6873d4d22e136fcc2f214f58a60b0a8d7f46e09dd786ed33';
export const V8_SOURCE_HEAD='cbda762ba41e94413e5aa582bc22a3a4db71ff74';
export function consumeReviewedV8Sources(v6){
 check(sha(V8_PATH)===V8_SHA,'STAGE_V8_FILE_PIN');const v8=JSON.parse(read(V8_PATH)),previous=v8.previousCompatibilityRecord;
 check(v8.version==='clear-hackathon-test-memory-source-intake.8'&&v8.currentSourceCandidateHead===V8_SOURCE_HEAD,'STAGE_V8_GENERATION');
 check(previous.path==='specs/bootcamp/hackathon-test-memory-source-intake-v7.json'&&previous.sha256==='4b82c1356b95e284d52e166928dc70823548e4ee1e1bb6785c221398c5740107'
  &&sha(previous.path)===previous.sha256&&previous.candidateHead==='b07be3c928e476a2b6f1414bc8287a63bac28a7a'&&previous.preserveOriginalBytes===true,'STAGE_V8_PREVIOUS');
 const v7=JSON.parse(read(previous.path));
 check(v7.previousCompatibilityRecord.candidateHead===v6.currentSourceCandidateHead&&v7.previousCompatibilityRecord.sha256==='247326385d1514c57383553a9f7290a3a59f9ba1182f91600443f35027d32f22'
  &&sha(v7.previousCompatibilityRecord.path)===v7.previousCompatibilityRecord.sha256,'STAGE_V8_PREVIOUS');
 check(eq(v8.normativeBoundary,v7.normativeBoundary)&&eq(v8.allowedRuntimeKinds,['FRESH_ISOLATED_MEMORY_EVM_STAGE_HARNESS'])
  &&['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'].every(k=>v8[k]===false),'STAGE_V8_SCOPE');
 const old=Object.assign({},...['e3ArtifactSha256','additionalSourceArtifactSha256','producerSeamArtifactSha256','normalEntryArtifactSha256','transitiveSourceArtifactSha256','runtimeAssetSha256'].map(k=>v7[k]));
 const changed=['src/bootcamp/http.mjs','src/bootcamp/normal-client.mjs','tools/bootcamp/frontend-server.mjs','tools/bootcamp/live-context.mjs'];
 check(eq(v8.changedFromV7,changed)&&eq(Object.keys(v8.sourceDelta).sort(),changed)&&eq(Object.keys(v8.sourceAdditions),['src/bootcamp/normal-receipt.mjs']),'STAGE_V8_DELTA');
 check(Object.keys(old).length===134&&Object.keys(v8.sourceArtifactSha256).length===135
  &&eq(Object.keys(v8.sourceArtifactSha256).sort(),[...Object.keys(old),...Object.keys(v8.sourceAdditions)].sort()),'STAGE_V8_SOURCES');
 for(const [p,before]of Object.entries(old)){
  const after=v8.sourceArtifactSha256[p],delta=v8.sourceDelta[p];check(delta?delta.before===before&&delta.after===after&&before!==after:before===after,'STAGE_V8_DELTA');
 }
 for(const [p,h]of Object.entries(v8.sourceAdditions))check(v8.sourceArtifactSha256[p]===h,'STAGE_V8_DELTA');
 for(const [p,h]of Object.entries(v8.sourceArtifactSha256))check(sha(p)===h,'STAGE_SOURCE_PIN');
 return {sources:v8.sourceArtifactSha256,currentSourceCandidateHead:v8.currentSourceCandidateHead};
}
