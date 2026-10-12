import {proofErrorDiagnostic,proofSteps} from './proof-diagnostics.mjs';
import {quiet} from './client.mjs';
import {requireValue} from './values.mjs';
import {verifyIndependently} from './independent-verifier.mjs';
export function minimalClaim(result){
  requireValue(!result.error&&result.claim&&result.signatures?.claimSignature?.length===65,'NO_SIGNED_CLAIM');
  // Never send response transcripts, request secrets or result signatures to
  // the independent verifier. It verifies the attestor's claim signature.
  return {claim:structuredClone(result.claim),signature:'0x'+Buffer.from(result.signatures.claimSignature).toString('hex'),attestor:result.signatures.attestorAddress};
}
export async function generateAndVerify({client,routeClient,diagnostic,secrets,scoreIndex,signal,onStep=()=>{},createClaim,verify=verifyIndependently}){
  const guard=()=>{signal?.throwIfAborted();requireValue(client.isOpen&&client.isInitialised,'PROOF_CLIENT_CLOSED');diagnostic.collection.assertActive();};
  const claims=[];
  try{
  requireValue(client===routeClient&&client?.isOpen&&client.isInitialised&&client.metadata,'SAME_CLIENT_REQUIRED');
    guard();
    if(!createClaim){process.env.LOG_LEVEL='silent';({createClaimOnAttestor:createClaim}=await import('@reclaimprotocol/attestor-core'));}
    for(const role of ['registration','score']){
      guard();const request=diagnostic.collection.request(role,role==='score'?scoreIndex:0);
      let secretParams=secrets.take(role),result,lastStep;
      try{
        onStep({role,stage:'GENERATING'});
        result=await diagnostic.generateClaim(createClaim,{name:'http',params:request.params,context:request.context,secretParams,client,onStep:step=>{if(proofSteps.has(step.name)&&lastStep!==step.name){lastStep=step.name;onStep({role,stage:'SDK_STEP',step:step.name});}},zkEngine:'stwo',zkProofConcurrency:1,maxRetries:1,logger:quiet});
        guard();claims.push(minimalClaim(result));onStep({role,stage:'GENERATED'});
      }finally{secretParams=undefined;result=undefined;}
    }
    guard();onStep({stage:'VERIFYING'});
    const result=await verify({...diagnostic.verificationInput(),proofs:claims},{signal});
    guard();requireValue(result?.proofVerified===true&&result.independentProcess===true&&result.paymentAllowed===false,'PROOF_VERIFICATION_FAILED');
    diagnostic.collection.finish();return result;
  }catch(error){
    onStep({stage:'FAILED',...proofErrorDiagnostic(error),...(signal?.aborted?{reason:'CANCELLED'}:{})});
    diagnostic.collection.cancel();throw new Error('PROOF_GENERATION_OR_VERIFICATION_FAILED');
  }
  finally{claims.length=0;secrets.close();}
}
