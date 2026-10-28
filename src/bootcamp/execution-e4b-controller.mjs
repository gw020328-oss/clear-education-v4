import {types} from 'node:util';
import {canonical,exactKeys,RuleError,requireRule as check} from '../policy/values.mjs';
import {hash} from './model.mjs';
import {e4Hash} from './execution-e4-ports.mjs';
import {bridgeBusinessHash,commandNonce} from './execution-e4b-ports.mjs';

const challenge=value=>check(typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value),'BC_E5B_CHALLENGE');
const recoveryPhases=new Set(['LOOKUP','RECOVER','RECOVER_FINAL_SYNC','RETENTION']);
const executionPhases=new Set(['BEFORE_SIGN','BEFORE_NONCE_RESERVATION','BEFORE_KEY_FINAL_SYNC','BEFORE_TRANSACTION_KEY_FINAL_SYNC',
 'AFTER_SIGN','AFTER_SIGN_FINAL_SYNC','BEFORE_PRIVATE_BYTES','SEALED_FINAL_SYNC','RECOVER_DURABLE_SEAL','BEFORE_ADOPTION','ADOPTION_FINAL_SYNC','BEFORE_DISPATCH','SEND_STARTED_FINAL_SYNC']);
// This factory is internal to the store. Facts and transaction authority come
// from API records, not HTTP-provided resolvers or the worker's copied payload.
export function bridgeControllerFactory({ports,run,inspect}){
 return owner=>{
  function invoke(kind,{ticket}){
   const e=owner.consume(ticket),b=e.binding,p=e.payload;
   check(b.version==='clear-e5-execution-capability.2'&&['EXECUTE','RECOVER'].includes(b.purpose),'BC_E5B_BINDING');
   const recovery=kind==='capability'?b.purpose==='RECOVER':kind==='current'&&recoveryPhases.has(e.phase);
   if(kind==='capability')check(e.phase==='AUTHORIZE'&&canonical(p)===canonical(b)&&e.reference===null,'BC_E5B_CAPABILITY_TARGET');
   if(kind==='current'){
    check(recoveryPhases.has(e.phase)||executionPhases.has(e.phase),'BC_E5B_PHASE');
    exactKeys(p,['version','challenge','phase','bindingHash','observationHash','runtimeHash'],'BC_E5B_CURRENT_PAYLOAD');challenge(p.challenge);
    check(p.version==='clear-e5-current-witness.2'&&p.phase===e.phase&&p.observationHash===e4Hash(e.observation)&&e.reference===null,'BC_E5B_CURRENT_PAYLOAD');
   }
   if(kind==='commit'){
    exactKeys(p,['version','challenge','ref','manifestHash','adoptionId','adoptionHash','bindingHash','runtimeHash'],'BC_E5B_COMMIT_PAYLOAD');challenge(p.challenge);
    check(e.phase==='COMMIT'&&p.version==='clear-e5-api-commit.2','BC_E5B_COMMIT_PAYLOAD');
    exactKeys(e.reference,['ref','manifestHash','adoptionId','adoptionHash'],'BC_E5B_COMMIT_REFERENCE');
    for(const key of Object.keys(e.reference))check(p[key]===e.reference[key],'BC_E5B_COMMIT_REFERENCE');
   }
   check(p.runtimeHash===b.runtimeHash&&b.runtimeHash===ports.runtime.runtimeHash,'BC_E5B_RUNTIME');
   if(kind!=='capability')check(p.bindingHash===e4Hash(b),'BC_E5B_BINDING_HASH');
   if(recovery)check(e.proof.kind==='AUTHORITY_ONLY_NO_CHAIN_ASSERTION'&&Object.keys(e.proof).length===1,'BC_E5B_RECOVERY_PROOF');
   else{
    check(b.purpose==='EXECUTE','BC_E5B_EXECUTION_PURPOSE');const proof=e.proof;
    exactKeys(proof,['kind','runtimeHash','query','anchor','current','businessHash','commandHash','bindingHash','ancestry'],'BC_E5B_READER_PROOF');
    const o=ports.observation(e.observation,e.command);
    check(proof.kind==='REGISTERED_CANONICAL_READER'&&proof.runtimeHash===b.runtimeHash&&proof.bindingHash===e4Hash(b)
     &&proof.commandHash===e4Hash(e.command)&&proof.commandHash===b.commandHash&&proof.businessHash===b.businessHash&&bridgeBusinessHash(e.command,o)===b.businessHash,'BC_E5B_READER_PROOF');
    check(canonical(proof.query)===canonical({applicationId:e.command.applicationId,nonce:commandNonce(e.command)})
     &&canonical(proof.anchor)===canonical(b.anchor)&&canonical(proof.current)===canonical(o.checkpoint)
     &&canonical(proof.ancestry)===canonical({ancestor:b.anchor.hash,descendant:o.checkpoint.hash}),'BC_E5B_READER_PROOF');
    check(BigInt(o.checkpoint.number)>=BigInt(b.anchor.number)&&BigInt(o.checkpoint.time)>=BigInt(b.anchor.time),'BC_E5B_READER_PROOF');
    if(o.checkpoint.number===b.anchor.number)check(canonical(o.checkpoint)===canonical(b.anchor),'BC_E5B_READER_PROOF');
   }
   hash(b.e3Commitment);hash(b.commandHash);
   let issued;
   const recheck=()=>run(b,(state,time,authority)=>{
    const before=inspect(state,e,{kind,recovery,time,authority});
    const result=issued??(issued=owner.issue(kind,ticket,p));
    // A cached, unreturned witness never repeats issuer/key work.
    const after=inspect(state,e,{kind,recovery,time,authority});
    check(canonical(after)===canonical(before),'BC_E5B_POST_ISSUER_CHANGED');return result;
   });
   try{return recheck();}catch(error){
    const clockChanged=error&&!types.isProxy(error)&&Object.getPrototypeOf(error)===RuleError.prototype
     &&Object.getOwnPropertyDescriptor(error,'message')?.value==='BC_E5_CLOCK_CHANGED';
    const recheckable=kind==='capability'&&e.phase==='AUTHORIZE'
     ||kind==='current'&&(recoveryPhases.has(e.phase)||executionPhases.has(e.phase))
     ||kind==='commit'&&e.phase==='COMMIT';
    if(!clockChanged||!issued||!recheckable)throw error;
    // The private ticket is still active and its one certificate is unreturned.
    // Only the synchronous witness transaction rolled back, not a native
    // seal or dispatch. Revalidate original authority and exact business once;
    // keep the same witness/payload/caps and never repeat seal, dispatch or signing.
    return recheck();
   }
  }
  return Object.freeze({authorizeSync:r=>invoke('capability',r),readCurrentSync:r=>invoke('current',r),commitCurrentSync:r=>invoke('commit',r)});
 };
}
