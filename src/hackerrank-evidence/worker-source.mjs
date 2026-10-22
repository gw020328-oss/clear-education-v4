import {createClaimOnAttestor,hashProviderParams,PROVIDER_CTX,makeLogger} from '@reclaimprotocol/attestor-core';
import {inspectWorkerTranscript} from './worker-response.mjs';
import {parametersFor,usesWorkerSource} from './recipes.mjs';
import {requestHash,validateRequest} from './request.mjs';
import {check,canonical,freeze,hash,keys,strictJson,EvidenceError} from './values.mjs';
const issued=new WeakMap();
const quiet={trace(){},debug(){},info(){},warn(){},error(){},fatal(){},child(){return this;}};
const contextFor=(request,role)=>({clearSchema:'clear-hackerrank-context.1',clearRequestHash:requestHash(request),clearSourceRole:role,clearRecipeHash:request.recipeHash});
function signedProof(result){
 check(!result?.error&&result?.claim&&result.signatures?.claimSignature?.length===65,'COLLECTOR_SIGNED_CLAIM');
 const proof={claim:structuredClone(result.claim),signature:'0x'+Buffer.from(result.signatures.claimSignature).toString('hex'),attestor:result.signatures.attestorAddress};
 check(Buffer.byteLength(JSON.stringify(proof))<=65536,'COLLECTOR_PROOF_LIMIT');return proof;
}

// The only minting path owns the SDK call and its hook. There is no API for
// accepting a caller's "structure checked" flag or an unsigned observation.
// A substituted claim driver is possible only in explicit offline fixture mode.
export async function collectWorkerSource({config,request,role,params,username,client,routeClient,secretParams,ownerPrivateKey,signal,clock,createClaim}){
 let fields,result,started=false,completed=false,failed=false,sealed=false;
 const synthetic=config.dataMode==='SYNTHETIC_FIXTURE',now=()=>clock?clock():Math.floor(Date.now()/1000);
 const guard=()=>{
  check(!signal?.aborted,'COLLECTOR_CANCELLED');const at=now();validateRequest(request,config,at);
  check(at>=config.notBefore&&at<config.expiresAt,'TRUST_EXPIRED');
  check(client===routeClient&&client?.isOpen&&client.isInitialised&&client.metadata?.clientVersion===PROVIDER_CTX.version,'WORKER_PROTOCOL');
 };
 try{
  check(usesWorkerSource(config.recipe),'WORKER_RECIPE_POLICY');
  check(synthetic||process.env.CLEAR_LOCKED==='1','LOCKED_LAUNCHER_REQUIRED');
  check((synthetic&&typeof createClaim==='function')||(!synthetic&&createClaim===undefined&&clock===undefined),'COLLECTOR_TEST_DRIVER');
  guard();makeLogger(true,'silent');
  const expectedParams=freeze(parametersFor(config.recipe,role,username,request.selectedCertificateId)),context=contextFor(request,role);
  check(canonical(params)===canonical(expectedParams),'SOURCE_RECIPE');
  result=await (createClaim??createClaimOnAttestor)({name:'http',params:structuredClone(expectedParams),context:structuredClone(context),
   secretParams,ownerPrivateKey,client,zkEngine:'stwo',zkProofConcurrency:1,maxRetries:1,updateParametersFromOprfData:false,logger:quiet,
   async updateProviderParams(transcript,tlsVersion){
    try{
     check(!started&&!sealed,'WORKER_HOOK_REUSED');started=true;guard();
     fields=await inspectWorkerTranscript({transcript,tlsVersion,role,params:expectedParams,secretParams,username,
      selectedCertificateId:request.selectedCertificateId,clientVersion:client.metadata.clientVersion});
     guard();check(!sealed&&!failed,'WORKER_HOOK_REUSED');completed=true;
     // No request/extraction/context changes are permitted by this hook.
     return freeze({params:{},secretParams:{}});
    }catch(error){failed=true;fields=undefined;throw new EvidenceError(error instanceof EvidenceError?error.code:'WORKER_TRANSCRIPT_REJECTED');}
   },
  });
  guard();sealed=true;check(started&&completed&&!failed&&fields,'WORKER_HOOK_REQUIRED');
  const proof=signedProof(result),p=strictJson(proof.claim.parameters),contextResult=strictJson(proof.claim.context);
  check(proof.claim.owner===request.expectedClaimOwner&&canonical(p)===canonical(expectedParams),'WORKER_SIGNED_CLAIM');
  keys(contextResult,['clearSchema','clearRequestHash','clearSourceRole','clearRecipeHash','providerHash','extractedParameters'],'SIGNED_CONTEXT_REQUIRED');
  for(const [key,value] of Object.entries(context))check(contextResult[key]===value,'SIGNED_REQUEST_BINDING');
  check(contextResult.providerHash===hashProviderParams(p)&&canonical(contextResult.extractedParameters)===canonical(fields),'WORKER_SIGNED_FIELDS');
  const record={role,requestHash:requestHash(request),configHash:hash('TRUST',config),proofHash:hash('WORKER_PROOF',proof),fields,mode:config.dataMode};
  const source=freeze({dispose(){record.fields=undefined;issued.delete(source);}});
  issued.set(source,record);
  return {proof,source};
 }catch(error){throw new EvidenceError(error instanceof EvidenceError?error.code:signal?.aborted?'COLLECTOR_CANCELLED':'WORKER_COLLECTION_FAILED');}
 finally{sealed=true;fields=undefined;result=undefined;secretParams=undefined;ownerPrivateKey=undefined;}
}

// A valid attestor signature alone never creates worker provenance. This handle
// is kept inside one collector invocation and disposed before returning a lease.
export function readWorkerSource(source,{config,request,role,proof}){
 const record=source&&issued.get(source);
 check(record?.fields,'WORKER_SOURCE_REQUIRED');
 check(record.role===role&&record.requestHash===requestHash(request)&&record.configHash===hash('TRUST',config)
  &&record.mode===config.dataMode&&record.proofHash===hash('WORKER_PROOF',proof),'WORKER_SOURCE_BINDING');
 return record.fields;
}
