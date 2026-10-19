import {ensure,sha} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
export const commitment=(binding,state)=>sha({intent:binding.intentId,globalFence:state.fence,intentFence:state.intentFence});
export function testApiController(api,state){
 const expected=b=>commitment(b,state);
 return ports=>{state.ports=ports;const call=(kind,{ticket})=>{
  api.exec('BEGIN IMMEDIATE');state.inTransaction=true;
  try{const e=ports.witnesses.consume(ticket);state.before?.(e);const b=e.binding;ensure(b.workerFence===state.fence&&b.workerId===state.workerId&&b.leaseId===state.leaseId&&b.expiresAt<=state.leaseUntil&&state.now()<state.leaseUntil,'E5B_TEST_GLOBAL_LEASE');ensure(b.e3Commitment===expected(b),'E5B_TEST_INTENT_AND_GLOBAL_CAS');
   const recovery=['RECOVER','RECOVER_FINAL_SYNC','RETENTION','LOOKUP'].includes(e.phase)||b.purpose==='RECOVER';
   if(!recovery){ensure(e.proof?.kind==='REGISTERED_CANONICAL_READER'&&e.proof.runtimeHash===b.runtimeHash&&e.proof.bindingHash===sha(b)&&e.proof.commandHash===sha(e.command)&&e.proof.current.hash===e.observation.checkpoint.hash,'E5B_TEST_READER_WITNESS');if(e.command.method!=='claim')ensure(state.current,'E5B_TEST_SOURCE_WITHDRAWN');}
   if(kind==='commit'){const row=api.prepare('SELECT record FROM commits WHERE ref=?').get(e.reference.ref);ensure(row&&sha(JSON.parse(row.record))===sha(e.reference),'E5B_TEST_API_COMMIT_MISSING');}
   state.seen.push({phase:e.phase,kind,proof:e.proof.kind});const cert=ports.issuer[kind](ticket);api.exec('COMMIT');return cert;
  }catch(error){api.exec('ROLLBACK');throw error;}finally{state.inTransaction=false;}
 };return {authorizeSync:x=>call('capability',x),readCurrentSync:x=>call('current',x),commitCurrentSync:x=>call('commit',x)};};

}
