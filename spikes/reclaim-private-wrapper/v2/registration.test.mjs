import test from 'node:test';import assert from 'node:assert/strict';
import {Wallet,id} from 'ethers';
import {fixtureSigner} from '../model.mjs';
import {record,proof,NOW} from './fixture.mjs';
import {privateRegistryLab} from './reuse-lab.mjs';
import {registrationAuthorityLab,offlineExerciseLab,exerciseMessage} from './registration-lab.mjs';
const wallet=new Wallet(id('PUBLIC_SYNTHETIC_V2_RECIPIENT'));
const a=record({recipient:wallet.address.toLowerCase()}),b=record({...a,application:id('PUBLIC_SYNTHETIC_APP_B'),owner:'0x3333333333333333333333333333333333333333',recipient:'0x3333333333333333333333333333333333333333'});
const options={key:Buffer.alloc(32,42),registrations:[a,b],signer:fixtureSigner().address.toLowerCase(),clock:()=>NOW};
test('concurrent different-wallet source registration has exactly one winner',async()=>{
 const lab=registrationAuthorityLab(options);try{
  const [pa,pb]=await Promise.all([proof({r:a}),proof({r:b})]);
  const result=await Promise.allSettled([lab.register({application:a.application,proof:pa}),lab.register({application:b.application,proof:pb})]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.match(result.find(r=>r.status==='rejected').reason.message,/SOURCE_ALREADY_REGISTERED/);
 }finally{lab.close();}
});
test('private checkpoint preserves duplicates; changed key is rejected; state rollback is a counterexample',async()=>{
 const lab=registrationAuthorityLab(options),old=lab.privateCheckpoint();
 await lab.register({application:a.application,proof:await proof({r:a})});const state=lab.privateCheckpoint();lab.close();
 const restored=registrationAuthorityLab({...options,state});
 await assert.rejects(restored.register({application:b.application,proof:await proof({r:b})}),/SOURCE_ALREADY_REGISTERED/);restored.close();
 assert.throws(()=>registrationAuthorityLab({...options,state,key:Buffer.alloc(32,43)}),/KEY_ROTATION_REVIEW_REQUIRED/);
 const rollback=registrationAuthorityLab({...options,state:old});
 // Trusted state rollback can authorize a duplicate: this is NOT fixed by HMAC.
 assert.ok(await rollback.register({application:b.application,proof:await proof({r:b})}));rollback.close();
});
test('already registered receipt exercises after issuer shutdown with no new issuer approval',async()=>{
 const lab=registrationAuthorityLab(options),receipt=await lab.register({application:a.application,proof:await proof({r:a})});lab.close();
 await assert.rejects(lab.register({application:b.application,proof:await proof({r:b})}),/REGISTRY_OFFLINE/);
 assert.equal(JSON.stringify(receipt).includes('123456'),false);
 const signature=await wallet.signMessage(exerciseMessage(receipt.ticket));
 const ledger=offlineExerciseLab({registrations:[a,b]});
 const r=ledger.exercise(receipt,signature);assert.equal(r.newIssuerSignatureRequired,false);assert.equal(r.paymentAllowed,false);
 assert.throws(()=>ledger.exercise(receipt,signature),/ALREADY_EXERCISED/);
 const restored=offlineExerciseLab({registrations:[a,b],spent:ledger.checkpoint()});assert.throws(()=>restored.exercise(receipt,signature),/ALREADY_EXERCISED/);
 // Losing the final ledger also loses spent protection. Needs durable consensus.
 assert.ok(offlineExerciseLab({registrations:[a,b]}).exercise(receipt,signature));
});
test('receipt modifications and unauthorized recipient cannot exercise',async()=>{
 const lab=registrationAuthorityLab(options),receipt=await lab.register({application:a.application,proof:await proof({r:a})});lab.close();
 const ledger=offlineExerciseLab({registrations:[a,b]}),signature=await wallet.signMessage(exerciseMessage(receipt.ticket));
 for(const delta of [{application:b.application},{reuseScope:id('changed-scope')},{recipient:b.owner},{chainId:1}]){
  const changed=structuredClone(receipt);Object.assign(changed.ticket,delta);assert.throws(()=>ledger.exercise(changed,signature));
 }
 const corrupted=structuredClone(receipt);corrupted.signature='0x'+'00'.repeat(65);assert.throws(()=>ledger.exercise(corrupted,signature));
 const other=new Wallet(id('PUBLIC_SYNTHETIC_OTHER_RECIPIENT'));assert.throws(()=>ledger.exercise(receipt,other.signingKey.sign(id('other')).serialized));
});
test('shutdown during asynchronous source verification cannot commit new private registry state',async()=>{
 const lab=privateRegistryLab(options),p=await proof({r:a});
 const pending=lab.observe({application:a.application,proof:p});lab.close();await assert.rejects(pending,/LAB_CLOSED/);
});
