// Explicit local integration; pinned source must be prepared first. No actual user data.
import test from 'node:test';import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {P0_POLICY,p0PolicyHash} from '../../specs/bootcamp/p0-contract.mjs';
import {Wallet} from 'ethers';
import {startSelfAttestorTest,assertSelfRuntime} from '../../tools/local-attestor-review/host.mjs';
import {prepareHackerRankSource} from '../../src/hackerrank-evidence/prepared-source.mjs';
import {readHackerRankCollectorLease} from '../../src/hackerrank-evidence/collector.mjs';
import {hash} from '../../src/hackerrank-evidence/values.mjs';
import {requireProfileMode,validateSelfProfile} from '../../src/hackerrank-evidence/self-profile.mjs';
import {createLiveReclaimConsumer} from '../../src/bootcamp/reclaim-live-consumer.mjs';
import {createSourceDiagnostics} from '../../src/hackerrank-evidence/diagnostics.mjs';
test('explicit self HTTPS pair: real TLS/SDK signatures, private source lease, no official mixing',{skip:process.env.CLEAR_SELF_HTTPS_TEST!=='1',timeout:180000},async t=>{
 process.env.CLEAR_LOCKED='1';const run=await startSelfAttestorTest({syntheticHttps:true});t.after(()=>run.close());
 assertSelfRuntime(run,run.profile);assert.throws(()=>assertSelfRuntime({...run},run.profile),/SELF_RUNTIME_REQUIRED/);
 assert.throws(()=>requireProfileMode(run.profile,'OFFICIAL'),/SELF_IN_OFFICIAL_PATH/);
 assert.throws(()=>validateSelfProfile({...run.profile,officialHostedSuccess:true}),/SELF_PROFILE/);
 const trust=run.trust({audience:'self-https-test',privacyKeyId:'self-key.'+randomUUID()}),connection=await run.openClient();
 await assert.rejects(()=>connection.client.rpc('createTunnel',{id:54321,host:'not-allowed.invalid',port:443},5000),/not allowed/);
 const diagnostics=createSourceDiagnostics(),source=prepareHackerRankSource({trustConfig:trust,commitmentKey:randomBytes(32),selectedCertificateId:'synthetic-python-orchid',client:connection.client,routeClient:connection.client,readCookies:async()=> 'session=SYNTHETIC_ONLY',diagnostics});t.after(()=>source.close());
 const pins=source.pins(),participant=Wallet.createRandom(),now=Math.floor(Date.now()/1000);
 const request={version:'clear-hackerrank-request.1',audience:pins.audience,participantId:'synthetic-participant',participantWallet:participant.address.toLowerCase(),applicationId:'synthetic-application',criterionId:'python-basic-certificate',policyHash:p0PolicyHash(P0_POLICY),runtimeMappingHash:hash('TEST',run.profile),trustConfigHash:pins.trustConfigHash,recipeHash:pins.recipeHash,expectedClaimOwner:pins.expectedClaimOwner,nonce:hash('TEST',randomUUID()),issuedAt:now,expiresAt:now+300,selectedCertificateId:pins.selectedCertificateId};
 const official=createLiveReclaimConsumer({pins:source.pins});assert.throws(()=>official.status(),/SELF_IN_OFFICIAL_PATH/);
 let lease;try{lease=await source.collectLease(request,{isAuthorized:()=>true,signRequest:m=>participant.signMessage(m)});}catch(e){t.diagnostic(JSON.stringify(diagnostics.snapshot()));throw e;}
 const {candidate}=readHackerRankCollectorLease(lease);assert.equal(candidate.condition,'MET');assert.equal(candidate.dataMode,'RECLAIM_SIGNED_RECORD');assert.equal(candidate.trustConfigHash,pins.trustConfigHash);assert.equal(candidate.gates.paymentAllowed,false);
 await assert.rejects(()=>source.collectLease(request,{isAuthorized:()=>true,signRequest:m=>participant.signMessage(m)}),/COLLECTOR_CLOSED/);
 assert.equal(run.profile.officialHostedSuccess,false);assert.equal(run.profile.independentTrust,false);
});
