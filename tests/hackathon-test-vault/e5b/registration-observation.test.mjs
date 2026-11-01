// Fresh local Geth and invented identities only; no Privy SDK, external login or paid call.
import test from 'node:test';
import assert from 'node:assert/strict';
import {id} from 'ethers';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';
import {createApprovalSigner} from '../../../src/embedded-wallet/approvals.mjs';
import {verifyRecipientRegistration} from '../../../src/bootcamp/recipient-registration.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('HTTP canonical registration checkpoint advances before and during wallet request while fixed packet and CAS submit once',{timeout:180000},async t=>{
 let walletCalls=0;
 const f=await normalPaymentFixture(t,{executionVersion:2,wallClock:true,sourceSeconds:600,
  async recipientWait({api,app,auth,user,participant,provider,connection,runtime,now,key}){
   const packet=await api.recipientRegistration(app),deadline=packet.payload.message.deadline;
   const advance=async checkpoint=>{for(let n=0;n<80;n++){const b=await provider.getBlock('latest');if(BigInt(b.number)>BigInt(checkpoint.number))return;await delay(100);}throw Error('TEST_BLOCK_WAIT');};
   await advance(packet.checkpoint);
   const current=await api.recipientRegistration(app,{checkpoint:packet.checkpoint});
   assert(BigInt(current.checkpoint.number)>BigInt(packet.checkpoint.number));assert.deepEqual(current.payload,packet.payload);
   assert.equal(current.applicationRevision,packet.applicationRevision);assert.equal(current.ledgerSequence,packet.ledgerSequence);
   const path='/bootcamp/v3/applications/'+app+'/recipient-registration?checkpoint=';
   for(const invalid of [null,{}, {...packet.checkpoint,extra:true},{...packet.checkpoint,number:'-1'}])
    await assert.rejects(f.http.request(path+encodeURIComponent(JSON.stringify(invalid))),/CHECKPOINT/);
   await assert.rejects(api.recipientRegistration(app,{checkpoint:{...packet.checkpoint,hash:id('missing-block')}}),/REGISTRATION_CHAIN/);
   await assert.rejects(api.recipientRegistration(app,{checkpoint:{...packet.checkpoint,number:String(BigInt(packet.checkpoint.number)+1n)}}),/REGISTRATION_CHAIN/);
   const signer=createApprovalSigner({normal:api,session:{assertSession:async()=>auth.authorizeWorkflow(user,false)},now,
    wallet:{pin:{address:participant.address,chainId:Number(runtime.chainId)},async typed(p){walletCalls++;assert.deepEqual(p,packet.payload);assert.equal(p.message.deadline,deadline);
     await advance(current.checkpoint);return participant.signTypedData(p.domain,p.types,p.message);}}});
   const expected={applicationId:app,instanceId:runtime.instanceId,verifyingContract:runtime.vaultAddress,policyHash:runtime.policyHash,runtimeMappingHash:runtime.runtimeMappingHash,participant:participant.address};
   const signature=await signer.registration(packet,expected);
   verifyRecipientRegistration(packet.payload,signature,{applicationOwner:participant.address,nowSeconds:now(),sourceValidUntilExclusive:Number(deadline)});
   assert.equal(walletCalls,1);assert.deepEqual(connection.metrics(),{keyAccesses:0,paymentSignatures:0,transactionSignatures:0,broadcasts:0});
   const accepted=await api.submitRecipientRegistration(app,packet,signature,{idempotencyKey:key()});assert.equal(accepted.record.target.signatureAccepted,true);
   await assert.rejects(signer.registration(packet,expected),/REGISTRATION_CHAIN|REGISTRATION_STALE/);assert.equal(walletCalls,1);
  }});
 await f.run();assert.equal(f.report.completed,true);assert.equal(f.report.claim.amountAtoms,'100000000');assert.equal(f.report.claim.duplicateRejected,true);assert.equal(walletCalls,1);
});
