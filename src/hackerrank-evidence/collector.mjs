// Trusted in-process host entry. Never accepts a key, cookie, recipe or expected
// request from the browser body; the managed host supplies the narrow ports.
import {Wallet} from 'ethers';
import {assertValidClaimSignatures,getIdentifierFromClaimInfo,hashProviderParams} from '@reclaimprotocol/attestor-core';
import {createHackerRankVerifier} from './verifier.mjs';
import {verifyParticipant,validateRequest,requestHash} from './request.mjs';
import {parametersFor} from './recipes.mjs';
import {canonical,freeze,check,keys,strictJson,isSourceId,EvidenceError} from './values.mjs';
const quiet={trace(){},debug(){},info(){},warn(){},error(){},fatal(){},child(){return this;}};
const leases=new WeakMap();
const contextFor=(request,role)=>({clearSchema:'clear-hackerrank-context.1',clearRequestHash:requestHash(request),clearSourceRole:role,clearRecipeHash:request.recipeHash});
function candidateLease(verifier,candidate,expectedRequest){
 let receipt=candidate,request=expectedRequest;
 const recheck=()=>{check(receipt&&request,'COLLECTOR_LEASE_CLOSED');return verifier.recheck(receipt,request);};
 const lease=freeze({
  read(){recheck();return receipt;},recheck,
  isCurrent(){try{recheck();return true;}catch{return false;}},
  dispose(){receipt=null;request=null;},
 });
 leases.set(lease,()=>{const binding=recheck();return freeze({candidate:receipt,binding});});return lease;
}
// API consumers import this function from this exact module. Never duck-type a
// browser-supplied object or call its arbitrary read/recheck methods as authority.
export function readHackerRankCollectorLease(lease){
 check(lease&&typeof lease==='object'&&leases.has(lease),'UNTRUSTED_COLLECTOR_LEASE');return leases.get(lease)();
}
function minimal(result){
 check(!result?.error&&result?.claim&&result.signatures?.claimSignature?.length===65,'COLLECTOR_SIGNED_CLAIM');
 const proof={claim:structuredClone(result.claim),signature:'0x'+Buffer.from(result.signatures.claimSignature).toString('hex'),attestor:result.signatures.attestorAddress};
 check(Buffer.byteLength(JSON.stringify(proof))<=65536,'COLLECTOR_PROOF_LIMIT');return proof;
}
// Authenticate the first claim before its private username can select the
// certificate URL. The complete pair is independently checked again by P1.
async function accountUsername(proof,config,request,now){
 const c=proof.claim;keys(c,['provider','parameters','owner','timestampS','context','identifier','epoch'],'CLAIM_SHAPE');
 check(config.signers.includes(proof.attestor)&&config.epochs.includes(c.epoch),'UNTRUSTED_SIGNER');
 check(c.provider==='http'&&c.owner===request.expectedClaimOwner,'CLAIM_OWNER_OR_PROVIDER');
 check(Number.isSafeInteger(c.timestampS)&&c.timestampS>=request.issuedAt&&c.timestampS>=config.notBefore&&c.timestampS<=now&&now-c.timestampS<=900&&c.timestampS<request.expiresAt,'PROOF_TIME');
 const params=strictJson(c.parameters),ctx=strictJson(c.context);
 check(canonical(params)===canonical(parametersFor(config.recipe,'account')),'SOURCE_RECIPE');
 check(getIdentifierFromClaimInfo({...c})===c.identifier,'CLAIM_IDENTIFIER');
 try{await assertValidClaimSignatures({claim:c,signatures:{attestorAddress:proof.attestor,claimSignature:Buffer.from(proof.signature.slice(2),'hex')}});}catch{throw new EvidenceError('CLAIM_SIGNATURE');}
 keys(ctx,['clearSchema','clearRequestHash','clearSourceRole','clearRecipeHash','providerHash','extractedParameters'],'SIGNED_CONTEXT_REQUIRED');
 for(const [key,value]of Object.entries(contextFor(request,'account')))check(ctx[key]===value,'SIGNED_REQUEST_BINDING');
 check(ctx.providerHash===hashProviderParams(params),'PROVIDER_HASH');keys(ctx.extractedParameters,['username'],'EXTRACTED_FIELDS');
 check(isSourceId(ctx.extractedParameters.username),'SOURCE_USERNAME');return ctx.extractedParameters.username;
}
export function createHackerRankCollector({trustConfig,commitmentKey,clock}={}){
 // Pending trust cannot create an owner, read cookies, open a connection or
 // manufacture a request. The host must review real source semantics first.
 if(trustConfig?.status!=='REVIEWED')return freeze({status:'BLOCKED',code:'TRUST_NOT_CONFIGURED',claimOwner:null});
 const config=freeze(structuredClone(trustConfig)),verifier=createHackerRankVerifier({trustConfig:config,commitmentKey,clock});
 let owner=Wallet.createRandom(),used=false,closed=false;const cancelled=new AbortController();
 const claimOwner=owner.address.toLowerCase(),now=()=>clock?clock():Math.floor(Date.now()/1000);
 return freeze({status:'PREPARED',claimOwner,
  close(){closed=true;owner=null;cancelled.abort();},
  async collect({envelope,expectedRequest,client,routeClient,readCookies,submit,signal,createClaim}={}){
   check(!closed&&!used&&owner,'COLLECTOR_CLOSED');used=true;
   let proofPair={},snapshot,expected,username,stopPromise,lease;
   const stop=()=>{stopPromise??=Promise.resolve().then(()=>client?.terminateConnection());stopPromise.catch(()=>{});};
   let scope;
   try{
    snapshot=freeze(structuredClone(envelope));expected=freeze(structuredClone(expectedRequest));
    const request=verifyParticipant(snapshot,expected,config,now());check(request.expectedClaimOwner===claimOwner,'COLLECTOR_OWNER');
    check(client===routeClient&&client?.isOpen&&client.isInitialised&&client.metadata,'COLLECTOR_SAME_CLIENT');
    check(typeof readCookies==='function'&&typeof submit==='function','COLLECTOR_PORT');
    check(!createClaim||config.dataMode==='SYNTHETIC_FIXTURE','COLLECTOR_TEST_DRIVER');
    check(config.dataMode!=='SYNTHETIC_FIXTURE'||typeof createClaim==='function','SYNTHETIC_NETWORK_FORBIDDEN');
    const remaining=(request.expiresAt-now())*1000;check(remaining>0&&remaining<=900000,'REQUEST_WINDOW');
    scope=AbortSignal.any([signal,cancelled.signal,AbortSignal.timeout(remaining)].filter(Boolean));scope.addEventListener('abort',stop,{once:true});
    const guard=()=>{scope.throwIfAborted();check(!closed&&owner&&client.isOpen&&client.isInitialised,'COLLECTOR_CLOSED');validateRequest(request,config,now());check(now()>=config.notBefore&&now()<config.expiresAt,'TRUST_EXPIRED');};
    guard();if(!createClaim){
     process.env.LOG_LEVEL='silent';
     // This prefix has its own pinned TLS module instance, even when the
     // existing official client/route was opened by the YBM transport module.
     const {setCryptoImplementation}=await import('@reclaimprotocol/tls');
     const {webcryptoCrypto}=await import('@reclaimprotocol/tls/webcrypto');setCryptoImplementation(webcryptoCrypto);
     ({createClaimOnAttestor:createClaim}=await import('@reclaimprotocol/attestor-core'));
    }
    for(const role of ['account','certificate']){
     guard();const params=parametersFor(config.recipe,role,username);let cookieStr,result;
     try{
      cookieStr=await readCookies({role,url:params.url,signal:scope});guard();
      check(typeof cookieStr==='string'&&cookieStr.length>0&&cookieStr.length<=16384&&!/[\r\n\0]/.test(cookieStr),'COLLECTOR_COOKIES');
      result=await createClaim({name:'http',params,context:contextFor(request,role),secretParams:{cookieStr},ownerPrivateKey:owner.privateKey,client,zkEngine:'stwo',zkProofConcurrency:1,maxRetries:1,updateParametersFromOprfData:false,logger:quiet});
      guard();proofPair[role]=minimal(result);
     }finally{cookieStr=undefined;result=undefined;}
     if(role==='account'){username=await accountUsername(proofPair.account,config,request,now());guard();}
    }
    const candidate=await verifier.verify({envelope:snapshot,proofs:proofPair},expected);guard();
    check(candidate.status==='VERIFIED_CANDIDATE','COLLECTOR_PAIR_REJECTED');
    // No raw proof/context/cookie or owner key crosses the submit port.
    lease=candidateLease(verifier,candidate,expected);
    // After success the API may retain this candidate-only lease. Its original
    // expiry/provenance survives browser cleanup; transport or owner keys do not.
    lease.recheck();await submit({candidate,recheck:lease.recheck,lease,signal:scope});guard();
    return candidate;
   }catch(error){lease?.dispose();throw new EvidenceError(error instanceof EvidenceError?error.code:scope?.aborted?'COLLECTOR_CANCELLED':'COLLECTION_FAILED');}
   finally{scope?.removeEventListener('abort',stop);closed=true;owner=null;proofPair={};snapshot=expected=username=undefined;if(stopPromise)await stopPromise.catch(()=>{});}
  },
 });
}
