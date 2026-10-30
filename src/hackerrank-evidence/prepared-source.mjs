import {observeSource} from './diagnostics.mjs';
import {createHackerRankCollector,readHackerRankCollectorLease} from './collector.mjs';
import {requestMessage,validateRequest} from './request.mjs';
import {check,freeze,hash,isSourceId,EvidenceError} from './values.mjs';

// Trusted worker seam only: the host owns managed browser/route cleanup and
// supplies their exact client + URL-scoped cookie reader. This opens no browser,
// authenticates no account, and does not turn pending trust into reviewed trust.
export function prepareHackerRankSource({trustConfig,commitmentKey,selectedCertificateId=null,
 client,routeClient,readCookies,clock,createClaim,diagnostics}={}){
 if(trustConfig?.status!=='REVIEWED')return freeze({
  status:'BLOCKED',code:'TRUST_NOT_CONFIGURED',pins:()=>null,close(){},
  async collectLease(){throw new EvidenceError('TRUST_NOT_CONFIGURED');},
 });
 const config=freeze(structuredClone(trustConfig));
 check(selectedCertificateId===null||isSourceId(selectedCertificateId),'REQUEST_SELECTION');
 check(typeof readCookies==='function','COLLECTOR_PORT');
 check(client===routeClient&&client?.isOpen&&client.isInitialised&&client.metadata,'COLLECTOR_SAME_CLIENT');
 check(!createClaim||config.dataMode==='SYNTHETIC_FIXTURE','COLLECTOR_TEST_DRIVER');
 const collector=createHackerRankCollector({trustConfig:config,commitmentKey,clock,diagnostics});
 const snapshot=freeze({audience:config.audience,trustConfigHash:hash('TRUST',config),recipeHash:hash('RECIPE',config.recipe),
  expectedClaimOwner:collector.claimOwner,selectedCertificateId,dataMode:config.dataMode,...(config.selfAttestor?{selfAttestor:config.selfAttestor}:{})});
 const now=()=>clock?clock():Math.floor(Date.now()/1000);
 let used=false,closed=false,retainedLease;
 const close=()=>{closed=true;collector.close();retainedLease?.dispose();retainedLease=undefined;};
 const pins=()=>{
  if(closed)return null;
  const t=now();
  if(!Number.isSafeInteger(t)||t<config.notBefore||t>=config.expiresAt){close();return null;}
  return snapshot;
 };
 // Reject stale trust before handing out an owner for a new immutable mapping.
 check(pins(),'TRUST_EXPIRED');
 return freeze({status:'PREPARED',pins,close,
  async collectLease(expectedRequest,{signal,isAuthorized,signRequest}={}){
   check(!closed&&!used,'COLLECTOR_CLOSED');used=true;
   const guard=()=>{
    check(!signal?.aborted,'COLLECTOR_CANCELLED');
    check(pins(),'COLLECTOR_CLOSED');
    check(typeof isAuthorized==='function'&&isAuthorized()===true,'COLLECTOR_AUTHORITY');
   };
   try{
    observeSource(diagnostics,'PREPARED_SOURCE','STARTED');
    guard();check(typeof signRequest==='function','COLLECTOR_HOST_PORTS');
    const expected=freeze(structuredClone(expectedRequest));
    validateRequest(expected,config,now());
    check(expected.expectedClaimOwner===snapshot.expectedClaimOwner,'COLLECTOR_OWNER');
    check(expected.selectedCertificateId===snapshot.selectedCertificateId,'REQUEST_SELECTION');
    const signature=await signRequest(requestMessage(expected));guard();
    await collector.collect({expectedRequest:expected,envelope:{request:expected,signature},
     client,routeClient,signal,createClaim,
     async readCookies(input){guard();const cookie=await readCookies(input);guard();return cookie;},
     async submit({lease}){guard();readHackerRankCollectorLease(lease);retainedLease=lease;},
    });
    guard();readHackerRankCollectorLease(retainedLease);observeSource(diagnostics,'PREPARED_SOURCE','COMPLETED');return retainedLease;
   }catch(error){
    observeSource(diagnostics,'PREPARED_SOURCE','FAILED',error);
    close();
    throw new EvidenceError(error instanceof EvidenceError?error.code:signal?.aborted?'COLLECTOR_CANCELLED':'COLLECTION_FAILED');
   }finally{
    // A candidate-only lease may survive successful collection; owner key and
    // transport secrets cannot. Host cleanup failure must call source.close().
    collector.close();
   }
  },
 });
}
