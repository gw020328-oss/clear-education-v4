import { createHash } from 'node:crypto';
import { array, exactKeys, freeze, requireRule as check } from '../policy/values.mjs';
import { digest, same, validateContract } from '../policy/mvp/contract.mjs';

export const WORKFLOW_VERSION = 'clear-product-workflow.1';
export const LIMITS = freeze({ maxPosts:14, maxImagesPerPost:8, maxBytesPerFile:8388608, maxBundleBytes:33554432,
  maxPixels:20000000, runSeconds:300, rawRetentionSeconds:1800, acceptedMediaTypes:['image/png','image/jpeg'],
  uploadImplemented:false, realDataAllowed:false, externalTransferAllowed:false });
export const GATES = freeze({ userConsentVerified:false, sourceVerified:false, productEligible:false,
  paymentAllowed:false, grant:'HOLD', outbox:'HOLD', independentClaim:'NO_GO' });
export const REASON_CODES = freeze(['MISSING_INPUT','UNREADABLE','CONFLICT','POLICY_OPEN','SOURCE_UNVERIFIED','IMAGE_NOT_DECODED',
  'MODEL_FAILED','CANCELLED','TIMED_OUT','INTERRUPTED','STALE_CONTEXT','NEEDS_SUPPLEMENT']);
export const identifier = value => check(typeof value==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(value),'WORKFLOW_ID');
export const hash32 = value => check(typeof value==='string'&&/^0x[0-9a-f]{64}$/.test(value),'WORKFLOW_HASH');
export const revision = value => check(Number.isSafeInteger(value)&&value>=1&&value<=2147483647,'WORKFLOW_REVISION');
const text = (value,max) => check(typeof value==='string'&&value.length<=max,'WORKFLOW_TEXT');
const unique = values => check(new Set(values).size===values.length,'WORKFLOW_DUPLICATE');
export const bytesDigest = bytes => '0x'+createHash('sha256').update(bytes).digest('hex');
export const submissionHash = submission => digest('CLEAR-DOCUMENT-SUBMISSION',submission); // Existing AI inputHash, unchanged.
export const manifestHash = manifest => digest('CLEAR-DOCUMENT-BYTES.1',manifest);

function validateSubmission(s) {
  exactKeys(s,['submissionId','revision','routeRevision','posts'],'WORKFLOW_SUBMISSION');
  identifier(s.submissionId); revision(s.revision); revision(s.routeRevision); array(s.posts,LIMITS.maxPosts,'WORKFLOW_LIMIT'); unique(s.posts.map(p=>p?.postId));
  for(const p of s.posts){
    exactKeys(p,['postId','title','text','tags','links','images'],'WORKFLOW_POST');identifier(p.postId);text(p.title,240);text(p.text,32000);
    array(p.tags,32,'WORKFLOW_LIMIT');p.tags.forEach(v=>text(v,120));array(p.links,32,'WORKFLOW_LIMIT');p.links.forEach(v=>text(v,2048));
    array(p.images,LIMITS.maxImagesPerPost,'WORKFLOW_LIMIT');unique(p.images.map(i=>i?.imageId));
    for(const i of p.images){exactKeys(i,['imageId','byteLength','width','height'],'WORKFLOW_IMAGE');identifier(i.imageId);
      check(Number.isSafeInteger(i.byteLength)&&i.byteLength>0&&i.byteLength<=LIMITS.maxBytesPerFile
        &&Number.isSafeInteger(i.width)&&i.width>0&&Number.isSafeInteger(i.height)&&i.height>0&&i.width*i.height<=LIMITS.maxPixels,'WORKFLOW_LIMIT');}
  }
}
export function validateManifest(m) {
  exactKeys(m,['version','submissionHash','files'],'WORKFLOW_MANIFEST');check(m.version==='clear-document-bytes.1','WORKFLOW_VERSION');hash32(m.submissionHash);
  array(m.files,112,'WORKFLOW_LIMIT');unique(m.files.map(f=>f?.postId+'/'+f?.imageId));let total=0;
  for(const f of m.files){exactKeys(f,['postId','imageId','mediaType','byteLength','sha256','validation'],'WORKFLOW_FILE');identifier(f.postId);identifier(f.imageId);hash32(f.sha256);
    check(LIMITS.acceptedMediaTypes.includes(f.mediaType)&&Number.isSafeInteger(f.byteLength)&&f.byteLength>0&&f.byteLength<=LIMITS.maxBytesPerFile
      &&f.validation==='SIGNATURE_ONLY_NOT_DECODED','WORKFLOW_FILE');total+=f.byteLength;}
  check(total<=LIMITS.maxBundleBytes,'WORKFLOW_LIMIT');return m;
}
// In-memory trusted local input only. Signatures detect obvious type swaps, not
// malformed/decompression-bomb images, metadata stripping or decoded dimensions.
export function createDocumentManifest(submission,files) {
  validateSubmission(submission);array(files,112,'WORKFLOW_LIMIT');
  const ordered=[],expected=submission.posts.flatMap(p=>p.images.map(i=>({postId:p.postId,...i})));check(files.length===expected.length,'WORKFLOW_FILE_SET');
  unique(files.map(f=>f?.postId+'/'+f?.imageId));let total=0;
  for(const image of expected){const f=files.find(f=>f.postId===image.postId&&f.imageId===image.imageId);check(f,'WORKFLOW_FILE_SET');
    exactKeys(f,['postId','imageId','mediaType','bytes'],'WORKFLOW_FILE');check(f.bytes instanceof Uint8Array,'WORKFLOW_BYTES');
    total+=f.bytes.byteLength;check(f.bytes.byteLength===image.byteLength&&total<=LIMITS.maxBundleBytes,'WORKFLOW_LIMIT');
    const b=f.bytes,png=b.length>=24&&Buffer.from(b.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255;
    check(f.mediaType==='image/png'?png:f.mediaType==='image/jpeg'&&jpeg,'WORKFLOW_MEDIA');
    ordered.push({postId:image.postId,imageId:image.imageId,mediaType:f.mediaType,byteLength:b.byteLength,sha256:bytesDigest(b),validation:'SIGNATURE_ONLY_NOT_DECODED'});
  }
  return freeze({version:'clear-document-bytes.1',submissionHash:submissionHash(submission),files:ordered});
}
export function verifyDocumentManifest(manifest,submission,files){validateManifest(manifest);check(same(manifest,createDocumentManifest(submission,files)),'WORKFLOW_BYTES_CHANGED');return manifestHash(manifest);}

// Trusted resolver supplies one latest snapshot; never construct it from a
// browser's verified/consent/policy flags. This version is SYNTHETIC only.
export function validateSnapshot(s) {
  exactKeys(s,['version','mode','binding','workflowRevision','agreementHash','ruleId','requirementId','ruleHash','planVersion','planHash',
    'displayHash','reviewManifestHash','previewHash','sourceBundleHash','sourceBundleRevision','submissionId','submissionRevision','routeRevision','inputHash','manifest','method','fieldIds','promptVersion','modelVersion'],'WORKFLOW_SNAPSHOT');
  check(s.version===WORKFLOW_VERSION&&s.mode==='SYNTHETIC','WORKFLOW_MODE');validateContract('Binding',s.binding);revision(s.workflowRevision);
  for(const k of ['agreementHash','ruleHash','planHash','displayHash','reviewManifestHash','previewHash','sourceBundleHash','inputHash'])hash32(s[k]);
  for(const k of ['ruleId','requirementId','planVersion','submissionId','promptVersion','modelVersion'])identifier(s[k]);
  revision(s.sourceBundleRevision);revision(s.submissionRevision);revision(s.routeRevision);validateManifest(s.manifest);check(s.inputHash===s.manifest.submissionHash,'WORKFLOW_INPUT');
  check(['CODE','TEXT_AI','VISION'].includes(s.method),'WORKFLOW_METHOD');array(s.fieldIds,32,'WORKFLOW_FIELDS');s.fieldIds.forEach(identifier);unique(s.fieldIds);
  check(s.method==='CODE'?s.fieldIds.length===0:s.fieldIds.length>0,'WORKFLOW_FIELDS');return s;
}
export const snapshotHash = s => {validateSnapshot(s);return digest('CLEAR-WORKFLOW-SNAPSHOT.1',s);};
export function createRunContext(snapshot,runId,attempt){
  validateSnapshot(snapshot);identifier(runId);revision(attempt);
  return freeze({version:WORKFLOW_VERSION,purpose:'DOCUMENT_PRECHECK',snapshot:structuredClone(snapshot),snapshotHash:snapshotHash(snapshot),
    assetsHash:manifestHash(snapshot.manifest),runId,attempt});
}
export function validateRunContext(c){exactKeys(c,['version','purpose','snapshot','snapshotHash','assetsHash','runId','attempt'],'WORKFLOW_RUN');
  check(c.version===WORKFLOW_VERSION&&c.purpose==='DOCUMENT_PRECHECK'&&c.snapshotHash===snapshotHash(c.snapshot)&&c.assetsHash===manifestHash(c.snapshot.manifest),'WORKFLOW_RUN');identifier(c.runId);revision(c.attempt);return c;}
export const runContextHash = c => {validateRunContext(c);return digest('CLEAR-WORKFLOW-RUN.1',c);};
export function toPrecheckContext(c){validateRunContext(c);const s=c.snapshot;return freeze({binding:structuredClone(s.binding),requirementId:s.requirementId,ruleId:s.ruleId,
  ruleVersion:s.planVersion,submissionId:s.submissionId,submissionRevision:s.submissionRevision,routeRevision:s.routeRevision,inputHash:s.inputHash,runId:c.runId});}

// Minimal persisted summary: no extracted names/scores, quotes, raw output,
// source text, image bytes, filenames, URL, credential or provider errors.
export function validateReviewSummary(s){exactKeys(s,['version','runContextHash','resultHash','reviewStatus','outcome','reasons'],'WORKFLOW_SUMMARY');
  check(s.version===WORKFLOW_VERSION,'WORKFLOW_VERSION');hash32(s.runContextHash);hash32(s.resultHash);
  check(['CHECKED','MISSING','NEEDS_REVIEW','UNREADABLE','POLICY_OPEN'].includes(s.reviewStatus),'WORKFLOW_STATUS');
  check(s.outcome===(s.reviewStatus==='CHECKED'?'PRECHECK_REQUIREMENTS_MET':s.reviewStatus==='MISSING'?'NEEDS_SUPPLEMENT':'UNDETERMINED'),'WORKFLOW_OUTCOME');
  array(s.reasons,32,'WORKFLOW_REASONS');for(const r of s.reasons){exactKeys(r,['fieldId','code'],'WORKFLOW_REASON');if(r.fieldId!==null)identifier(r.fieldId);check(REASON_CODES.includes(r.code),'WORKFLOW_REASON');}
  check(s.reviewStatus==='CHECKED'?s.reasons.length===0:s.reasons.length>0,'WORKFLOW_REASONS');return s;}
