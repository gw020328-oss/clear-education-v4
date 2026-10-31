// Synthetic-only composition: the real self collector/consumer feeds the fixture
// ledger. Other criteria/AI and both wallets are invented. No live AI bypass exists.
import test from 'node:test';import assert from 'node:assert/strict';
import {JsonRpcProvider} from 'ethers';
import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {startSelfAttestorTest} from '../../../tools/local-attestor-review/host.mjs';
import {prepareHackerRankSource} from '../../../src/hackerrank-evidence/prepared-source.mjs';
import {createLiveReclaimConsumer} from '../../../src/bootcamp/reclaim-live-consumer.mjs';
import {syntheticAuthority} from '../../bootcamp-store/fixture.mjs';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';
import {p0Hash} from '../../../specs/bootcamp/p0-contract.mjs';
import {createSourceDiagnostics} from '../../../src/hackerrank-evidence/diagnostics.mjs';
test('self attestor synthetic HTTPS → same application → V2 consent → canonical 100 TEST and duplicate rejection',{skip:process.env.CLEAR_SELF_PAYMENT_TEST!=='1',timeout:300000},async t=>{
 process.env.CLEAR_LOCKED='1';const attestor=await startSelfAttestorTest({syntheticHttps:true});t.after(()=>attestor.close());
 const connection=await attestor.openClient(),trust=attestor.trust({audience:'self-payment-rehearsal',privacyKeyId:'self-test-key'}),diagnostics=createSourceDiagnostics();
 const source=prepareHackerRankSource({trustConfig:trust,commitmentKey:randomBytes(32),selectedCertificateId:'synthetic-python-orchid',client:connection.client,routeClient:connection.client,readCookies:async()=> 'session=SYNTHETIC_ONLY',diagnostics});t.after(()=>source.close());
 const pins=source.pins(),mappingHash=p0Hash('SELF-SYNTHETIC-HTTPS-MAPPING',{pins,otherSources:'SYNTHETIC_MOODLE_REFLECTION_AI',wallets:'INVENTED_EOA'});let collected=0,bound;
 let f;try{f=await normalPaymentFixture(t,{executionVersion:2,wallClock:true,sourceSeconds:600,sourceMappingHash:mappingHash,selfAttestor:attestor.profile,
  sourceFactory({now,participant,runtime}){
   const synthetic=syntheticAuthority({now}),ends=now()+600,hr=createLiveReclaimConsumer({selfAttestor:attestor.profile,pins:source.pins,now,
    resolveLease:()=>({available:true,authExpiresAt:ends,rawExpiresAt:ends,queryExpiresAt:ends}),
    collectLease:async(request,options)=>{collected++;bound=request;assert.equal(request.runtimeMappingHash,runtime.runtimeMappingHash);assert.equal(request.participantWallet,participant.address.toLowerCase());return source.collectLease(request,{...options,signRequest:m=>participant.signMessage(m)});}});
   const translated=r=>({...r,dataMode:'RECLAIM_SIGNED_RECORD'});
   const bridge={execution:'SYNTHETIC_FIXTURE',capability:hr.capability,bridgeVersion:hr.bridgeVersion,
    verify:(r,o)=>hr.verify(translated(r),o),recheck:(c,r)=>hr.recheck(c,translated(r)),reference:(c,r)=>hr.reference(c,translated(r)),close:()=>hr.close()};
   return {...synthetic,producers:{...synthetic.producers,'python-basic-certificate':bridge},resolveSource(r){if(r.criterionId==='python-basic-certificate')return hr.resolveSource(r);const g=synthetic.resolveSource(r);g.runtimeMappingHash=runtime.runtimeMappingHash;g.authExpiresAt=ends;g.rawExpiresAt=ends;g.queryExpiresAt=ends;return g;}};
  }});}catch(e){t.diagnostic(JSON.stringify(diagnostics.snapshot()));throw e;}
 assert.equal(collected,1);assert.equal(bound.applicationId,f.app);assert.equal(bound.participantWallet,f.user.wallet.toLowerCase());
 const evidence=await f.api.decisionEvidence(f.app);assert.equal(evidence.manifest.decision.conditionsStatus,'MET');
 await f.run();const r=f.readReport();assert.equal(r.completed,true);assert.equal(r.registrationAccepted,true);
 assert.deepEqual(r.stages.map(x=>x.kind),['REGISTER','ALLOCATE','START_REVIEW','BIND_CONSENTS','PREPARE','ACCEPT']);
 assert.equal(r.claim.amountAtoms,'100000000');assert.equal(r.claim.duplicateRejected,true);
 assert.equal(f.metrics().broadcasts,6);assert.equal(f.metrics().paymentSignatures,1);
 const rpc=new JsonRpcProvider(f.connection.runtime.manifest.endpoint);try{assert.equal(await rpc.getTransactionCount(f.user.wallet,'latest'),0);}finally{rpc.destroy();}
 const receipt=await f.api.paymentReceipt(f.app);assert.equal(receipt.claim.state,'INCLUDED');assert.equal(receipt.claim.canonical,true);assert.equal(receipt.balance.exactExpectedAmountVerified,true);assert.equal(receipt.balance.receivedAtoms,'100000000');
 assert.equal(receipt.source.actualSourceVerification,false);assert.deepEqual(receipt.source.selfAttestor,attestor.profile);
 const operator=await f.http.request('/bootcamp/v4/applications/'+f.app+'/payment-receipt',{actor:f.op});assert.deepEqual(operator.source,receipt.source);
 const replay={...bound,applicationId:'another-application'};await assert.rejects(()=>source.collectLease(replay,{isAuthorized:()=>true,signRequest:()=>{throw Error('MUST_NOT_SIGN');}}),/COLLECTOR_CLOSED/);
 const report={version:'clear-self-attestor-payment-rehearsal.1',mode:'SELF_ATTESTOR_TEST',sourceEnvironment:'SYNTHETIC_HTTPS',otherSources:'SYNTHETIC_MOODLE_REFLECTION_AI',wallets:'INVENTED_EOA',actualUserLogin:false,paidAiCalls:0,officialHostedSuccess:false,independentTrust:false,bgpCheckEnabled:false,sameApplication:true,pairProofVerified:true,v2RecipientRegistration:true,bothConsents:true,canonicalReceipt:true,finalized:false,amountAtoms:r.claim.amountAtoms,duplicateRejected:r.claim.duplicateRejected,participantGasTransactions:0,sourceReplayRejected:true,completed:true};
 mkdirSync(new URL('../../../var/self-attestor-rehearsal/',import.meta.url),{recursive:true,mode:0o700});writeFileSync(new URL('../../../var/self-attestor-rehearsal/result.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{mode:0o600});t.diagnostic(JSON.stringify(report));
});
