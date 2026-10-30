import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {Wallet} from 'ethers';
import {SELF_MODE,SELF_HOSTS,validateSelfProfile,requireProfileMode} from '../../src/hackerrank-evidence/self-profile.mjs';
import {createHackerRankVerifier} from '../../src/hackerrank-evidence/verifier.mjs';
import {managedWorkerTrust} from '../../src/hackerrank-evidence/worker-trust.mjs';
import {withManagedHackerRankSource} from '../../src/hackerrank-evidence/managed-source.mjs';
import {createLiveReclaimConsumer} from '../../src/bootcamp/reclaim-live-consumer.mjs';
import {hash} from '../../src/hackerrank-evidence/values.mjs';
const profile=()=>({mode:SELF_MODE,profileId:'self-'+randomUUID(),endpoint:'ws://127.0.0.1:14589/ws',signer:Wallet.createRandom().address.toLowerCase(),sourceEnvironment:'LIVE_HACKERRANK',hosts:SELF_HOSTS,officialHostedSuccess:false,independentTrust:false,bgpCheckEnabled:false});
function setup(){const p=profile(),base=managedWorkerTrust({signers:[p.signer],audience:'self-profile-test',privacyKeyId:'self-test-key',now:Math.floor(Date.now()/1000)});return {p,config:{...base,approvalRef:'clear-self-attestor-test.1',selfAttestor:p}};}
test('self trust is request-hashed, signer fixed, and mode cannot be silently erased',()=>{
 const {p,config}=setup(),key=Buffer.alloc(32,53);createHackerRankVerifier({trustConfig:config,commitmentKey:key});
 const changed={...config,selfAttestor:{...p,profileId:'self-'+randomUUID()}};assert.notEqual(hash('TRUST',changed),hash('TRUST',config));
 assert.throws(()=>createHackerRankVerifier({trustConfig:{...config,signers:[Wallet.createRandom().address.toLowerCase()]},commitmentKey:key}),/SELF_TRUST/);
 const {selfAttestor,...removed}=config;assert.throws(()=>createHackerRankVerifier({trustConfig:removed,commitmentKey:key}),/SELF_TRUST/);
 assert.throws(()=>requireProfileMode(p,'OFFICIAL'),/SELF_IN_OFFICIAL_PATH/);assert.throws(()=>requireProfileMode(null,SELF_MODE,p));
 assert.throws(()=>requireProfileMode(changed.selfAttestor,SELF_MODE,p),/SELF_PROFILE_CHANGED/);
 assert.equal(validateSelfProfile(p).officialHostedSuccess,false);
});
for(const patch of [{endpoint:'wss://example.invalid/ws'},{endpoint:'ws://127.0.0.1:14589/ws?key=x'},{hosts:['*.hackerrank.com']},{officialHostedSuccess:true},{independentTrust:true},{bgpCheckEnabled:true},{sourceEnvironment:'ACTUAL_SUCCESS'}])test('reject widened self profile '+Object.keys(patch)[0]+JSON.stringify(patch),()=>assert.throws(()=>validateSelfProfile({...profile(),...patch})));
test('managed official path and fabricated self capability fail before transport/browser',async()=>{
 const {p,config}=setup();let io=0;
 for(const extra of [{},{selfAttestor:{profile:p,isCurrent:()=>true}}])await assert.rejects(()=>withManagedHackerRankSource(null,{trustConfig:config,commitmentKey:Buffer.alloc(32,53),openClient:async()=>{io++;},...extra}),/SELF_IN_OFFICIAL_PATH|SELF_RUNTIME_REQUIRED/);
 assert.equal(io,0);
});
test('live consumer must opt in to exactly the same self profile',()=>{
 const {p,config}=setup(),pins={audience:config.audience,trustConfigHash:hash('TRUST',config),recipeHash:hash('RECIPE',config.recipe),expectedClaimOwner:Wallet.createRandom().address.toLowerCase(),selectedCertificateId:null,dataMode:'RECLAIM_SIGNED_RECORD',selfAttestor:p};
 assert.throws(()=>createLiveReclaimConsumer({pins:()=>pins}).status(),/SELF_IN_OFFICIAL_PATH/);
 assert.equal(createLiveReclaimConsumer({pins:()=>pins,selfAttestor:p}).status(),'REGISTERED_TRUST_ONLY');
 assert.throws(()=>createLiveReclaimConsumer({pins:()=>pins,selfAttestor:{...p,profileId:'self-'+randomUUID()}}).status(),/SELF_PROFILE_CHANGED/);
 const {selfAttestor,...official}=pins;assert.throws(()=>createLiveReclaimConsumer({pins:()=>official,selfAttestor:p}).status());
});
