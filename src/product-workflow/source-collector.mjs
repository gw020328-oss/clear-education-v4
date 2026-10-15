import { TextDecoder } from 'node:util';
import { freeze,requireRule as check } from '../policy/values.mjs';
import { identifier,revision as checkRevision,bytesDigest } from './contract.mjs';
import { SOURCE_VERSION,SOURCE_LIMITS,validateSourceSnapshot } from './source-contract.mjs';
import { fetchPublicResource,validatePublicUrl,OFFICIAL_URLS } from './public-fetch.mjs';
function textOf(body,mediaType){const text=new TextDecoder('utf-8',{fatal:true}).decode(body);
  if(mediaType==='text/plain')return text;
  return text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'')
    .replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,'\n').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
    .split('\n').map(v=>v.trim()).filter(Boolean).join('\n');
}
const artifact=(artifactId,role,mediaType,bytes,requestedUrl=null,finalUrl=null)=>({artifactId,role,mediaType,byteLength:bytes.byteLength,sha256:bytesDigest(bytes),locator:'artifact/'+artifactId,requestedUrl,finalUrl});
export async function collectSourceSnapshot(input,{allowlist=OFFICIAL_URLS,fetchResource=fetchPublicResource,now=()=>Math.floor(Date.now()/1000),signal}={}){
  const {sourceId,revision,institutionId,productId,cohortId,url,imageUrls=[]}=input;
  for(const value of [sourceId,institutionId,productId,cohortId])identifier(value);checkRevision(revision);
  const active=AbortSignal.any([AbortSignal.timeout(SOURCE_LIMITS.totalTimeoutMs),...(signal?[signal]:[])]);
  const budget={remaining:SOURCE_LIMITS.maxTotalBytes}; // Shared by every response stream, including failed requests.
  validatePublicUrl(url,allowlist);check(Array.isArray(imageUrls)&&imageUrls.length<SOURCE_LIMITS.maxResources&&new Set(imageUrls).size===imageUrls.length,'SOURCE_LIMIT');imageUrls.forEach(u=>validatePublicUrl(u,allowlist));
  const resourceRequests=[{resourceId:'page',role:'PAGE',requestedUrl:url,finalUrl:null,httpStatus:null,status:'FAILED'},...imageUrls.map((u,i)=>({resourceId:'image-'+i,role:'IMAGE',requestedUrl:u,finalUrl:null,httpStatus:null,status:'FAILED'}))];
  const artifacts=[],blobs=new Map(),limitations=['JS_NOT_EXECUTED','COMPLETENESS_UNVERIFIED'];let finalUrl=null,httpStatus=null,textArtifactId=null,extractionVersion='no-extraction.1',retrievalStatus='FAILED',total=0;
  const add=(id,role,type,bytes,requested,final)=>{total+=bytes.byteLength;check(total<=SOURCE_LIMITS.maxTotalBytes,'SOURCE_LIMIT');const a=artifact(id,role,type,bytes,requested,final);artifacts.push(a);blobs.set(id,Buffer.from(bytes));};
  try{
    const page=await fetchResource(url,{kind:'PAGE',allowlist,signal:active,budget});finalUrl=page.finalUrl;httpStatus=page.status;Object.assign(resourceRequests[0],{finalUrl,httpStatus,status:'COLLECTED'});add('body','RESPONSE_BODY',page.mediaType,page.bytes,page.requestedUrl,page.finalUrl);retrievalStatus='PARTIAL';
    try{const text=Buffer.from(textOf(page.bytes,page.mediaType));check(text.length>0&&text.length<=SOURCE_LIMITS.maxBodyBytes,'SOURCE_TEXT_LIMIT');add('text','EXTRACTED_TEXT','text/plain',text,null,null);textArtifactId='text';extractionVersion='html-text-utf8.1';limitations.push('HEURISTIC_TEXT');}
    catch{limitations.push('EXTRACTION_FAILED');}
    if(!imageUrls.length)limitations.push('IMAGES_NOT_COLLECTED');
    for(let i=0;i<imageUrls.length;i++)try{check(budget.remaining>0,'SOURCE_SIZE');const image=await fetchResource(imageUrls[i],{kind:'IMAGE',allowlist,signal:active,budget});add('image-'+i,'IMAGE',image.mediaType,image.bytes,image.requestedUrl,image.finalUrl);Object.assign(resourceRequests[i+1],{finalUrl:image.finalUrl,httpStatus:image.status,status:'COLLECTED'});}catch(error){resourceRequests[i+1].httpStatus=Number.isInteger(error?.httpStatus)?error.httpStatus:null;if(!limitations.includes('RESOURCE_FAILED'))limitations.push('RESOURCE_FAILED');}
  }catch(error){resourceRequests[0].httpStatus=Number.isInteger(error?.httpStatus)?error.httpStatus:null;httpStatus=resourceRequests[0].httpStatus;if(!limitations.includes('RESOURCE_FAILED'))limitations.push('RESOURCE_FAILED');}
  if(active.aborted){retrievalStatus='FAILED';textArtifactId=null;for(const b of blobs.values())b.fill(0);blobs.clear();artifacts.length=0;resourceRequests.forEach(r=>{r.status='FAILED';});}
  const collectedAt=now(),snapshot={version:SOURCE_VERSION,sourceId,revision,sourceType:'PUBLIC_URL',institutionId,productId,cohortId,requestedUrl:url,finalUrl,collectedAt,expiresAt:collectedAt+SOURCE_LIMITS.retentionSeconds,
    retrievalStatus,httpStatus,resourceRequests,artifacts,textArtifactId,extractionVersion,limitations};validateSourceSnapshot(snapshot);
  return {snapshot:freeze(snapshot),blobs};
}
// Operator-provided supplement, not an official URL recapture or decoded file.
export function createSourceSupplement({sourceId,revision,institutionId,productId,cohortId,sourceType,bytes,mediaType='text/plain',collectedAt}){
  check(['PASTE','FILE'].includes(sourceType)&&bytes instanceof Uint8Array&&['text/plain','text/html','image/png','image/jpeg'].includes(mediaType),'SOURCE_SUPPLEMENT');
  check(bytes.byteLength>0&&bytes.byteLength<=(mediaType.startsWith('image/')?SOURCE_LIMITS.maxImageBytes:SOURCE_LIMITS.maxBodyBytes),'SOURCE_LIMIT');
  const body=Buffer.from(bytes),artifacts=[artifact('body','RESPONSE_BODY',mediaType,body)],blobs=new Map([['body',body]]);let textArtifactId=null;
  if(['text/plain','text/html'].includes(mediaType)){const text=Buffer.from(textOf(body,mediaType));if(text.length){artifacts.push(artifact('text','EXTRACTED_TEXT','text/plain',text));blobs.set('text',text);textArtifactId='text';}}
  const snapshot={version:SOURCE_VERSION,sourceId,revision,sourceType,institutionId,productId,cohortId,requestedUrl:null,finalUrl:null,collectedAt,expiresAt:collectedAt+SOURCE_LIMITS.retentionSeconds,
    retrievalStatus:'PARTIAL',httpStatus:null,resourceRequests:[],artifacts,textArtifactId,extractionVersion:'manual-text.1',limitations:['MANUAL_SUPPLEMENT','COMPLETENESS_UNVERIFIED']};
  validateSourceSnapshot(snapshot);return {snapshot:freeze(snapshot),blobs};
}
