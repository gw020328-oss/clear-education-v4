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
export function consumeReviewedV9Sources(v6){
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
 for(const [p,h]of Object.entries(v9.sourceArtifactSha256))check(sha(p)===h,'STAGE_SOURCE_PIN');
 return {sources:v9.sourceArtifactSha256,currentSourceCandidateHead:v9.currentSourceCandidateHead};
}
