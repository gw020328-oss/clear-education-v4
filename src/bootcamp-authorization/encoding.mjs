import {TypedDataEncoder} from 'ethers';
import {createHash} from 'node:crypto';
import {canonical,exactKeys,freeze} from '../policy/values.mjs';
import {P0_POLICY,p0PolicyHash} from '../../specs/bootcamp/p0-contract.mjs';
import {VERSION,PRIMARY_TYPE,DOMAIN_NAME,DOMAIN_VERSION,DOMAIN_FIELDS,MESSAGE_FIELDS,TYPES,GATES,OPEN_GATES} from './schema.mjs';
export class DraftError extends Error {constructor(code){super(code);this.name='DraftError';this.code=code;}}
const check=(ok,code)=>{if(!ok)throw new DraftError(code);};
const keys=(x,names,code)=>{try{exactKeys(x,names,code);}catch{throw new DraftError(code);}};
const bytes32=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x)&&x!=='0x'+'00'.repeat(32);
const address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&x!=='0x'+'00'.repeat(20);
const logical=x=>typeof x==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(x);
export function unsignedInteger(value,bits){
 check(typeof value==='string'&&/^[1-9][0-9]{0,77}$/.test(value),'UINT_DECIMAL');
 check([8,64,256].includes(bits)&&BigInt(value)<(1n<<BigInt(bits)),'UINT_RANGE');return value;
}
export function v1RevisionToUint64(value){check(Number.isSafeInteger(value)&&value>0,'V1_REVISION');return unsignedInteger(String(value),64);}
function fields(value,spec,code){
 keys(value,spec.map(x=>x.name),code);
 for(const {name,type} of spec){const x=value[name];
  if(type==='bytes32')check(bytes32(x),'BYTES32');
  else if(type==='address')check(address(x),'ADDRESS');
  else if(type.startsWith('uint'))unsignedInteger(x,Number(type.slice(4)));
  else check(typeof x==='string','STRING');
 }
}
export function validateUnsignedPayload(payload){
 keys(payload,['domain','message'],'PAYLOAD_SHAPE');
 fields(payload.domain,DOMAIN_FIELDS,'DOMAIN_SHAPE');fields(payload.message,MESSAGE_FIELDS,'MESSAGE_SHAPE');
 check(payload.domain.name===DOMAIN_NAME&&payload.domain.version===DOMAIN_VERSION,'DOMAIN_VERSION');
 const m=payload.message;
 check(m.amountAtoms==='100000000','FIXED_AMOUNT');
 check(m.eligibilityRoute==='1'||m.eligibilityRoute==='2','ROUTE');
 check(BigInt(m.issuedAt)<BigInt(m.expiresAt),'TIME_ORDER');
 check(m.recipient!==m.token&&m.recipient!==payload.domain.verifyingContract,'RECIPIENT');
 return payload;
}
// Hashing asserts shape only. No source/consent/current-state/signature/key lookup.
export function hashUnsignedPayload(input){
 let copy;try{copy=structuredClone(input);}catch{throw new DraftError('PAYLOAD_SHAPE');}
 validateUnsignedPayload(copy);
 return freeze({version:VERSION,primaryType:PRIMARY_TYPE,domainSeparator:TypedDataEncoder.hashDomain(copy.domain),
  structHash:TypedDataEncoder.hashStruct(PRIMARY_TYPE,TYPES,copy.message),digest:TypedDataEncoder.hash(copy.domain,TYPES,copy.message),
  validationScope:'UNSIGNED_STRUCTURE_AND_HASH_ONLY',signatureVerified:false,sourceVerified:false,gates:GATES});
}
const auditHash=(kind,x)=>'0x'+createHash('sha256').update('CLEAR-BOOTCAMP-UNSIGNED-'+kind+'.1\n'+canonical(x)).digest('hex');
const ID_KINDS={applicationId:'APPLICATION',decisionId:'DECISION',allocationId:'ALLOCATION'};
function validateRegistry(registrations,target,message){
 check(Array.isArray(registrations)&&registrations.length>=3&&registrations.length<=256,'REGISTRY_SIZE');
 keys(target,Object.keys(ID_KINDS),'LOGICAL_TARGET');
 const forward=new Map(),reverse=new Set();
 for(const r of registrations){
  keys(r,['kind','logicalId','opaqueId'],'REGISTRY_ROW');
  check(Object.values(ID_KINDS).includes(r.kind)&&logical(r.logicalId)&&bytes32(r.opaqueId),'REGISTRY_VALUE');
  const key=r.kind+':'+r.logicalId;
  check(!forward.has(key)&&!reverse.has(r.opaqueId),'REGISTRY_NOT_ONE_TO_ONE');forward.set(key,r.opaqueId);reverse.add(r.opaqueId);
 }
 for(const [field,kind] of Object.entries(ID_KINDS)){
  check(logical(target[field])&&forward.get(kind+':'+target[field])===message[field],'REGISTERED_TARGET');
 }
}
function validateDeadline(record,message){
 if(record===null)return false;
 const times=['eligibleAfter','authorizeUntil','claimUntil','maximumAuthorizationTtlSeconds'];
 keys(record,['version','provenance','recordId','applicationId','decisionId','decisionRevision','decisionHash','allocationId','deadlinePolicyHash',...times],'DEADLINE_SHAPE');
 check(record.version==='clear-bootcamp-unsigned-deadline-record.1'&&['SYNTHETIC_EXAMPLE','SERVER_OWNED_UNCONFIGURED'].includes(record.provenance),'DEADLINE_VERSION');
 check(bytes32(record.recordId),'DEADLINE_ID');
 for(const field of ['applicationId','decisionId','decisionRevision','decisionHash','allocationId','deadlinePolicyHash'])check(record[field]===message[field],'DEADLINE_TARGET');
 for(const field of times)unsignedInteger(record[field],64);
 check(BigInt(record.eligibleAfter)<BigInt(record.authorizeUntil)&&BigInt(record.authorizeUntil)<=BigInt(record.claimUntil),'DEADLINE_ORDER');
 check(BigInt(message.expiresAt)<=BigInt(record.authorizeUntil)&&BigInt(message.expiresAt)-BigInt(message.issuedAt)<=BigInt(record.maximumAuthorizationTtlSeconds),'DEADLINE_WINDOW');
 if(message.eligibilityRoute==='2')check(BigInt(message.issuedAt)>=BigInt(record.eligibleAfter),'ROUTE2_BEFORE_ELIGIBLE');
 return true;
}
function validateServerSnapshot(s){
 keys(s,['version','provenance','registryVersion','registrations','logicalTarget','tokenDecimals','domain','message','deadlineRecord'],'SNAPSHOT_SHAPE');
 check(s.version==='clear-bootcamp-unsigned-server-snapshot.1'&&['SYNTHETIC_EXAMPLE','SERVER_OWNED_UNCONFIGURED'].includes(s.provenance),'SNAPSHOT_VERSION');
 check(logical(s.registryVersion),'REGISTRY_VERSION');check(s.tokenDecimals==='6','TOKEN_DECIMALS');
 validateUnsignedPayload({domain:s.domain,message:s.message});
 check(s.message.policyHash===p0PolicyHash(P0_POLICY),'FROZEN_P0_POLICY');
 validateRegistry(s.registrations,s.logicalTarget,s.message);validateDeadline(s.deadlineRecord,s.message);
}
// The caller must obtain this snapshot from server-owned storage. This module
// checks internal consistency, not the caller's authority or durable registry.
export function createUnsignedDraftInspector(serverSnapshot){
 if(serverSnapshot===undefined)return freeze({inspect:()=>freeze({status:'UNCONFIGURED',code:'SERVER_SNAPSHOT_REQUIRED',gates:GATES})});
 let s;try{s=freeze(structuredClone(serverSnapshot));}catch{throw new DraftError('SNAPSHOT_SHAPE');}
 validateServerSnapshot(s);
 const snapshotHash=auditHash('SERVER_SNAPSHOT',s);
 return freeze({inspect(input){
  try{
   const p=structuredClone(input);keys(p,['logicalTarget','domain','message'],'DRAFT_SHAPE');
   validateUnsignedPayload({domain:p.domain,message:p.message});
   validateRegistry(s.registrations,p.logicalTarget,p.message);
   check(canonical(p.logicalTarget)===canonical(s.logicalTarget),'LOGICAL_TARGET_MISMATCH');
   check(canonical(p.domain)===canonical(s.domain),'DOMAIN_MISMATCH');
   check(canonical(p.message)===canonical(s.message),'TARGET_MISMATCH');
   const deadlineConsistent=validateDeadline(s.deadlineRecord,p.message);
   const blockers=[...OPEN_GATES];
   if(s.deadlineRecord===null)blockers.push(p.message.eligibilityRoute==='2'?'ROUTE2_ABSOLUTE_DEADLINE_RECORD_REQUIRED':'DEADLINE_POLICY_UNCONFIGURED');
   else blockers.push('ONCHAIN_IMMUTABLE_DEADLINE_BINDING_UNVERIFIED');
   return freeze({status:'UNSIGNED_DRAFT_BLOCKED',version:VERSION,structureValid:true,serverSnapshotConsistent:true,
    snapshotHash,registrySnapshotHash:auditHash('ID_REGISTRY',{version:s.registryVersion,rows:s.registrations}),
    deadlineRecordHash:s.deadlineRecord===null?null:auditHash('DEADLINE_RECORD',s.deadlineRecord),
    deadlineRecordConsistencyChecked:deadlineConsistent,onchainDeadlineBindingVerified:false,
    hashes:hashUnsignedPayload({domain:p.domain,message:p.message}),gates:GATES,blockers,
    currentStateVerified:false,consentVerified:false,clockFreshnessVerified:false,nonceConsumed:false,
    decisionHashSemantics:'UNCHANGED_P0_V1_BYTES32',acceptedRightCreated:false});
  }catch(e){return freeze({status:'REJECTED',code:e instanceof DraftError?e.code:'INVALID_DRAFT',gates:GATES});}
 }});
}
