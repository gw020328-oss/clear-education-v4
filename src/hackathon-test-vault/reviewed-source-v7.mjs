// Explicit compatibility only. Old v6 bytes and policy/E2/TEST runtime gates remain independent.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const V7_PATH='specs/bootcamp/hackathon-test-memory-source-intake-v7.json';
export const V7_SHA='10dc1d3a050157b43a655eaa32d022855726d42bbcf4fa1ffc0bb83021c307f5';
export const V7_SOURCE_HEAD='ef5d7e000407a54b469bfab70c00fd878b17e29a';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url));
const digest=p=>createHash('sha256').update(read(p)).digest('hex');
const check=(ok,code)=>{if(!ok)throw Error(code);};
const tables=['e3ArtifactSha256','additionalSourceArtifactSha256','producerSeamArtifactSha256','normalEntryArtifactSha256'];
const changes=['src/bootcamp/http.mjs','src/bootcamp/reclaim-live-consumer.mjs','src/hackerrank-evidence/collector.mjs','tools/bootcamp/live-context.mjs','tools/bootcamp/normal-chain.mjs','tools/bootcamp/prepare-live-input.mjs'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function consumeReviewedV7Sources(v6){
 check(digest(V7_PATH)===V7_SHA,'STAGE_V7_FILE_PIN');const v7=JSON.parse(read(V7_PATH));
 check(v7.version==='clear-hackathon-test-memory-source-intake.7'&&v7.currentSourceCandidateHead===V7_SOURCE_HEAD
  &&v7.producerHead==='e658b4026b44f800b607d2d7db64e14f3fd81666','STAGE_V7_GENERATION');
 check(v7.previousCompatibilityRecord.path==='specs/bootcamp/hackathon-test-memory-source-intake-v6.json'
  &&v7.previousCompatibilityRecord.sha256==='247326385d1514c57383553a9f7290a3a59f9ba1182f91600443f35027d32f22'
  &&digest(v7.previousCompatibilityRecord.path)===v7.previousCompatibilityRecord.sha256
  &&v7.previousCompatibilityRecord.candidateHead===v6.currentSourceCandidateHead&&v7.previousCompatibilityRecord.preserveOriginalBytes===true,'STAGE_V7_PREVIOUS');
 check(same(v7.allowedRuntimeKinds,['FRESH_ISOLATED_MEMORY_EVM_STAGE_HARNESS'])
  &&['persistentRuntimeAllowedByThisIntake','fullRuntimeAccepted','existingV1GatesChanged','productionEnabled','actualSourceDemoComplete'].every(k=>v7[k]===false),'STAGE_V7_SCOPE');
 check(same(v7.normativeBoundary,v6.normativeBoundary)&&v7.operationsProfileHash===v6.operationsProfileHash&&v7.acceptedE3StageHead===v6.acceptedE3StageHead,'STAGE_V7_BOUNDARY');
 check(same(v7.changedFromV6,changes)&&same(Object.keys(v7.sourceDelta).sort(),changes),'STAGE_V7_DELTA');
 const sources={};
 for(const table of tables){
  check(same(Object.keys(v7[table]).sort(),Object.keys(v6[table]).sort()),'STAGE_V7_SOURCES');
  for(const [p,before]of Object.entries(v6[table])){
   const after=v7[table][p],delta=v7.sourceDelta[p];
   check(delta?delta.before===before&&delta.after===after&&after!==before:after===before,'STAGE_V7_DELTA');sources[p]=after;
  }
 }
 check(Object.keys(sources).length===36&&Object.keys(v7.transitiveSourceArtifactSha256).length===85&&Object.keys(v7.runtimeAssetSha256).length===13,'STAGE_V7_SOURCES');
 for(const [p,h]of [...Object.entries(sources),...Object.entries(v7.transitiveSourceArtifactSha256),...Object.entries(v7.runtimeAssetSha256)])check(digest(p)===h,'STAGE_SOURCE_PIN');
 return {sources,currentSourceCandidateHead:v7.currentSourceCandidateHead};
}
