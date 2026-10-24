import {createRequire} from 'node:module';
import {types} from 'node:util';
import {observeClaimRpc} from '../ybm-collector/claim-rpc-observer.mjs';
import {observeSource,SOURCE_DIAGNOSTIC_SDK_CODES} from './diagnostics.mjs';
import {claimReturnDiagnostics} from './claim-return-diagnostics.mjs';
import {createClaimOnAttestor,hashProviderParams,PROVIDER_CTX,makeLogger,AttestorError,proto} from '@reclaimprotocol/attestor-core';
import {inspectWorkerTranscript} from './worker-response.mjs';
import {parametersFor,usesWorkerSource} from './recipes.mjs';
import {requestHash,validateRequest} from './request.mjs';
import {check,canonical,freeze,hash,keys,strictJson,EvidenceError} from './values.mjs';
const issued=new WeakMap();
const quiet={trace(){},debug(){},info(){},warn(){},error(){},fatal(){},child(){return this;}};
// The live RPC client belongs to the separately pinned YBM SDK instance.
// Its genuine AttestorError is not instanceof this prefix's constructor.
// Some offline API consumers install only the HR prefix. A diagnostic lookup
// cannot make that existing use fail; an unavailable type remains UNKNOWN.
let TransportAttestorError;
try{({AttestorError:TransportAttestorError}=await import(createRequire(new URL('../ybm-collector/client.mjs',import.meta.url)).resolve('@reclaimprotocol/attestor-core')));}catch{}
let boundedSendFailure=()=>null,boundedSendDetails=()=>null;
try{({boundedSendFailure,boundedSendDetails}=await import('../ybm-collector/socket.mjs'));}catch{}
const own=(value,key)=>types.isProxy(value)?undefined:Object.getOwnPropertyDescriptor(value,key)?.value;
const typedArrayLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length').get;
const sdkCode=code=>typeof code==='string'&&SOURCE_DIAGNOSTIC_SDK_CODES.includes(code)&&proto.ErrorCode[code]===SOURCE_DIAGNOSTIC_SDK_CODES.indexOf(code)+1?code:null;
function rejectionDetails(error){
 // Fixed structural categories only. Never consult names, messages or causes.
 try{
  const boundedSendCode=boundedSendFailure(error),descriptor=error!=null?Object.getOwnPropertyDescriptor(Object(error),'code'):undefined;
  const ownCodeKind=!descriptor?'ABSENT':!Object.hasOwn(descriptor,'value')?'ACCESSOR':typeof descriptor.value==='string'?'STRING':typeof descriptor.value==='number'?'NUMBER':'OTHER';
  const hr=error instanceof AttestorError,transport=typeof TransportAttestorError==='function'&&error instanceof TransportAttestorError;
  const errorKind=boundedSendCode?'OWNED_BOUNDED_SEND':hr?'HR_ATTESTOR_ERROR':transport?'TRANSPORT_ATTESTOR_ERROR':types.isNativeError(error)?error instanceof TypeError?'NATIVE_TYPE_ERROR':error instanceof RangeError?'NATIVE_RANGE_ERROR':'NATIVE_ERROR':'NON_ERROR';
  return {sdkCode:hr||transport?sdkCode(descriptor?.value):null,boundedSendCode,errorKind,ownCodeKind,transport:boundedSendDetails(error)};
 }catch{return {errorKind:'UNKNOWN',ownCodeKind:'UNKNOWN'};}
}
function returnDetails(result){
 // Observation only: no getters, error conversion, payload serialization, clone
 // or signature validation. Existing signedProof/verification retains authority.
 try{
  if(!result||typeof result!=='object'||types.isProxy(result)||Array.isArray(result))return {resultKind:'MALFORMED'};
  const error=own(result,'error');
  if(error){const code=own(error,'code');return {resultKind:'ERROR',sdkCode:Number.isInteger(code)&&code>=1&&code<=12?sdkCode(SOURCE_DIAGNOSTIC_SDK_CODES[code-1]):null};}
  if(!own(result,'claim')||typeof own(result,'claim')!=='object')return {resultKind:'MALFORMED'};
  const signatures=own(result,'signatures'),signature=signatures&&own(signatures,'claimSignature');
  if(!signature)return {resultKind:'MISSING_SIGNATURE'};
  // Intrinsic length reads no caller getter or signature bytes; shape only.
  return {resultKind:types.isUint8Array(signature)&&typedArrayLength.call(signature)===65?'SIGNED_CLAIM':'MALFORMED'};
 }catch{return {resultKind:'UNKNOWN'};}
}
const steps=Object.freeze({'connecting':'SDK_CONNECTING','sending-request-data':'SDK_SENDING_REQUEST',
 'waiting-for-response':'SDK_WAITING_RESPONSE','generating-zk-proofs':'SDK_ZK_PROGRESS_OBSERVED','waiting-for-verification':'SDK_VERIFICATION_PHASE_OBSERVED'});
const contextFor=(request,role)=>({clearSchema:'clear-hackerrank-context.1',clearRequestHash:requestHash(request),clearSourceRole:role,clearRecipeHash:request.recipeHash});
function signedProof(result){
 check(!result?.error&&result?.claim&&result.signatures?.claimSignature?.length===65,'COLLECTOR_SIGNED_CLAIM');
 const proof={claim:structuredClone(result.claim),signature:'0x'+Buffer.from(result.signatures.claimSignature).toString('hex'),attestor:result.signatures.attestorAddress};
 check(Buffer.byteLength(JSON.stringify(proof))<=65536,'COLLECTOR_PROOF_LIMIT');return proof;
}

// The only minting path owns the SDK call and its hook. There is no API for
// accepting a caller's "structure checked" flag or an unsigned observation.
// A substituted claim driver is possible only in explicit offline fixture mode.
export async function collectWorkerSource({config,request,role,params,username,client,routeClient,secretParams,ownerPrivateKey,signal,clock,createClaim,diagnostics}){
 const responseStage=role==='account'?'ACCOUNT_RESPONSE_INSPECTION':'CERTIFICATE_RESPONSE_INSPECTION';
 const proofStage=role==='account'?'ACCOUNT_PROOF_RETURN':'CERTIFICATE_PROOF_RETURN';
 const prefix=role==='account'?'ACCOUNT':'CERTIFICATE';
 let proofStarted=false,sdkActive=false,validationStarted=false,stopRpcObservation;
 const seenSteps=new Set();
 const abortState=()=>{try{return typeof signal?.aborted==='boolean'?signal.aborted:null;}catch{return null;}};
 const observe=(stage,state,error,details)=>observeSource(diagnostics,`${prefix}_${stage}`,state,error,{...details,aborted:abortState()});
 const onAbort=()=>{if(sdkActive)observe('SDK_ABORT_OBSERVED','OBSERVED');};
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
  proofStarted=true;observeSource(diagnostics,proofStage,'STARTED');
  observe('SDK_CALL','STARTED');sdkActive=true;
  stopRpcObservation=observeClaimRpc(client,(state,error,transport)=>{
   if(!sdkActive)return;
   if(state.startsWith('SEND_')){
    const sendState=state.slice(5);
    observe('SDK_RPC_SEND',sendState,undefined,{...(sendState==='FAILED'?rejectionDetails(error):{}),transport});
   }else observe('SDK_CLAIM_RPC',state,error instanceof EvidenceError?error:undefined,state==='FAILED'?rejectionDetails(error):undefined);
  });
  if(stopRpcObservation)observe('SDK_CLAIM_RPC_OBSERVER','OBSERVED');
  try{signal?.addEventListener('abort',onAbort,{once:true});}catch{}
  try{
  result=await (createClaim??createClaimOnAttestor)({name:'http',params:structuredClone(expectedParams),context:structuredClone(context),
   secretParams,ownerPrivateKey,client,zkEngine:'stwo',zkProofConcurrency:1,maxRetries:1,updateParametersFromOprfData:false,logger:quiet,
   onStep(step){
    try{const name=own(step,'name'),stage=typeof name==='string'&&Object.hasOwn(steps,name)?steps[name]:null;
     if(sdkActive&&stage&&!seenSteps.has(stage)){seenSteps.add(stage);observe(stage,'OBSERVED');}
    }catch{} // Never serialize progress objects or let diagnostics affect SDK work.
   },
   async updateProviderParams(transcript,tlsVersion){
    check(!sealed,'WORKER_HOOK_REUSED');
    try{
     observeSource(diagnostics,responseStage,'STARTED');
     check(!started&&!sealed,'WORKER_HOOK_REUSED');started=true;guard();
     fields=await inspectWorkerTranscript({transcript,tlsVersion,role,params:expectedParams,secretParams,username,
      selectedCertificateId:request.selectedCertificateId,clientVersion:client.metadata.clientVersion});
     guard();check(!sealed&&!failed,'WORKER_HOOK_REUSED');completed=true;observeSource(diagnostics,responseStage,'COMPLETED');
     // No request/extraction/context changes are permitted by this hook.
     return freeze({params:{},secretParams:{}});
    }catch(error){if(!sealed)observeSource(diagnostics,responseStage,'FAILED',error);failed=true;fields=undefined;throw new EvidenceError(error instanceof EvidenceError?error.code:'WORKER_TRANSCRIPT_REJECTED');}
   },
  });
  observe('SDK_CALL','COMPLETED');observe('SDK_RETURN','OBSERVED',undefined,{...returnDetails(result),claimReturn:claimReturnDiagnostics(result)});
  }catch(error){observe('SDK_CALL','FAILED',error instanceof EvidenceError?error:undefined,rejectionDetails(error));throw error;}
  finally{sdkActive=false;sealed=true;stopRpcObservation?.();try{signal?.removeEventListener('abort',onAbort);}catch{}}
  validationStarted=true;observe('RETURN_VALIDATION','STARTED');
  guard();sealed=true;check(started&&completed&&!failed&&fields,'WORKER_HOOK_REQUIRED');
  const proof=signedProof(result),p=strictJson(proof.claim.parameters),contextResult=strictJson(proof.claim.context);
  check(proof.claim.owner===request.expectedClaimOwner&&canonical(p)===canonical(expectedParams),'WORKER_SIGNED_CLAIM');
  keys(contextResult,['clearSchema','clearRequestHash','clearSourceRole','clearRecipeHash','providerHash','extractedParameters'],'SIGNED_CONTEXT_REQUIRED');
  for(const [key,value] of Object.entries(context))check(contextResult[key]===value,'SIGNED_REQUEST_BINDING');
  check(contextResult.providerHash===hashProviderParams(p)&&canonical(contextResult.extractedParameters)===canonical(fields),'WORKER_SIGNED_FIELDS');
  const record={role,requestHash:requestHash(request),configHash:hash('TRUST',config),proofHash:hash('WORKER_PROOF',proof),fields,mode:config.dataMode};
  const source=freeze({dispose(){record.fields=undefined;issued.delete(source);}});
  issued.set(source,record);observe('RETURN_VALIDATION','COMPLETED');validationStarted=false;observeSource(diagnostics,proofStage,'COMPLETED');
  return {proof,source};
 }catch(error){if(validationStarted)observe('RETURN_VALIDATION','FAILED',error);if(proofStarted)observeSource(diagnostics,proofStage,'FAILED',error);throw new EvidenceError(error instanceof EvidenceError?error.code:signal?.aborted?'COLLECTOR_CANCELLED':'WORKER_COLLECTION_FAILED');}
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
