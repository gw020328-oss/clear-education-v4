import {TypedDataEncoder} from 'ethers';
import {createHash} from 'node:crypto';
import {canonical,exactKeys,freeze} from '../policy/values.mjs';
import {p0PolicyHash,P0_POLICY} from '../../specs/bootcamp/p0-contract.mjs';
import {unsignedInteger,DraftError} from './encoding.mjs';
import {VERSION,PRIMARY_TYPE,DOMAIN_NAME,DOMAIN_VERSION,DOMAIN_FIELDS,MESSAGE_FIELDS,TYPES,GATES,PROFILE_ID,PROFILE_COMMIT,PROFILE_HASH} from './test-schema-v3.mjs';
const check=(ok,code)=>{if(!ok)throw new DraftError(code);};
const keys=(x,list,code)=>{try{exactKeys(x,list,code);}catch{throw new DraftError(code);}};
const b32=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x)&&x!=='0x'+'00'.repeat(32);
const address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&x!=='0x'+'00'.repeat(20);
const logical=x=>typeof x==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(x);
const auditHash=(kind,x)=>'0x'+createHash('sha256').update('CLEAR-BOOTCAMP-TEST-UNSIGNED-'+kind+'.1\n'+canonical(x)).digest('hex');
function fields(x,spec,code){
 keys(x,spec.map(f=>f.name),code);
 for(const f of spec){const v=x[f.name];
  if(f.type==='bytes32')check(b32(v),'BYTES32');
  else if(f.type==='address')check(address(v),'ADDRESS');
  else if(f.name==='revalidationCount')check(v==='0'||v==='1','REVALIDATION_COUNT');
  else if(f.type.startsWith('uint'))unsignedInteger(v,Number(f.type.slice(4)));
  else check(typeof v==='string','STRING');
 }
}
export function validateTestUnsignedPayload(p){
 keys(p,['domain','message'],'PAYLOAD_SHAPE');fields(p.domain,DOMAIN_FIELDS,'DOMAIN_SHAPE');fields(p.message,MESSAGE_FIELDS,'MESSAGE_SHAPE');
 check(p.domain.name===DOMAIN_NAME&&p.domain.version===DOMAIN_VERSION,'DOMAIN_VERSION');const m=p.message;
 check(m.amountAtoms==='100000000','FIXED_AMOUNT');check(m.eligibilityRoute==='1'||m.eligibilityRoute==='2','ROUTE');
 check(m.recipient!==m.token&&m.recipient!==p.domain.verifyingContract,'RECIPIENT');
 const start=BigInt(m.firstReviewStartedAt),published=BigInt(m.decisionPublishedAt),issued=BigInt(m.issuedAt),expiry=BigInt(m.expiresAt),sourceEnd=BigInt(m.sourceValidUntilExclusive);
 check(start<=published&&published<=issued&&issued<expiry,'TIME_ORDER');
 check(start+600n<(1n<<64n),'REVIEW_TIME_OVERFLOW');
 check(expiry<=start+600n&&expiry<=sourceEnd,'FIRST_ACCEPT_EXPIRY_BOUND');
 if(m.eligibilityRoute==='2')check(published+120n<=issued&&published+120n<start+600n,'CONFIRMATION_WINDOW');
 return p;
}
export function hashTestUnsignedPayload(input){
 let p;try{p=structuredClone(input);}catch{throw new DraftError('PAYLOAD_SHAPE');}validateTestUnsignedPayload(p);
 return freeze({version:VERSION,primaryType:PRIMARY_TYPE,domainSeparator:TypedDataEncoder.hashDomain(p.domain),structHash:TypedDataEncoder.hashStruct(PRIMARY_TYPE,TYPES,p.message),digest:TypedDataEncoder.hash(p.domain,TYPES,p.message),validationScope:'UNSIGNED_STRUCTURE_AND_HASH_ONLY',signatureVerified:false,sourceVerified:false,gates:GATES});
}
// A new deadline record, with no accepted-right claimUntil. It is a commitment
// to this exact first-accept window, not evidence that the window is authentic.
export function testDeadlineRecord(m){
 return freeze({version:'clear-bootcamp-test-first-accept-window.3',...Object.fromEntries([
  'operationsPolicyHash','applicationId','procedureId','decisionId','decisionRevision','decisionHash',
  'allocationId','eligibilityRoute','firstReviewStartedAt','decisionPublishedAt','sourceValidUntilExclusive',
  'issuedAt','expiresAt','revalidationCount',
 ].map(k=>[k,m[k]]))});
}
export const testDeadlineHash=m=>auditHash('FIRST-ACCEPT-WINDOW',testDeadlineRecord(m));
const KIND={applicationId:'APPLICATION',decisionId:'DECISION',allocationId:'ALLOCATION',procedureId:'PROCEDURE'};
function registry(rows,target,m){
 check(Array.isArray(rows)&&rows.length>=4&&rows.length<=256,'REGISTRY_SIZE');keys(target,Object.keys(KIND),'LOGICAL_TARGET');const ids=new Map(),reverse=new Set();
 for(const r of rows){keys(r,['kind','logicalId','opaqueId'],'REGISTRY_ROW');check(Object.values(KIND).includes(r.kind)&&logical(r.logicalId)&&b32(r.opaqueId),'REGISTRY_VALUE');const k=r.kind+':'+r.logicalId;check(!ids.has(k)&&!reverse.has(r.opaqueId),'REGISTRY_NOT_ONE_TO_ONE');ids.set(k,r.opaqueId);reverse.add(r.opaqueId);}
 for(const [field,kind]of Object.entries(KIND))check(logical(target[field])&&ids.get(kind+':'+target[field])===m[field],'REGISTERED_TARGET');
}
// All source cutoffs are exclusive server-owned lease bounds. Source signatures
// and authenticity must be verified by E1/P1 before producing this snapshot.
export function sourceCutoff(source,at){
 check(typeof at==='bigint'&&at>0n&&at<(1n<<64n),'SOURCE_CLOCK');
 keys(source,['moodleObservedAt','reclaimIssuedAt','authLeaseExpiresAt','rawLeaseExpiresAt','queryLeaseExpiresAt','rawAcquiredAt','verifiedValidUntilExclusive'],'SOURCE_WINDOW_SHAPE');
 check(Array.isArray(source.moodleObservedAt)&&source.moodleObservedAt.length===3&&Array.isArray(source.reclaimIssuedAt)&&source.reclaimIssuedAt.length===2,'SOURCE_WINDOW_COUNT');
 for(const t of [...source.moodleObservedAt,...source.reclaimIssuedAt,source.authLeaseExpiresAt,source.rawLeaseExpiresAt,source.queryLeaseExpiresAt,source.rawAcquiredAt,source.verifiedValidUntilExclusive])unsignedInteger(t,64);
 const observed=[...source.moodleObservedAt,...source.reclaimIssuedAt,source.rawAcquiredAt].map(BigInt);check(observed.every(t=>t<=at),'SOURCE_FUTURE');
 // Accept cutoff uses exclusive t+ageLimit, conservatively inside the v1
 // observation-age limit. This does not modify the v1 producer's age predicate.
 const cutoffs=[...source.moodleObservedAt.map(t=>BigInt(t)+300n),...source.reclaimIssuedAt.map(t=>BigInt(t)+900n),BigInt(source.rawAcquiredAt)+1800n,
  ...['authLeaseExpiresAt','rawLeaseExpiresAt','queryLeaseExpiresAt','verifiedValidUntilExclusive'].map(k=>BigInt(source[k]))];
 check(cutoffs.every(t=>t<(1n<<64n)),'SOURCE_TIME_OVERFLOW');
 const end=cutoffs.reduce((a,b)=>a<b?a:b);check(end<(1n<<64n),'SOURCE_TIME_OVERFLOW');return end;
}
function stateShape(s){
 keys(s,['status','applicationId','procedureId','firstReviewStartedAt','decisionPublishedAt','decisionId','decisionRevision','decisionHash','runtimeMappingHash','allocationId','recipient','token','amountAtoms','authorizationEpoch','signerKeyId','signerActive','nonceAvailable','reservedBalanceAtoms','currentDecision','bothPartiesConsent','unresolvedValidObjection','unassessedSubstantiveObjection','revalidationCount','sourceWindow','domain','policyHash','operationsPolicyHash','consentSetHash','deadlinePolicyHash','nonce','currentDecisionStatus','fullAllocation','newValidError'],'STATE_SHAPE');
 check(['RESERVED','ACCEPTED','TERMINATED'].includes(s.status),'STATE_STATUS');
 for(const field of ['signerActive','nonceAvailable','currentDecision','bothPartiesConsent','unresolvedValidObjection','unassessedSubstantiveObjection','fullAllocation','newValidError'])check(typeof s[field]==='boolean','STATE_BOOLEAN');
 check(typeof s.reservedBalanceAtoms==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(s.reservedBalanceAtoms)&&BigInt(s.reservedBalanceAtoms)<(1n<<256n),'RESERVED_BALANCE');
}
export function createTestDraftInspector(serverSnapshot,{clock}={}){
 if(serverSnapshot===undefined)return freeze({inspect:()=>freeze({status:'UNCONFIGURED',code:'SERVER_SNAPSHOT_REQUIRED',gates:GATES})});
 let s;try{s=freeze(structuredClone(serverSnapshot));}catch{throw new DraftError('SNAPSHOT_SHAPE');}
 keys(s,['version','provenance','profilePin','registrations','logicalTarget','tokenDecimals','domain','message','deadlineRecord'],'SNAPSHOT_SHAPE');
 check(s.version==='clear-bootcamp-test-unsigned-snapshot.1'&&['SYNTHETIC_EXAMPLE','SERVER_OWNED_UNCONFIGURED'].includes(s.provenance),'SNAPSHOT_VERSION');
 check(clock===undefined||s.provenance==='SYNTHETIC_EXAMPLE','REAL_CLOCK_REQUIRED');
 keys(s.profilePin,['profileId','sourceCommit','profileHash'],'PROFILE_PIN');check(s.profilePin.profileId===PROFILE_ID&&s.profilePin.sourceCommit===PROFILE_COMMIT&&s.profilePin.profileHash===PROFILE_HASH,'PROFILE_PIN');
 validateTestUnsignedPayload({domain:s.domain,message:s.message});check(s.tokenDecimals==='6','TOKEN_DECIMALS');
 check(s.message.policyHash===p0PolicyHash(P0_POLICY),'FROZEN_P0_POLICY');check(s.message.operationsPolicyHash===s.profilePin.profileHash,'PROFILE_HASH');registry(s.registrations,s.logicalTarget,s.message);
 check(canonical(s.deadlineRecord)===canonical(testDeadlineRecord(s.message))&&s.message.deadlinePolicyHash===testDeadlineHash(s.message),'DEADLINE_RECORD');
 const now=()=>{const t=clock?clock():Math.floor(Date.now()/1000);check(Number.isSafeInteger(t)&&t>0,'CLOCK');return BigInt(t);};
 return freeze({inspect(input,currentServerState){
  try{
   const p=structuredClone(input),state=structuredClone(currentServerState);keys(p,['logicalTarget','domain','message'],'DRAFT_SHAPE');
   validateTestUnsignedPayload({domain:p.domain,message:p.message});registry(s.registrations,p.logicalTarget,p.message);
   check(canonical(p.logicalTarget)===canonical(s.logicalTarget)&&canonical(p.domain)===canonical(s.domain)&&canonical(p.message)===canonical(s.message),'EXACT_TARGET_MISMATCH');
   stateShape(state);const m=p.message;
   for(const k of ['applicationId','procedureId','allocationId','recipient','token','amountAtoms'])check(state[k]===m[k],'RIGHT_TARGET_MISMATCH');
   if(state.status==='ACCEPTED')return freeze({status:'NOT_APPLICABLE_ACCEPTED_RIGHT',code:'FIRST_ACCEPT_ONLY',claimExecutionVerified:false,acceptedRightPolicy:'STORED_FIXED_RIGHT_NO_NEW_SIGNATURE_KEY_OR_CLAIM_EXPIRY',gates:GATES});
   check(canonical(state.domain)===canonical(p.domain),'CURRENT_DOMAIN');
   for(const k of ['policyHash','operationsPolicyHash','consentSetHash','deadlinePolicyHash','nonce','applicationId','procedureId','firstReviewStartedAt','decisionPublishedAt','decisionId','decisionRevision','decisionHash','runtimeMappingHash','allocationId','recipient','token','amountAtoms','revalidationCount'])check(state[k]===m[k],'CURRENT_TARGET_MISMATCH');
   check(state.status==='RESERVED','TERMINATED');check(state.authorizationEpoch===m.authorizationEpoch,'APP_EPOCH');check(state.signerKeyId===m.signerKeyId&&state.signerActive,'SIGNER_STATE');
   check(state.nonceAvailable,'NONCE_UNAVAILABLE');check(BigInt(state.reservedBalanceAtoms)>=BigInt(m.amountAtoms),'RESERVED_BALANCE');
   check(state.currentDecision&&state.currentDecisionStatus==='MET'&&state.fullAllocation&&!state.newValidError&&!state.unresolvedValidObjection&&!state.unassessedSubstantiveObjection,'CURRENT_OR_OBJECTION');
   if(m.eligibilityRoute==='1')check(state.bothPartiesConsent,'CONSENT_REQUIRED');
   const at=now();check(BigInt(m.issuedAt)<=at&&at<BigInt(m.expiresAt)&&at<BigInt(m.firstReviewStartedAt)+600n,'FIRST_ACCEPT_TIME');
   if(m.eligibilityRoute==='2')check(at>=BigInt(m.decisionPublishedAt)+120n,'CONFIRMATION_WINDOW');
   const sourceEnd=sourceCutoff(state.sourceWindow,BigInt(m.issuedAt));check(BigInt(m.sourceValidUntilExclusive)===sourceEnd&&at<sourceEnd,'SOURCE_CUTOFF');
   return freeze({status:'UNSIGNED_PREFLIGHT_ONLY',version:VERSION,hashes:hashTestUnsignedPayload({domain:p.domain,message:m}),snapshotHash:auditHash('TARGET',s),stateSnapshotHash:auditHash('STATE',state),
    firstAcceptBoundsConsistent:true,sourceSignatureVerified:false,consentAuthenticityVerified:false,onchainStateVerified:false,profilePinMatchesE0:true,nonceConsumed:false,
    blockers:['E1_E3_CROSS_ACCEPTANCE_REQUIRED','E4_AUTHORITY_AND_FUNDING_RUNTIME_NOT_IMPLEMENTED'],gates:GATES});
  }catch(e){return freeze({status:'REJECTED',code:e instanceof DraftError?e.code:'INVALID_DRAFT',gates:GATES});}
 }});
}
