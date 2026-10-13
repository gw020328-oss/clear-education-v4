// Experimental attestor-side policy, NOT a deployed provider or a TLS verifier.
// Input must come from the attestor's authenticated plaintext/provenance, never
// from a claimant's JSON. This module alone cannot establish that provenance.
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url));
const {parse}=require('parse5');

const ws='[ \\t\\r\\n]*';
const comment='(?:<!--[A-Za-z0-9_ ]{0,80}-->)?';
const day='(?:월|화|수|목|금|토|일)';
const date='2026\\.09\\.(?:0[1-9]|[12][0-9]|30)';
const score='(?:8[0-9][05]|9[0-8][05]|990)';
const prefix=(d,n,s)=>`<tr class="trSB" name="TOE">${ws}${comment}${ws}<td>TOEIC</td>${ws}<td>${d}\\(${day}\\)</td>${ws}<td>${n}</td>${ws}<td>Total ${s} \\(`;
export const rowPredicate=prefix(date,'[0-9]{6,10}',score);
// No wildcard accepts redaction markers inside the contiguous record prefix.
export const rowCapture=prefix(`(?<date>${date})`,'(?<number>[0-9]{6,10})',`(?<score>${score})`);
export const rowReveal=prefix('[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}','[0-9]{6,10}','[0-9]{2,3}');
export const POLICY=Object.freeze({revision:'SYNTHETIC_CONTIGUOUS_RECORD_V1',source:'https://exam.toeic.co.kr/result/scoreList.php',method:'GET',month:'2026-09',minimum:800,identity:'TOEIC/date/registration-exact-digits',live:false});
export const policyHash=createHash('sha256').update(JSON.stringify(POLICY)).update(rowPredicate).digest('hex');

export function contiguousPolicy() {
  return {url:POLICY.source,method:POLICY.method,headers:{'Accept-Encoding':'identity','User-Agent':'reclaim/0.0.1'},writeRedactionMode:'zk',
    responseMatches:[{type:'regex',value:rowPredicate},{type:'contains',value:'***'}],
    // The marker requirement makes the SDK's legacy star-removal path fail
    // closed. Modern 3.2.0 preserves length and positions of redacted bytes.
    responseRedactions:[{regex:Buffer.from(rowReveal).toString('latin1')}]};
}

export function inspectRecord(body,{transformedRanges=[]}={}) {
  if(!Buffer.isBuffer(body)||body.length===0||body.length>512*1024)throw Error('SOURCE_SIZE');
  const html=new TextDecoder('utf-8',{fatal:true}).decode(body);
  const tree=parse(html,{sourceCodeLocationInfo:true}),starts=new Set();
  function visit(node){if(node.tagName==='tr'&&node.sourceCodeLocation)starts.add(node.sourceCodeLocation.startOffset);for(const child of node.childNodes??[])visit(child);}
  visit(tree);
  const match=[...html.matchAll(new RegExp(rowCapture,'g'))].find(m=>starts.has(m.index));
  if(!match)throw Error('NO_CONTIGUOUS_QUALIFYING_RECORD');
  const start=Buffer.byteLength(html.slice(0,match.index)),end=start+Buffer.byteLength(match[0]);
  // Hash replacement bytes are NOT original text, even after a valid TLS/OPRF
  // proof. The integrating attestor must supply verified transformation ranges.
  for(const r of transformedRanges){
    if(!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.start<0||r.end<=r.start||r.end>body.length)throw Error('PROVENANCE_RANGE');
    if(r.start<end&&r.end>start)throw Error('TRANSFORMED_RECORD');
  }
  const {date,number}=match.groups;
  // Exact source digits: no integer conversion, caller salt, row index, score,
  // owner, request, timestamp or rendering whitespace belongs in the identity.
  return {identity:Buffer.from(JSON.stringify(['YBM_TOEIC_EXAM_V1',date,number])),range:{start,end}};
}

const hex=/^[0-9a-f]{64}$/;
export const OPRF_DOMAIN='CLEAR_EXAM_REUSE_V1';
export function scopedOprfInput(identity,businessScope){
  if(!hex.test(businessScope))throw Error('BUSINESS_SCOPE');
  // Native gnark domain is limited to 31 bytes. Bind all 256 scope bits in a
  // PRIVATE, fixed-length preimage instead. This prehash is never published;
  // the public nullifier remains a full keyed OPRF output, not a plain hash.
  return createHash('sha256').update('CLEAR_SCOPED_EXAM_INPUT_V1\0').update(Buffer.from(businessScope,'hex')).update(identity).digest();
}
// Only the explicitly tested threshold=1 mode. Multi-share aggregation needs
// its own audited share-set/threshold pinning and is deliberately unsupported.
export async function finaliseSingleSharePinned(operator,publicKey,request,responses){
  if(!(publicKey instanceof Uint8Array)||!publicKey.length||responses.length!==1||
    !(responses[0].publicKeyShare instanceof Uint8Array)||!Buffer.from(responses[0].publicKeyShare).equals(Buffer.from(publicKey)))throw Error('OPRF_SHARE_PIN');
  const output=await operator.finaliseOPRF(publicKey,request,responses);
  // Upstream Go encodes a field element as big.Int.Bytes(), omitting leading
  // zero bytes. Canonicalise its integer encoding; never extend a truncated
  // string from binaryHashToStr or accept a caller-provided short identifier.
  if(!(output instanceof Uint8Array)||output.length===0||output.length>32)throw Error('OPRF_NATIVE_ENCODING');
  const full=Buffer.alloc(32);full.set(output,32-output.length);return full;
}
// An optional attestor extension prototype. The caller supplies the already
// authenticated response and an operator/key pinned by deployment config.
// It returns no source fields. It must run INSIDE the attestor trust boundary.
export async function evaluateAtAttestor({body,sourceUrl,sourceMethod,transformedRanges,businessScope,configuredKey,evaluateOprf}){
  if(!hex.test(configuredKey)||typeof evaluateOprf!=='function')throw Error('PINNED_OPERATOR_REQUIRED');
  if(sourceUrl!==POLICY.source||sourceMethod!==POLICY.method||!Array.isArray(transformedRanges))throw Error('AUTHENTICATED_SOURCE_METADATA_REQUIRED');
  const record=inspectRecord(body,{transformedRanges});
  const result=await evaluateOprf(scopedOprfInput(record.identity,businessScope),OPRF_DOMAIN);
  if(result.keyFingerprint!==configuredKey)throw Error('OPRF_KEY_CHANGED');
  if(!(result.output instanceof Uint8Array)||result.output.length!==32||result.output.every(x=>x===0))throw Error('FULL_OPRF_REQUIRED');
  return {kind:'EXPERIMENTAL_ATTESTOR_FACT_V1',sourcePolicy:policyHash,businessScope,keyFingerprint:configuredKey,nullifier:Buffer.from(result.output).toString('hex'),qualified:true};
}

// Deployment-owned scope/key, separate from claimant-selected inputs. A real
// integration must obtain `authenticatedSource` from its own TLS verifier.
export function createAttestorEvaluator(configuration){
  const pinned=Object.freeze({...configuration});
  return authenticatedSource=>evaluateAtAttestor({...authenticatedSource,...pinned});
}

// Transport claims about support are not evidence. The current stock HTTP
// claim has no verified canonical-record/full-OPRF/key-binding extension.
export function assertStockClaimUsableForDirectClaim(){
  throw Error('BLOCKED_OFFICIAL_SOURCE_BOUND_NULLIFIER_EXTENSION_NOT_DEPLOYED');
}
