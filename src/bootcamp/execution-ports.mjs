import {exactKeys,freeze,requireRule as check,decimal} from '../policy/values.mjs';
import {id,hash,epoch} from './model.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';

export const TEST_PORT_VERSION='clear-bootcamp-test-execution-port.1';
export const address=v=>{check(typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v)&&!/^0x0+$/.test(v),'BC_E5_ADDRESS');return v;};
export const uint=v=>decimal(v,'BC_E5_UINT');
export const u64=v=>decimal(v,'BC_E5_UINT',(1n<<64n)-1n);
export const sync=value=>{check(!value||typeof value.then!=='function','BC_E5_ASYNC_TRANSACTION');return value;};
const copy=value=>freeze(structuredClone(value));
export function validateObservation(value){
 exactKeys(value,['version','runtimeId','runtimePinHash','applicationId','chainApplicationId','checkpoint','ancestry','application','authorization','accounting','queue','right','operation'],'BC_E5_OBSERVATION');
 check(value.version==='clear-bootcamp-test-chain-observation.1','BC_E5_OBSERVATION_VERSION');
 id(value.runtimeId);hash(value.runtimePinHash);id(value.applicationId);hash(value.chainApplicationId);
 const c=value.checkpoint;exactKeys(c,['blockHash','parentHash','blockNumber','finality'],'BC_E5_CHECKPOINT');hash(c.blockHash);hash(c.parentHash);uint(c.blockNumber);
 exactKeys(c.finality,['kind','evidenceHash'],'BC_E5_FINALITY');
 check(['INCLUDED','LOCAL_FINALIZED'].includes(c.finality.kind),'BC_E5_FINALITY');
 if(c.finality.kind==='LOCAL_FINALIZED')hash(c.finality.evidenceHash);else check(c.finality.evidenceHash===null,'BC_E5_FINALITY');
 const ancestry=value.ancestry;exactKeys(ancestry,['fromBlockHash','relation','evidenceHash','finalizedBlockHash','finalizedRelation'],'BC_E5_ANCESTRY');
 check(['INITIAL','SAME','DESCENDANT','DIVERGED','UNPROVEN'].includes(ancestry.relation),'BC_E5_ANCESTRY');
 if(ancestry.fromBlockHash!==null)hash(ancestry.fromBlockHash);if(ancestry.evidenceHash!==null)hash(ancestry.evidenceHash);
 check(ancestry.relation==='INITIAL'?ancestry.fromBlockHash===null:ancestry.fromBlockHash!==null,'BC_E5_ANCESTRY');
 if(['SAME','DESCENDANT','DIVERGED'].includes(ancestry.relation))hash(ancestry.evidenceHash);
 check(['NONE','SAME','DESCENDANT','DIVERGED','UNPROVEN'].includes(ancestry.finalizedRelation),'BC_E5_FINALITY');
 if(ancestry.finalizedRelation==='NONE')check(ancestry.finalizedBlockHash===null,'BC_E5_FINALITY');else hash(ancestry.finalizedBlockHash);
 const a=value.application;
 exactKeys(a,['state','version','epoch','decisionId','decisionRevision','decisionHash','recipient','token','allocationId','procedureId','allocatedAt','targetRecordedAt','firstStartedAt','publishedAt',
  'revalidationCount','sourceValidUntilExclusive','currentMet','objectionBlocked','consentSetHash','preparedDigest'],'BC_E5_CHAIN_APPLICATION');
 check(['NONE','QUEUED','RESERVED','REVIEW','TERMINATED','ACCEPTED','SETTLED'].includes(a.state),'BC_E5_CHAIN_APPLICATION');
 for(const k of ['version','epoch','decisionRevision','allocatedAt','targetRecordedAt','firstStartedAt','publishedAt','sourceValidUntilExclusive'])u64(a[k]);
 for(const k of ['decisionId','decisionHash','allocationId','procedureId','consentSetHash','preparedDigest'])hash(a[k]);
 if(a.state==='NONE')check(typeof a.recipient==='string'&&/^0x[0-9a-f]{40}$/.test(a.recipient),'BC_E5_ADDRESS');else address(a.recipient);
 address(a.token);check(a.revalidationCount===0||a.revalidationCount===1,'BC_E5_REVALIDATION');
 check(typeof a.currentMet==='boolean'&&typeof a.objectionBlocked==='boolean','BC_E5_CHAIN_APPLICATION');
 const auth=value.authorization;exactKeys(auth,['signerKeyId','signerActive','nonce','nonceAvailable'],'BC_E5_AUTHORIZATION');
 hash(auth.signerKeyId);hash(auth.nonce);check(typeof auth.signerActive==='boolean'&&typeof auth.nonceAvailable==='boolean','BC_E5_AUTHORIZATION');
 const x=value.accounting;exactKeys(x,['B','R','O','A','U','S'],'BC_E5_ACCOUNTING');Object.values(x).forEach(uint);
 const [B,R,O,A,U,S]=['B','R','O','A','U','S'].map(k=>BigInt(x[k]));
 check(B>=R&&O>=R&&A===B-R&&U===O-R&&S===(U>A?U-A:0n),'BC_E5_ACCOUNTING');
 check(Array.isArray(value.queue)&&value.queue.length<=64,'BC_E5_QUEUE');let last=0n;const seen=new Set();
 for(const q of value.queue){exactKeys(q,['applicationId','acceptanceSequence'],'BC_E5_QUEUE');hash(q.applicationId);u64(q.acceptanceSequence);
  check(BigInt(q.acceptanceSequence)>last&&!seen.has(q.applicationId),'BC_E5_QUEUE_ORDER');last=BigInt(q.acceptanceSequence);seen.add(q.applicationId);}
 const r=value.right;
 if(['ACCEPTED','SETTLED'].includes(a.state)){
  exactKeys(r,['recipient','token','amountAtoms','allocationId','authorizationDigest','nonce','settledAt'],'BC_E5_RIGHT');
  check(r.recipient===a.recipient&&r.token===a.token&&r.allocationId===a.allocationId&&r.amountAtoms==='100000000','BC_E5_RIGHT');
  hash(r.authorizationDigest);hash(r.nonce);u64(r.settledAt);
  check(a.state==='SETTLED'?BigInt(r.settledAt)>0n:r.settledAt==='0','BC_E5_RIGHT');
 }else check(r===null,'BC_E5_RIGHT');
 exactKeys(value.operation,['operationId','digest'],'BC_E5_OPERATION');hash(value.operation.operationId);hash(value.operation.digest);
 return copy(value);
}
export const chainBusinessHash=o=>p0Hash('E5-CHAIN-BUSINESS',{runtimeId:o.runtimeId,runtimePinHash:o.runtimePinHash,applicationId:o.applicationId,
 chainApplicationId:o.chainApplicationId,application:o.application,authorization:o.authorization,accounting:o.accounting,queue:o.queue,right:o.right});
export function validateEnvelope(v){
 exactKeys(v,['version','envelopeRef','runtimeId','runtimePinHash','intentId','attemptId','generation','workerFence','operationId','caller','expectedVersion',
  'payloadHash','authorizationDigest','calldataHash','commandDigest','transactionHash','senderNonce','chainId','to','value','dispatchNotAfter','retainUntil','manifestHash'],'BC_E5_ENVELOPE');
 check(v.version==='clear-bootcamp-test-envelope-manifest.1','BC_E5_ENVELOPE');
 for(const k of ['envelopeRef','runtimeId','intentId','attemptId'])id(v[k]);
 for(const k of ['runtimePinHash','operationId','payloadHash','calldataHash','commandDigest','transactionHash','manifestHash'])hash(v[k]);
 if(v.authorizationDigest!==null)hash(v.authorizationDigest);address(v.caller);address(v.to);u64(v.expectedVersion);uint(v.senderNonce);uint(v.chainId);
 check(v.chainId!=='0'&&v.value==='0','BC_E5_ENVELOPE');
 for(const k of ['generation','workerFence'])check(Number.isSafeInteger(v[k])&&v[k]>=1,'BC_E5_ENVELOPE');
 epoch(v.dispatchNotAfter);epoch(v.retainUntil);check(v.retainUntil>=v.dispatchNotAfter,'BC_E5_RETENTION');
 const {manifestHash,...manifest}=v;check(manifestHash===p0Hash('E5-ENVELOPE-MANIFEST',manifest),'BC_E5_MANIFEST_HASH');return copy(v);
}
// Constructor injection is an owner boundary, not a wire flag. Tickets never
// serialize across HTTP; callers cannot submit a snapshot or verified boolean.
export function createExecutionPorts(configuration=null){
 const observations=new WeakSet(),envelopes=new WeakSet();
 if(configuration===null)return freeze({status:'UNCONFIGURED',configured:false});
 exactKeys(configuration,['version','runtimeId','runtimePinHash','authorizeService','reader','envelope'],'BC_E5_PORT_CONFIGURATION');
 check(configuration.version===TEST_PORT_VERSION&&typeof configuration.authorizeService==='function','BC_E5_PORT_CONFIGURATION');
 id(configuration.runtimeId);hash(configuration.runtimePinHash);
 check(configuration.reader===null||typeof configuration.reader.snapshot==='function','BC_E5_READER');
 check(configuration.envelope===null||typeof configuration.envelope.lookup==='function','BC_E5_ENVELOPE_SERVICE');
 const runtimeId=configuration.runtimeId,runtimePinHash=configuration.runtimePinHash,authorize=configuration.authorizeService.bind(configuration);
 const snapshot=configuration.reader?.snapshot.bind(configuration.reader),lookup=configuration.envelope?.lookup.bind(configuration.envelope);
 const pin=value=>check(value.runtimeId===runtimeId&&value.runtimePinHash===runtimePinHash,'BC_E5_RUNTIME_PIN');
 return freeze({status:'METADATA_ONLY',configured:true,runtimeId,runtimePinHash,
  authorize(context,request,time){const a=structuredClone(sync(authorize(context,copy(request))));exactKeys(a,['serviceId','runtimeId','expiresAt'],'BC_E5_SERVICE_AUTHORITY');
   id(a.serviceId);epoch(a.expiresAt);check(a.runtimeId===runtimeId&&time<a.expiresAt,'BC_E5_SERVICE_AUTHORITY');return freeze(a);},
  async read(request){check(snapshot,'BC_E5_READER_UNCONFIGURED');const value=validateObservation(await snapshot(copy(request)));pin(value);observations.add(value);return value;},
  observation(value){check(observations.has(value),'BC_E5_UNTRUSTED_OBSERVATION');return value;},
  async lookup(request){check(lookup,'BC_E5_ENVELOPE_UNCONFIGURED');const value=validateEnvelope(await lookup(copy(request)));pin(value);envelopes.add(value);return value;},
  envelope(value){check(envelopes.has(value),'BC_E5_UNTRUSTED_ENVELOPE');return value;},
 });
}
