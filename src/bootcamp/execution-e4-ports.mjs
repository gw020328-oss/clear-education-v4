import {createHash} from 'node:crypto';
import {Signature,recoverAddress} from 'ethers';
import {canonical,exactKeys,freeze,requireRule as check} from '../policy/values.mjs';
import {hash,id} from './model.mjs';
import {address,u64,uint,sync} from './execution-ports.mjs';

export const e4Hash=value=>'0x'+createHash('sha256').update(canonical(value)).digest('hex');
const copy=v=>freeze(structuredClone(v));
const checkpoint=c=>{exactKeys(c,['number','hash','time'],'BC_E5_E4_CHECKPOINT');u64(c.number);hash(c.hash);u64(c.time);check(BigInt(c.time)<=BigInt(Number.MAX_SAFE_INTEGER),'BC_E5_E4_CHECKPOINT');};
const bool=v=>check(typeof v==='boolean','BC_E5_E4_BOOLEAN');
export function validateE4Observation(input,runtime){
 const o=structuredClone(input);
 exactKeys(o,['version','runtimeHash','checkpoint','finality','business','businessHash'],'BC_E5_E4_OBSERVATION');
 check(o.version==='clear-e5-canonical-observation.1'&&o.runtimeHash===runtime.runtimeHash&&o.finality==='INCLUDED','BC_E5_E4_RUNTIME');checkpoint(o.checkpoint);
 const b=o.business;exactKeys(b,['applicationId','application','right','accounting','queue','nextAllocatable','paused','nonce','nonceUsed','keyRevoked'],'BC_E5_E4_BUSINESS');
 hash(b.applicationId);hash(b.nonce);hash(b.nextAllocatable);bool(b.paused);bool(b.nonceUsed);bool(b.keyRevoked);
 const a=b.application;exactKeys(a,['recipient','state','target','version','epoch','allocationId','allocatedAt','targetRecordedAt','procedureId','firstStartedAt','publishedAt','revalidationCount',
  'currentMet','validObjection','unassessedObjection','newValidError','terminalError','consentSetHash','mutualConsent','observationReceiptHash','observedAt','preparedDigest','preparedNonce','deadlinePolicyHash','terminationReason','terminationReceiptHash'],'BC_E5_E4_APPLICATION');
 check(['0','1','2','3','4','5','6'].includes(a.state)&&['0','1'].includes(a.revalidationCount)&&['0','1','2','3'].includes(a.terminationReason),'BC_E5_E4_APPLICATION');
 check(typeof a.recipient==='string'&&/^0x[0-9a-f]{40}$/.test(a.recipient),'BC_E5_ADDRESS');
 for(const k of ['version','epoch','allocatedAt','targetRecordedAt','firstStartedAt','publishedAt','observedAt'])u64(a[k]);
 for(const k of ['allocationId','procedureId','consentSetHash','observationReceiptHash','preparedDigest','preparedNonce','deadlinePolicyHash','terminationReceiptHash'])hash(a[k]);
 for(const k of ['currentMet','validObjection','unassessedObjection','newValidError','terminalError','mutualConsent'])bool(a[k]);
 exactKeys(a.target,['decisionId','revision','decisionHash','sourceValidUntilExclusive','acceptanceSequence','sourceReceiptHash'],'BC_E5_E4_TARGET');
 for(const k of ['decisionId','decisionHash','sourceReceiptHash'])hash(a.target[k]);for(const k of ['revision','sourceValidUntilExclusive','acceptanceSequence'])u64(a.target[k]);
 const r=b.right;exactKeys(r,['recipient','token','amountAtoms','allocationId','authorizationDigest','nonce','signerKeyId','authorizationEpoch','acceptedAt','settledAt'],'BC_E5_E4_RIGHT');
 for(const k of ['recipient','token'])check(typeof r[k]==='string'&&/^0x[0-9a-f]{40}$/.test(r[k]),'BC_E5_ADDRESS');
 uint(r.amountAtoms);for(const k of ['allocationId','authorizationDigest','nonce','signerKeyId'])hash(r[k]);for(const k of ['authorizationEpoch','acceptedAt','settledAt'])u64(r[k]);
 const x=b.accounting;exactKeys(x,['B','R','O','A','U','S','surplus'],'BC_E5_ACCOUNTING');Object.values(x).forEach(uint);
 const [B,R,O,A,U,S]=['B','R','O','A','U','S'].map(k=>BigInt(x[k]));check(B>=R&&O>=R&&A===B-R&&U===O-R&&S===(U>A?U-A:0n),'BC_E5_ACCOUNTING');
 check(Array.isArray(b.queue)&&b.queue.length<=64,'BC_E5_QUEUE');let previous=0n;const seen=new Set();
 for(const q of b.queue){exactKeys(q,['applicationId','sequence'],'BC_E5_QUEUE');hash(q.applicationId);u64(q.sequence);check(!seen.has(q.applicationId)&&BigInt(q.sequence)>previous,'BC_E5_QUEUE_ORDER');seen.add(q.applicationId);previous=BigInt(q.sequence);}
 check(b.nextAllocatable===(b.queue[0]?.applicationId??'0x'+'00'.repeat(32)),'BC_E5_QUEUE_ORDER');
 check(o.businessHash===e4Hash(b),'BC_E5_E4_BUSINESS_HASH');return copy(o);
}
// Constructor-only registration. The provider contains public bound read methods;
// class instances (and key/db/bytes accessors) cannot be a worker capability.
export function createE4CurrentPorts(configuration=null){
 if(configuration===null)return Object.freeze({configured:false,status:'UNCONFIGURED'});
 exactKeys(configuration,['version','sourceMode','runtime','reader','certificateIssuer','service'],'BC_E5_E4_CONFIGURATION');
 check(configuration.version==='clear-bootcamp-e4-current-connection.1'&&configuration.sourceMode==='SYNTHETIC_TEST_SOURCE','BC_E5_E4_CONFIGURATION');
 const runtime=copy(configuration.runtime);
 exactKeys(runtime,['runtimeHash','domain','tokenAddress','signerKeyId','controllerAddress','roles'],'BC_E5_E4_RUNTIME');
 hash(runtime.runtimeHash);hash(runtime.signerKeyId);address(runtime.tokenAddress);address(runtime.controllerAddress);
 exactKeys(runtime.domain,['name','version','chainId','verifyingContract','salt'],'BC_E5_E4_DOMAIN');
 check(runtime.domain.name==='ClearBootcampTestPayment'&&runtime.domain.version==='3','BC_E5_E4_DOMAIN');uint(runtime.domain.chainId);check(runtime.domain.chainId!=='0','BC_E5_E4_DOMAIN');address(runtime.domain.verifyingContract);hash(runtime.domain.salt);
 exactKeys(runtime.roles,['registrar','relayer'],'BC_E5_E4_ROLES');Object.values(runtime.roles).forEach(address);
 check(new Set([runtime.roles.registrar,runtime.roles.relayer,runtime.controllerAddress,runtime.tokenAddress,runtime.domain.verifyingContract]).size===5,'BC_E5_E4_ROLE_SEPARATION');
 exactKeys(configuration.reader,['observe','compare'],'BC_E5_E4_READER_FACADE');
 check(typeof configuration.reader.observe==='function'&&typeof configuration.reader.compare==='function','BC_E5_E4_READER_FACADE');
 const observe=configuration.reader.observe.bind(configuration.reader),compare=configuration.reader.compare.bind(configuration.reader);
 const issuer=configuration.certificateIssuer;
 if(issuer!==null){exactKeys(issuer,['certifySync'],'BC_E5_E4_ISSUER_FACADE');check(typeof issuer.certifySync==='function','BC_E5_E4_ISSUER_FACADE');}
 const provider=configuration.service;
 if(provider!==null){exactKeys(provider,['observe','seal','dispatch','recover'],'BC_E5_E4_SERVICE_FACADE');
  check(Object.values(provider).every(v=>typeof v==='function'),'BC_E5_E4_SERVICE_FACADE');}
 const seal=provider?.seal.bind(provider),certify=issuer?.certifySync.bind(issuer),tickets=new WeakMap(),sealed=new WeakMap(),proofs=new Map();
 const key=(from,to)=>e4Hash({from,to});
 function ticket(o,anchor,halt=null){const result=Object.freeze({});tickets.set(result,{observation:o,anchor,halt});return result;}
 return Object.freeze({configured:true,status:'CURRENT_ADAPTER_ONLY',runtime,sealPortConfigured:!!seal,
  async read(request,anchor=null){
   const o=validateE4Observation(await observe(copy(request)),runtime);check(o.business.applicationId===request.applicationId&&o.business.nonce===request.nonce,'BC_E5_E4_READ_TARGET');
   if(anchor){checkpoint(anchor);const proof=await compare(copy(anchor),o.checkpoint);
    if(proof?.status==='REORG_PROVEN_RECOVERY_BLOCKED'){
     exactKeys(proof,['status','oldHash','replacementHash','currentHash','commonAncestor','automaticRebase'],'BC_E5_E4_ANCESTRY');
     check(proof.oldHash===anchor.hash&&proof.currentHash===o.checkpoint.hash&&proof.replacementHash!==anchor.hash&&proof.automaticRebase===false,'BC_E5_E4_ANCESTRY');hash(proof.replacementHash);checkpoint(proof.commonAncestor);
     check(BigInt(proof.commonAncestor.number)<=BigInt(anchor.number)&&BigInt(proof.commonAncestor.number)<=BigInt(o.checkpoint.number),'BC_E5_E4_ANCESTRY');
     return ticket(o,anchor,copy(proof));
    }
    exactKeys(proof,['status','previous','current'],'BC_E5_E4_ANCESTRY');
    check(proof.status==='CANONICAL_ANCESTOR'&&proof.previous===anchor.hash&&proof.current===o.checkpoint.hash&&BigInt(o.checkpoint.number)>=BigInt(anchor.number)&&BigInt(o.checkpoint.time)>=BigInt(anchor.time),'BC_E5_E4_ANCESTRY');
    if(o.checkpoint.number===anchor.number)check(o.checkpoint.hash===anchor.hash&&o.checkpoint.time===anchor.time,'BC_E5_E4_ANCESTRY');
    // Only this captured read/compare pair can populate the synchronous witness cache.
    if(proofs.size>=128)proofs.delete(proofs.keys().next().value);proofs.set(key(anchor,o.checkpoint),o.businessHash);
   }
   return ticket(o,anchor);
  },
  consume(t){check(tickets.has(t),'BC_E5_E4_UNTRUSTED_TICKET');return tickets.get(t);},
  async seal(request){check(seal,'BC_E5_E4_SEAL_UNCONFIGURED');const value=await seal(copy(request));
   exactKeys(value,['ref','manifestHash'],'BC_E5_E4_SEALED_REFERENCE');id(value.ref);hash(value.manifestHash);
   const t=Object.freeze({});sealed.set(t,copy(value));return t;},
  sealed(t){check(sealed.has(t),'BC_E5_E4_UNTRUSTED_REFERENCE');return sealed.get(t);},
  witness(input,anchor,businessHash,method){
   exactKeys(input,['version','runtimeHash','checkpoint','finality','business','businessHash','executionBusinessHash','operationMethod'],'BC_E5_E4_WITNESS');
   const {executionBusinessHash,operationMethod,...raw}=input,o=validateE4Observation(raw,runtime);
   check(operationMethod===method&&executionBusinessHash===businessHash&&o.businessHash===businessHash,'BC_E5_E4_BUSINESS_CHANGED');
   if(o.checkpoint.hash===anchor.hash)check(canonical(o.checkpoint)===canonical(anchor),'BC_E5_E4_CHECKPOINT');
   else check(proofs.get(key(anchor,o.checkpoint))===businessHash,'BC_E5_CANONICAL_REVALIDATION_REQUIRED');
   return o;
  },
  certify(payload){check(certify,'BC_E5_CONTROLLER_ISSUER_UNCONFIGURED');
   const expected=copy(payload),result=structuredClone(sync(certify(expected)));
   exactKeys(result,['payload','signature'],'BC_E5_CONTROLLER_CERTIFICATE');check(canonical(result.payload)===canonical(expected),'BC_E5_CONTROLLER_CERTIFICATE');
   let recovered;try{recovered=recoverAddress(e4Hash(expected),Signature.from(result.signature)).toLowerCase();}catch{throw Error('BC_E5_CONTROLLER_SIGNATURE');}
   check(recovered===runtime.controllerAddress,'BC_E5_CONTROLLER_SIGNER');return copy(result);
  },
 });
}
