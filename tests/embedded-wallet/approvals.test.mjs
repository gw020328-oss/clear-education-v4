import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Wallet,id,getBytes} from 'ethers';
import {pinnedWallet} from '../../src/embedded-wallet/provider-boundary.mjs';
import {createApprovalSigner} from '../../src/embedded-wallet/approvals.mjs';
import {recipientRegistration,verifyRecipientRegistration} from '../../src/bootcamp/recipient-registration.mjs';
import {requestMessage,requestHash,POLICY_HASH,CRITERION,verifyParticipant} from '../../src/hackerrank-evidence/request.mjs';
import {hash} from '../../src/hackerrank-evidence/values.mjs';
import {syntheticRecipe} from '../../src/hackerrank-evidence/recipes.mjs';
const NOW=1900000000, CHAIN=1901234567;
function fixture(t) {
 const w=Wallet.createRandom(),provider=new EventEmitter();let after=()=>{},calls=0,role='participant',time=NOW;
 const identity={sdkUserId:'did:privy:fixture',walletId:'fixture-wallet',address:w.address,chainId:CHAIN};
 provider.request=async({method,params})=>{
  if(method==='eth_accounts')return [w.address];if(method==='eth_chainId')return '0x'+CHAIN.toString(16);
  calls++;let s;
  if(method==='personal_sign')s=await w.signMessage(getBytes(params[0]));
  else if(method==='eth_signTypedData_v4'){const p=JSON.parse(params[1]);delete p.types.EIP712Domain;s=await w.signTypedData(p.domain,p.types,p.message);}
  else throw Error('RPC_FORBIDDEN');after();return s;
 };
 const wallet=pinnedWallet({provider,identity,readIdentity:()=>identity});t.after(()=>wallet.dispose());
 const trust={version:'clear-hackerrank-trust.1',audience:'fixture',recipe:syntheticRecipe()};
 const r={version:'clear-hackerrank-request.1',audience:trust.audience,participantId:'participant-fixture',participantWallet:w.address.toLowerCase(),
  applicationId:'application-fixture',criterionId:CRITERION,policyHash:POLICY_HASH,runtimeMappingHash:id('mapping'),trustConfigHash:hash('TRUST',trust),recipeHash:hash('RECIPE',trust.recipe),
  expectedClaimOwner:Wallet.createRandom().address.toLowerCase(),nonce:id('nonce'),issuedAt:NOW,expiresAt:NOW+120,selectedCertificateId:null};
 const source={applicationId:r.applicationId,approvalId:'approval-fixture',requestHash:requestHash(r),message:requestMessage(r),expiresAt:r.expiresAt,purpose:'HACKERRANK_EVIDENCE_OBSERVATION_NOT_PAYMENT_AUTHORIZATION'};
 const payload=recipientRegistration({chainId:CHAIN,verifyingContract:Wallet.createRandom().address,instanceId:id('instance'),policyHash:POLICY_HASH,runtimeMappingHash:id('mapping'),participant:w.address,applicationSalt:id('salt'),nonce:id('registration-nonce'),deadline:NOW+100});
 const registration={version:'clear-bootcamp-recipient-registration.1',applicationId:r.applicationId,role:'PARTICIPANT',status:'AWAITING_SIGNATURE',purpose:'REGISTER_FIXED_RECIPIENT',calldataPublic:true,registrationTargetId:'registration-fixture',payload,observedAt:NOW};
 let currentSource=structuredClone(source),currentRegistration=structuredClone(registration);
 const signer=createApprovalSigner({wallet,now:()=>time,session:{assertSession:async()=>({role,wallet:w.address})},
  normal:{pendingSourceSignature:async()=>structuredClone(currentSource),recipientRegistration:async()=>structuredClone(currentRegistration)}});
 return {w,r,trust,source,registration,signer,get calls(){return calls;},after:fn=>{after=fn;},role:v=>{role=v;},time:v=>{time=v;},
  changeSource:patch=>{Object.assign(currentSource,patch);},changeRegistration:patch=>{Object.assign(currentRegistration,patch);},
  anchors:{applicationId:r.applicationId,instanceId:payload.domain.salt,verifyingContract:payload.domain.verifyingContract,policyHash:POLICY_HASH,runtimeMappingHash:id('mapping'),participant:w.address}};
}
test('source approval signs exact server request and preserves separate collector owner',async t=>{
 const f=fixture(t),signature=await f.signer.source(f.source,f.r);
 assert.deepEqual(verifyParticipant({request:f.r,signature},f.r,f.trust,NOW),f.r);
 assert.notEqual(f.r.expectedClaimOwner,f.w.address.toLowerCase());assert.equal(f.calls,1);
});
for(const key of ['applicationId','participantId','policyHash','runtimeMappingHash','audience','trustConfigHash','recipeHash','expectedClaimOwner','selectedCertificateId'])
 test('source refuses independent binding mismatch '+key,async t=>{
  const f=fixture(t);await assert.rejects(f.signer.source(f.source,{...f.r,[key]:'other'}),/SOURCE_BINDING/);assert.equal(f.calls,0);
 });
test('source rejects newer request after prompt without submitting late signature',async t=>{
 const f=fixture(t);f.after(()=>f.changeSource({approvalId:'approval-new'}));await assert.rejects(f.signer.source(f.source,f.r),/SOURCE_STALE/);
});
test('registration matches real codec and returns only an EOA signature',async t=>{
 const f=fixture(t),signature=await f.signer.registration(f.registration,f.anchors);
 assert.equal(verifyRecipientRegistration(f.registration.payload,signature,{applicationOwner:f.w.address,nowSeconds:NOW,sourceValidUntilExclusive:NOW+120}).applicationId,f.registration.payload.message.applicationId);
});
for(const key of ['instanceId','verifyingContract','policyHash','runtimeMappingHash','participant'])test('registration rejects external anchor mismatch '+key,async t=>{
 const f=fixture(t),value=['verifyingContract','participant'].includes(key)?Wallet.createRandom().address:id('other');
 await assert.rejects(f.signer.registration(f.registration,{...f.anchors,[key]:value}),/REGISTRATION_BINDING/);assert.equal(f.calls,0);
});
test('registration decision CAS changes while prompt is open discard signature',async t=>{
 const f=fixture(t);f.after(()=>f.changeRegistration({decisionRevision:99}));await assert.rejects(f.signer.registration(f.registration,f.anchors),/REGISTRATION_STALE/);
});
test('operator session cannot sign participant source or recipient registration',async t=>{
 const f=fixture(t);f.role('operator');await assert.rejects(f.signer.source(f.source,f.r),/FORBIDDEN/);
 await assert.rejects(f.signer.registration(f.registration,f.anchors),/FORBIDDEN/);assert.equal(f.calls,0);
});
