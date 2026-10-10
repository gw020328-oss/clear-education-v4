import {createHash} from 'node:crypto';
import {getBytes,keccak256,toUtf8Bytes,verifyMessage} from 'ethers';
import * as ethers from 'ethers';
import {createValidation} from '../../stage6/shared/validation.mjs';
export const {signature}=createValidation(ethers);

export const ADAPTER='native-four-test', VERSION='3';
export const RULES=Object.freeze({change:'IMMUTABLE',cancel:'NONE_BEFORE_EXPIRY',recovery:'SPONSOR_ONLY_AFTER_CLAIM_DEADLINE'});
export function need(value,code){if(!value)throw Object.assign(new Error(code),{code});}
export function canonical(value){
 function visit(v,depth=0){
  need(depth<=16,'JSON_DEPTH');
  if(v===null||typeof v==='boolean'||typeof v==='string')return v;
  if(typeof v==='number'){need(Number.isSafeInteger(v)&&!Object.is(v,-0),'INTEGER');return v;}
  if(Array.isArray(v))return v.map(x=>visit(x,depth+1));
  need(v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype,'JSON_TYPE');
  return Object.fromEntries(Object.keys(v).sort().map(k=>{need(!['__proto__','prototype','constructor'].includes(k),'JSON_KEY');return [k,visit(v[k],depth+1)];}));
 }
 const s=JSON.stringify(visit(value));need(Buffer.byteLength(s)<=65536,'JSON_SIZE');return s;
}
export const H=v=>keccak256(toUtf8Bytes(canonical(v)));
export const documentHash=text=>'0x'+createHash('sha256').update(text,'utf8').digest('hex');
export function keys(v,names){need(v&&typeof v==='object'&&!Array.isArray(v),'SCHEMA');need(Object.keys(v).sort().join('|')===[...names].sort().join('|'),'SCHEMA');}
const addr=x=>need(typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&!/^0x0{40}$/.test(x),'ADDRESS');
const hash=x=>need(typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x),'HASH');
const time=x=>need(Number.isSafeInteger(x)&&x>0,'TIME');
const eq=(a,b,code)=>need(canonical(a)===canonical(b),code);
export function sourcePacket(text,spans){
 need(typeof text==='string'&&Buffer.byteLength(text)<=65536,'SOURCE_SIZE');
 const ids=new Set();need(Array.isArray(spans)&&spans.length>0,'SOURCE_SPANS');
 for(const s of spans){keys(s,['id','start','end','text']);need(typeof s.id==='string'&&!ids.has(s.id),'SPAN_ID');ids.add(s.id);need(Number.isSafeInteger(s.start)&&Number.isSafeInteger(s.end)&&s.start>=0&&s.end>s.start&&s.end<=text.length&&text.slice(s.start,s.end)===s.text,'SPAN_TEXT');}
 return {text,spans:structuredClone(spans),sourceDocumentHash:documentHash(text),sourceSpanDigest:H(spans)};
}
export const conditionKeys=['courseId','amount','asset','activities','periods','evidenceType','issuers','approvalRole','exceptions','recipientRule','oneTime','rules'];
const reviewKeys=['type','sourceDocumentHash','sourceSpanDigest','citations','adapterId','adapterVersion','conditions','unsupportedConditions','clarificationQuestions','reviewer','reviewedAt','reviewStatus'];
const providerKeys=['type','policySpecHash','adapterId','adapterVersion','payer','amount','asset','issuers','start','due','claimUntil','chainId','vaultAddress','rules'];
const enrollmentKeys=['type','policySpecHash','recipient','enrolledAt','start','due','claimUntil','chainId','vaultAddress','receiptConditions'];
export function reviewPayload(r){keys(r,[...reviewKeys,'policySpecHash','reviewSignature']);return Object.fromEntries(reviewKeys.map(k=>[k,r[k]]));}
function signingPayload(s,type){const list=type==='ProviderCommitment'?providerKeys:enrollmentKeys;keys(s,[...list,'signature']);need(s.type===type,'OBJECT_TYPE');return Object.fromEntries(list.map(k=>[k,s[k]]));}
export const digest=(purpose,payload)=>H({purpose,payload});
export function policyHash(payload){keys(payload,reviewKeys);need(payload.type==='ReviewedPolicySpec','PROPOSAL_HAS_NO_AUTHORITY');return H(payload);}
export async function signReview(payload,wallet){const policySpecHash=policyHash(payload);return {...payload,policySpecHash,reviewSignature:await wallet.signMessage(getBytes(digest('ReviewedPolicySpec',payload)))};}
export async function signProvider(payload,wallet){keys(payload,providerKeys);need(payload.type==='ProviderCommitment','OBJECT_TYPE');return {...payload,signature:await wallet.signMessage(getBytes(digest('ProviderCommitment',payload)))};}
export async function signEnrollment(payload,wallet){keys(payload,enrollmentKeys);need(payload.type==='ParticipantEnrollment','OBJECT_TYPE');return {...payload,signature:await wallet.signMessage(getBytes(digest('ParticipantEnrollment',payload)))};}
function checkSignature(type,payload,sig,who){signature(sig);need(verifyMessage(getBytes(digest(type,payload)),sig).toLowerCase()===who,'SIGNATURE');}
export const receiptConditions=c=>Object.fromEntries(['activities','evidenceType','approvalRole','exceptions','oneTime','recipientRule','rules'].map(k=>[k,structuredClone(c[k])]));
function native(c){
 keys(c,conditionKeys);keys(c.asset,['symbol','decimals','token']);addr(c.asset.token);
 need(c.courseId==='refund-course-001'&&c.amount==='50000000'&&c.asset.symbol==='TEST'&&c.asset.decimals===6,'POLICY_NOT_COMPILABLE');
 eq(c.activities,{kind:'SIGNED_SUBMISSIONS',ids:[0,1,2,3]},'POLICY_NOT_COMPILABLE');
 keys(c.periods,['start','due','claimUntil','timeZone']);for(const k of ['start','due','claimUntil'])time(c.periods[k]);
 need(c.periods.timeZone==='UTC'&&c.periods.start<c.periods.due&&c.periods.due<c.periods.claimUntil,'POLICY_NOT_COMPILABLE');
 need(c.evidenceType==='EIP712_RECEIPT_V3'&&Array.isArray(c.issuers)&&c.issuers.length===1,'POLICY_NOT_COMPILABLE');addr(c.issuers[0]);
 need(c.approvalRole==='DESIGNATED_ISSUER_NO_NEW_PAYMENT_APPROVAL'&&c.recipientRule==='ENROLLED_FIXED_WALLET'&&c.oneTime===true,'POLICY_NOT_COMPILABLE');
 eq(c.exceptions,[],'POLICY_NOT_COMPILABLE');eq(c.rules,RULES,'POLICY_NOT_COMPILABLE');
}

// Trust configuration belongs to the local reviewed registry, never to a submitted packet.
export function createCompiler(trustInput){
 const trust=structuredClone(trustInput);keys(trust,['reviewers','payers','activePolicies','sources','chainId','token']);
 need(trust.chainId===31337,'LOCAL_CHAIN_ONLY');addr(trust.token);
 for(const a of [...trust.reviewers,...trust.payers])addr(a);
 return function compile(bundle,now){
  time(now);keys(bundle,['reviewed','provider','enrollment']);canonical(bundle);
  const {reviewed:r,provider:p,enrollment:e}=bundle,review=reviewPayload(r);
  need(review.type==='ReviewedPolicySpec','PROPOSAL_HAS_NO_AUTHORITY');hash(r.sourceDocumentHash);hash(r.sourceSpanDigest);
  need(trust.reviewers.includes(r.reviewer)&&r.reviewStatus==='APPROVED','REVIEW_NOT_AUTHORIZED');time(r.reviewedAt);
  need(r.policySpecHash===policyHash(review),'POLICY_HASH');
  checkSignature('ReviewedPolicySpec',review,r.reviewSignature,r.reviewer);
  need(trust.activePolicies[r.sourceDocumentHash]===r.policySpecHash,'STALE_OR_UNAPPROVED_POLICY');
  const stored=trust.sources[r.sourceDocumentHash];need(stored,'UNTRUSTED_SOURCE');
  const src=sourcePacket(stored.text,stored.spans);need(src.sourceDocumentHash===r.sourceDocumentHash&&src.sourceSpanDigest===r.sourceSpanDigest,'SOURCE_BINDING');
  keys(r.citations,conditionKeys);for(const ids of Object.values(r.citations))need(Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>src.spans.some(s=>s.id===id)),'CITATION_BINDING');
  need(r.adapterId===ADAPTER&&r.adapterVersion===VERSION,'POLICY_NOT_COMPILABLE');
  eq(r.unsupportedConditions,[],'POLICY_NOT_COMPILABLE');eq(r.clarificationQuestions,[],'POLICY_NOT_COMPILABLE');native(r.conditions);
  const c=r.conditions,t=c.periods;need(c.asset.token===trust.token,'TOKEN_BINDING');
  const pp=signingPayload(p,'ProviderCommitment'),ep=signingPayload(e,'ParticipantEnrollment');
  addr(p.payer);addr(p.vaultAddress);addr(e.recipient);need(trust.payers.includes(p.payer),'PAYER_NOT_AUTHORIZED');
  const expected={type:'ProviderCommitment',policySpecHash:r.policySpecHash,adapterId:r.adapterId,adapterVersion:r.adapterVersion,payer:p.payer,amount:c.amount,asset:c.asset,issuers:c.issuers,start:t.start,due:t.due,claimUntil:t.claimUntil,chainId:trust.chainId,vaultAddress:p.vaultAddress,rules:c.rules};
  eq(pp,expected,'PROVIDER_BINDING');checkSignature('ProviderCommitment',pp,p.signature,p.payer);
  time(e.enrolledAt);need(r.reviewedAt<=e.enrolledAt&&e.enrolledAt<=now&&e.enrolledAt<=t.due&&now<=t.claimUntil,'DEADLINE');
  eq(ep,{type:'ParticipantEnrollment',policySpecHash:r.policySpecHash,recipient:e.recipient,enrolledAt:e.enrolledAt,start:t.start,due:t.due,claimUntil:t.claimUntil,chainId:trust.chainId,vaultAddress:p.vaultAddress,receiptConditions:receiptConditions(c)},'ENROLLMENT_BINDING');
  checkSignature('ParticipantEnrollment',ep,e.signature,e.recipient);
  const nativeTerms={courseId:c.courseId,amount:c.amount,token:c.asset.token,tokenDecimals:c.asset.decimals,tokenSymbol:c.asset.symbol,issuer:c.issuers[0],sponsor:p.payer,start:t.start,due:t.due,claimUntil:t.claimUntil,chainId:trust.chainId,vaultAddress:p.vaultAddress,recipient:e.recipient,enrolledAt:e.enrolledAt,submissionIds:[0,1,2,3]};
  const commitment={type:'BoundTerms/3',policySpecHash:r.policySpecHash,reviewDigest:digest('ReviewedPolicySpec',review),providerDigest:digest('ProviderCommitment',pp),enrollmentDigest:digest('ParticipantEnrollment',ep),nativeTerms};
  return {type:'RuntimePlan',contractVersion:3,compilable:true,termsHash:H(commitment),commitment,nativeTerms,readiness:'NOT_OBSERVED',requires:['verified deployment','onchain consent and full reserve','four valid issuer receipts']};
 };
}
