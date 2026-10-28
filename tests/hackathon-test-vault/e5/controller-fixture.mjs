// Explicit TEST controller, not an API/E3 adapter. No old memory-stage fixture imports.
import {ownedTestWallet} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {sha,ensure} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
export function testController(environmentId){
 const signer=ownedTestWallet(environmentId,'controller');
 const state={lineage:'1',fence:'1',current:true,committed:new Map(),revalidate:true,reads:[],beforeCurrent:null};
 const certify=payload=>({payload:structuredClone(payload),signature:signer.signingKey.sign(sha(payload)).serialized});
 return {state,certify,
  readCurrentSync({binding,observation,payload}){
   state.beforeCurrent?.(payload.phase);
   ensure(binding.lineage===state.lineage&&binding.workerFence===state.fence,'E5_TEST_CONTROLLER_FENCE');
   if(!['RECOVER','RECOVER_FINAL_SYNC','RETENTION'].includes(payload.phase)){
    if(observation.operationMethod!=='claim')ensure(state.current,'E5_TEST_E3_CURRENT');
    ensure(observation.executionBusinessHash===binding.businessHash,'E5_TEST_BUSINESS_CAS');
    ensure(state.revalidate||observation.checkpoint.hash===binding.anchor.hash,'E5_TEST_EXPLICIT_REVALIDATION_REQUIRED');
   }
   state.reads.push(payload.phase);return certify(payload);
  },
  commitCurrentSync({payload}){ensure(state.committed.get(payload.ref)===payload.manifestHash,'E5_TEST_API_COMMIT_MISSING');return certify(payload);},
  commit(result){state.committed.set(result.ref,result.manifestHash);}
 };
}
