import { TextDecoder } from 'node:util';
import { array, exactKeys, freeze, requireRule as check } from '../policy/values.mjs';
import { digest } from '../policy/mvp/contract.mjs';
import { identifier, revision, hash32, bytesDigest } from './contract.mjs';
export const SOURCE_VERSION='clear-source-snapshot.1';
export const SOURCE_LIMITS=freeze({maxBodyBytes:2097152,maxImageBytes:8388608,maxTotalBytes:16777216,maxResources:8,maxRedirects:2,
  requestTimeoutMs:10000,totalTimeoutMs:30000,retentionSeconds:2592000,scriptsExecuted:false,automaticLinkFollowing:false});
export const SOURCE_LIMITATIONS=freeze(['JS_NOT_EXECUTED','IMAGES_NOT_COLLECTED','HEURISTIC_TEXT','RESOURCE_FAILED','MANUAL_SUPPLEMENT','COMPLETENESS_UNVERIFIED','EXTRACTION_FAILED']);
export function validateSourceSnapshot(s){
  exactKeys(s,['version','sourceId','revision','sourceType','institutionId','productId','cohortId','requestedUrl','finalUrl','collectedAt','expiresAt',
    'retrievalStatus','httpStatus','resourceRequests','artifacts','textArtifactId','extractionVersion','limitations'],'SOURCE_SNAPSHOT');
  check(s.version===SOURCE_VERSION&&['PUBLIC_URL','PASTE','FILE'].includes(s.sourceType),'SOURCE_VERSION');
  for(const k of ['sourceId','institutionId','productId','cohortId','extractionVersion'])identifier(s[k]);revision(s.revision);
  check(Number.isSafeInteger(s.collectedAt)&&s.collectedAt>=0&&s.expiresAt===s.collectedAt+SOURCE_LIMITS.retentionSeconds,'SOURCE_TIME');
  for(const value of [s.requestedUrl,s.finalUrl])check(value===null||typeof value==='string'&&value.length<=2048,'SOURCE_URL');
  check(s.sourceType==='PUBLIC_URL'?s.requestedUrl!==null:s.requestedUrl===null&&s.finalUrl===null,'SOURCE_TYPE');
  check(['COLLECTED','PARTIAL','FAILED'].includes(s.retrievalStatus)&&(s.httpStatus===null||Number.isInteger(s.httpStatus)&&s.httpStatus>=100&&s.httpStatus<=599),'SOURCE_STATUS');
  array(s.resourceRequests,SOURCE_LIMITS.maxResources,'SOURCE_LIMIT');
  const urlShape=value=>{if(value===null)return;check(typeof value==='string'&&value.length<=2048,'SOURCE_URL');let u;try{u=new URL(value);}catch{check(false,'SOURCE_URL');}check(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash,'SOURCE_URL');};
  urlShape(s.requestedUrl);urlShape(s.finalUrl);
  check(new Set(s.resourceRequests.map(r=>r?.resourceId)).size===s.resourceRequests.length,'SOURCE_DUPLICATE');
  for(const r of s.resourceRequests){exactKeys(r,['resourceId','role','requestedUrl','finalUrl','httpStatus','status'],'SOURCE_RESOURCE');identifier(r.resourceId);urlShape(r.requestedUrl);urlShape(r.finalUrl);
    check(r.requestedUrl!==null&&['PAGE','IMAGE'].includes(r.role)&&['COLLECTED','FAILED'].includes(r.status)&&(r.httpStatus===null||Number.isInteger(r.httpStatus)&&r.httpStatus>=100&&r.httpStatus<=599),'SOURCE_RESOURCE');}
  check(s.sourceType==='PUBLIC_URL'?s.resourceRequests.some(r=>r.role==='PAGE'&&r.requestedUrl===s.requestedUrl):s.resourceRequests.length===0,'SOURCE_RESOURCE');
  array(s.artifacts,10,'SOURCE_LIMIT');check(new Set(s.artifacts.map(a=>a?.artifactId)).size===s.artifacts.length,'SOURCE_DUPLICATE');let total=0;
  for(const a of s.artifacts){exactKeys(a,['artifactId','role','mediaType','byteLength','sha256','locator','requestedUrl','finalUrl'],'SOURCE_ARTIFACT');identifier(a.artifactId);hash32(a.sha256);
    check(['RESPONSE_BODY','IMAGE','EXTRACTED_TEXT'].includes(a.role)&&['text/html','text/plain','image/png','image/jpeg'].includes(a.mediaType),'SOURCE_MEDIA');
    check(Number.isSafeInteger(a.byteLength)&&a.byteLength>0&&a.byteLength<=(a.role==='IMAGE'||a.mediaType.startsWith('image/')?SOURCE_LIMITS.maxImageBytes:SOURCE_LIMITS.maxBodyBytes),'SOURCE_LIMIT');
    check(typeof a.locator==='string'&&a.locator===('artifact/'+a.artifactId),'SOURCE_LOCATOR');
    for(const url of [a.requestedUrl,a.finalUrl])urlShape(url);total+=a.byteLength;
  }
  check(total<=SOURCE_LIMITS.maxTotalBytes,'SOURCE_LIMIT');array(s.limitations,8,'SOURCE_LIMIT');
  check(s.limitations.every(v=>SOURCE_LIMITATIONS.includes(v))&&new Set(s.limitations).size===s.limitations.length,'SOURCE_LIMITATIONS');
  check(s.limitations.includes('COMPLETENESS_UNVERIFIED'),'SOURCE_COMPLETENESS');
  check(s.textArtifactId===null||s.artifacts.some(a=>a?.artifactId===s.textArtifactId&&a.role==='EXTRACTED_TEXT'&&a.mediaType==='text/plain'),'SOURCE_TEXT');
  for(const r of s.resourceRequests)if(r.status==='COLLECTED')check(s.artifacts.some(a=>a.role===(r.role==='PAGE'?'RESPONSE_BODY':'IMAGE')&&a.requestedUrl===r.requestedUrl&&a.finalUrl===r.finalUrl),'SOURCE_RESOURCE_ARTIFACT');
  if(s.resourceRequests.some(r=>r.status==='FAILED'))check(s.retrievalStatus!=='COLLECTED','SOURCE_PARTIAL');
  check(s.artifacts.filter(a=>a.role==='RESPONSE_BODY').length<2,'SOURCE_RAW_BODY');
  if(s.retrievalStatus!=='FAILED')check(s.artifacts.some(a=>a.role==='RESPONSE_BODY'),'SOURCE_RAW_BODY');
  if(s.retrievalStatus==='FAILED')check(s.textArtifactId===null,'SOURCE_STATUS');return s;
}
export const sourceSnapshotHash=s=>{validateSourceSnapshot(s);return digest('CLEAR-SOURCE-SNAPSHOT.1',s);};
export function validateSourceBundle(b){
  exactKeys(b,['version','bundleId','revision','institutionId','productId','cohortId','requiredSourceIds','entries'],'SOURCE_BUNDLE');
  check(b.version==='clear-source-bundle.1','SOURCE_VERSION');for(const k of ['bundleId','institutionId','productId','cohortId'])identifier(b[k]);revision(b.revision);
  array(b.requiredSourceIds,8,'SOURCE_LIMIT');check(b.requiredSourceIds.length>0,'SOURCE_REQUIRED');b.requiredSourceIds.forEach(identifier);
  array(b.entries,8,'SOURCE_LIMIT');check(new Set(b.requiredSourceIds).size===b.requiredSourceIds.length&&new Set(b.entries.map(e=>e?.sourceId)).size===b.entries.length,'SOURCE_DUPLICATE');
  for(const e of b.entries){exactKeys(e,['sourceId','revision','snapshotHash'],'SOURCE_ENTRY');identifier(e.sourceId);revision(e.revision);hash32(e.snapshotHash);}return b;
}
export const sourceBundleHash=b=>{validateSourceBundle(b);return digest('CLEAR-SOURCE-BUNDLE.1',b);};
// lookup functions come from the private common store, never URL fetches in AI.
export async function resolveSourceBundle(bundle,{getSnapshot,getArtifact,now}){
  validateSourceBundle(bundle);const b=structuredClone(bundle),clock=now();check(Number.isSafeInteger(clock)&&clock>=0,'SOURCE_TIME');
  const sources=[],missing=b.requiredSourceIds.filter(id=>!b.entries.some(e=>e?.sourceId===id));
  for(const entry of b.entries){const snapshot=structuredClone(await getSnapshot(entry.snapshotHash));validateSourceSnapshot(snapshot);
    check(sourceSnapshotHash(snapshot)===entry.snapshotHash&&snapshot.sourceId===entry.sourceId&&snapshot.revision===entry.revision
      &&snapshot.institutionId===b.institutionId&&snapshot.productId===b.productId&&snapshot.cohortId===b.cohortId,'SOURCE_SCOPE');
    check(snapshot.collectedAt<=clock&&clock<snapshot.expiresAt,'SOURCE_EXPIRED');const blocks=[],images=[];
    for(const a of snapshot.artifacts){const value=await getArtifact(entry.snapshotHash,a.artifactId);check(value instanceof Uint8Array,'SOURCE_BYTES_CHANGED');const raw=Buffer.from(value);check(raw instanceof Uint8Array&&raw.byteLength===a.byteLength&&bytesDigest(raw)===a.sha256,'SOURCE_BYTES_CHANGED');
      if(a.role==='EXTRACTED_TEXT'){const value=new TextDecoder('utf-8',{fatal:true}).decode(raw);let line=0;
        for(const text of value.split('\n')){line++;if(text.length){check(text.length<=16000&&blocks.length<4096,'SOURCE_TEXT_LIMIT');blocks.push({sourceId:entry.sourceId,artifactId:a.artifactId,locator:a.locator+'/line/'+line,text});}}}
      if(a.role==='IMAGE'||a.role==='RESPONSE_BODY'&&a.mediaType.startsWith('image/'))images.push({sourceId:entry.sourceId,artifactId:a.artifactId,locator:a.locator,sha256:a.sha256,mediaType:a.mediaType,bytes:Buffer.from(raw)});
    }
    sources.push({snapshot:structuredClone(snapshot),blocks,images});
  }
  const finished=now();check(Number.isSafeInteger(finished)&&finished>=clock&&sources.every(s=>finished<s.snapshot.expiresAt),'SOURCE_EXPIRED');
  // Retrieved pages still have unknown official applicability/completeness.
  return {version:'clear-source-resolved.1',purpose:'POLICY_DRAFT',bundleHash:sourceBundleHash(b),bundle:freeze(b),sources,missingSourceIds:missing,
    status:missing.length||sources.some(s=>s.snapshot.retrievalStatus!=='COLLECTED'||!s.blocks.length)?'NEEDS_SUPPLEMENT':'READABLE_UNVERIFIED',
    officialAuthorityVerified:false,applicabilityVerified:false,publishable:false,paymentAllowed:false};
}
