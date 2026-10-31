import test from 'node:test';import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';import {mkdtempSync,rmSync,realpathSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import * as ethers from 'ethers';import {pinnedWallet} from '../../src/embedded-wallet/provider-boundary.mjs';
const fromRepo = p => import(new URL('../../' + p, import.meta.url));
const {Wallet,id,getBytes}=ethers;
const {createApplicationService}=await fromRepo('src/application/service.mjs');
const {recipientRegistration,verifyRecipientRegistration}=await fromRepo('src/bootcamp/recipient-registration.mjs');
const {requestMessage,verifyParticipant,POLICY_HASH,CRITERION}=await fromRepo('src/hackerrank-evidence/request.mjs');
const {syntheticRecipe}=await fromRepo('src/hackerrank-evidence/recipes.mjs');const {hash}=await fromRepo('src/hackerrank-evidence/values.mjs');
const {procedureFixture}=await fromRepo('tests/bootcamp-store/procedure-fixture.mjs');
globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};
const NOW=1900000000,CHAIN=31339017;
function actor(t,wallet=Wallet.createRandom(),role='participant'){
 const p=new EventEmitter();let identity={sdkUserId:'synthetic-user-'+role,walletId:'synthetic-wallet-'+role,address:wallet.address,chainId:CHAIN,role},after=()=>{},replacement=null,count=0;
 p.request=async({method,params=[]})=>{
  if(method==='eth_accounts')return [identity.address];if(method==='eth_chainId')return '0x'+BigInt(identity.chainId).toString(16);
  count++;let signature;
  if(method==='personal_sign'){assert.equal(params[1],wallet.address);signature=await (replacement??wallet).signMessage(getBytes(params[0]));}
  else if(method==='eth_signTypedData_v4'){assert.equal(params[0],wallet.address);const v=JSON.parse(params[1]);delete v.types.EIP712Domain;signature=await (replacement??wallet).signTypedData(v.domain,v.types,v.message);}
  else throw Error('UNEXPECTED_RPC');await after();return signature;
 };
 const adapter=pinnedWallet({provider:p,identity,readIdentity:async()=>identity});t.after(()=>adapter.dispose());
 return {wallet,p,adapter,get identity(){return identity;},change:x=>{identity={...identity,...x};},after:fn=>{after=fn;},wrongSigner:()=>{replacement=Wallet.createRandom();},get requests(){return count;}};
}
function auth(t){let now=NOW;const directory=realpathSync(mkdtempSync(join(tmpdir(),'clear-wallet-readiness-'))),a=actor(t),b=actor(t,Wallet.createRandom(),'operator');
 const s=createApplicationService({directory,origin:'https://127.0.0.1:9445',chainId:CHAIN,instanceId:id('synthetic-instance'),participants:[a.wallet.address],operators:[b.wallet.address],now:()=>now});
 t.after(()=>{s.close();rmSync(directory,{recursive:true,force:true});});return {a,b,s,setTime:x=>{now=x;},challenge:()=>s.challenge({wallet:a.wallet.address,chainId:CHAIN})};
}
for(const mode of ['valid','wrong-signer','wrong-message-domain','expired','wrong-browser','nonce-replay','wrong-chain','uninvited'])test('real SIWE verifier '+mode,async t=>{
 const f=auth(t);if(mode==='wrong-chain')return assert.throws(()=>f.s.challenge({wallet:f.a.wallet.address,chainId:CHAIN+1}),/WRONG_CHAIN/);
 if(mode==='uninvited')return assert.throws(()=>f.s.challenge({wallet:Wallet.createRandom().address,chainId:CHAIN}),/NOT_INVITED/);
 const c=f.challenge();let message=c.message;if(mode==='wrong-message-domain')message=message.replace('127.0.0.1:9445','example.invalid');if(mode==='wrong-signer')f.a.wrongSigner();
 if(mode==='wrong-signer')return assert.rejects(f.a.adapter.personal(message,{expiresAt:c.expiresAt,now:()=>NOW}),/SIGNATURE_INVALID/);
 const signature=await f.a.adapter.personal(message,{expiresAt:c.expiresAt,now:()=>NOW});if(mode==='expired')f.setTime(c.expiresAt);
 const login=()=>f.s.login({nonce:c.nonce,signature},mode==='wrong-browser'?'aa'.repeat(32):c.browserToken);
 if(['wrong-message-domain','expired','wrong-browser'].includes(mode))assert.throws(login,/SIGNATURE|AUTH_CHALLENGE/);
 else{const result=login();assert.equal(result.wallet,f.a.wallet.address);assert.equal(result.role,'participant');if(mode==='nonce-replay')assert.throws(login,/AUTH_CHALLENGE/);}
});
function request(a){const config={version:'clear-hackerrank-trust.1',audience:'synthetic-wallet-test',recipe:syntheticRecipe()};
 const r={version:'clear-hackerrank-request.1',audience:config.audience,participantId:'participant-orchid',participantWallet:a.wallet.address.toLowerCase(),applicationId:'application-orchid',criterionId:CRITERION,policyHash:POLICY_HASH,runtimeMappingHash:id('mapping'),trustConfigHash:hash('TRUST',config),recipeHash:hash('RECIPE',config.recipe),expectedClaimOwner:Wallet.createRandom().address.toLowerCase(),nonce:id('fresh-source-nonce'),issuedAt:NOW,expiresAt:NOW+120,selectedCertificateId:null};return {config,r};}
for(const mode of ['valid','nonce','application','claim-owner','participant','audience','expired'])test('real HR approval verifier '+mode,async t=>{
 const a=actor(t),{config,r}=request(a),altered=structuredClone(r);if(mode==='nonce')altered.nonce=id('other');if(mode==='application')altered.applicationId='application-other';if(mode==='claim-owner')altered.expectedClaimOwner=Wallet.createRandom().address.toLowerCase();if(mode==='participant')altered.participantWallet=Wallet.createRandom().address.toLowerCase();if(mode==='audience')altered.audience='other';
 const signature=await a.adapter.personal(requestMessage(altered),{expiresAt:r.expiresAt,now:()=>NOW});const verify=()=>verifyParticipant({request:altered,signature},r,config,mode==='expired'?r.expiresAt:NOW);
 if(mode==='valid')assert.deepEqual(verify(),r);else assert.throws(verify,/EXPECTED_REQUEST|REQUEST_DOMAIN|REQUEST_EXPIRED|PARTICIPANT/);
});
function packet(a){return recipientRegistration({chainId:CHAIN,verifyingContract:Wallet.createRandom().address,instanceId:id('instance'),policyHash:POLICY_HASH,runtimeMappingHash:id('mapping'),participant:a.wallet.address,applicationSalt:id('application-salt'),nonce:id('registration-nonce'),deadline:NOW+90});}
for(const mode of ['valid','chain','contract','salt','nonce','recipient','application','expired','owner'])test('real V2 registration codec '+mode,async t=>{
 const a=actor(t),p=packet(a),other=structuredClone(p);if(mode==='chain')other.domain.chainId=String(CHAIN+1);if(mode==='contract')other.domain.verifyingContract=Wallet.createRandom().address;if(mode==='salt')other.domain.salt=id('other-instance');if(mode==='nonce')other.message.nonce=id('other-nonce');if(mode==='recipient')other.message.recipient=Wallet.createRandom().address;if(mode==='application')other.message.applicationId=id('other-application');
 if(mode==='chain')return assert.throws(()=>a.adapter.typed(other,{expiresAt:NOW+90,now:()=>NOW}),/TYPED_CHAIN/);
 const signature=await a.adapter.typed(other,{expiresAt:NOW+90,now:()=>NOW});const verify=()=>verifyRecipientRegistration(p,signature,{applicationOwner:mode==='owner'?Wallet.createRandom().address:a.wallet.address,nowSeconds:mode==='expired'?NOW+90:NOW,sourceValidUntilExclusive:NOW+120});
 if(mode==='valid')assert.equal(verify().applicationId,p.message.applicationId);else assert.throws(verify,/REGISTRATION_/);
});
for(const mode of ['accountsChanged','chainChanged','disconnect','silent-account','sdk-user','role','abort','expiry','rejection'])test('late signature discarded '+mode,async t=>{
 const a=actor(t),p=packet(a),controller=new AbortController();let now=NOW;
 a.after(()=>{if(['accountsChanged','chainChanged','disconnect'].includes(mode))a.p.emit(mode);if(mode==='silent-account')a.change({address:Wallet.createRandom().address});if(mode==='sdk-user')a.change({sdkUserId:'different-user'});if(mode==='role')a.change({role:'operator'});if(mode==='abort')controller.abort();if(mode==='expiry')now=NOW+90;if(mode==='rejection')throw {code:4001};});
 await assert.rejects(a.adapter.typed(p,{expiresAt:NOW+90,now:()=>now,signal:controller.signal}),/WALLET_|SIGNATURE_EXPIRED/);assert.equal(a.requests,1);
});
test('separate participant and operator identities never cross-sign',async t=>{const f=auth(t),p=packet(f.a);const s=await f.b.adapter.typed(p,{expiresAt:NOW+90,now:()=>NOW});assert.throws(()=>verifyRecipientRegistration(p,s,{applicationOwner:f.a.wallet.address,nowSeconds:NOW,sourceValidUntilExclusive:NOW+120}),/REGISTRATION_SIGNER/);});
for(const mode of ['abort','sdk-logout'])test('pending provider prompt cancels promptly '+mode,{timeout:2000},async t=>{
 const a=actor(t),controller=new AbortController();let started;const ready=new Promise(resolve=>{started=resolve;});
 a.after(()=>{started();return new Promise(()=>{});});
 const pending=a.adapter.personal('synthetic pending prompt',{expiresAt:NOW+90,now:()=>NOW,signal:controller.signal});
 const rejection=assert.rejects(pending,/WALLET_CONTEXT_CANCELLED/);await ready;
 if(mode==='abort')controller.abort();else a.adapter.invalidate();await rejection;
});
test('synthetic same-address restoration requires fresh SIWE; logged-out session stays revoked',async t=>{
 const f=auth(t),c=f.challenge(),signature=await f.a.adapter.personal(c.message,{expiresAt:c.expiresAt,now:()=>NOW});
 const old=f.s.login({nonce:c.nonce,signature},c.browserToken),context={token:old.token,wallet:old.wallet,chainId:CHAIN,csrf:old.csrf};
 f.s.logout(context);f.a.adapter.invalidate();assert.throws(()=>f.s.whoami(context),/AUTH_REQUIRED/);
 const restored=actor(t,f.a.wallet),fresh=f.challenge();assert.notEqual(fresh.nonce,c.nonce);
 const freshSignature=await restored.adapter.personal(fresh.message,{expiresAt:fresh.expiresAt,now:()=>NOW});
 const session=f.s.login({nonce:fresh.nonce,signature:freshSignature},fresh.browserToken);
 assert.equal(session.wallet,old.wallet);assert.notEqual(session.token,old.token);assert.throws(()=>f.s.login({nonce:c.nonce,signature},c.browserToken),/AUTH_CHALLENGE/);
 await assert.rejects(f.a.adapter.personal(fresh.message,{expiresAt:fresh.expiresAt,now:()=>NOW}),/WALLET_CONTEXT_CANCELLED/);
});
test('production V2 store accepts once and rejects duplicate signing',async t=>{
 const f=await procedureFixture(t),reg=f.configuration.procedurePorts.registration;f.configuration.procedurePorts.registration=(...x)=>({...reg(...x),version:'clear-bootcamp-procedure-registration-port.2'});f.restart();
 const app=f.create();await f.complete(app);f.store.registerCurrentMetForE4(f.aliceContext,app,f.body(app),f.key());const p=f.store.getRecipientRegistration(f.aliceContext,app);
 const a=actor(t,f.alice);a.change({chainId:Number(p.payload.domain.chainId)});a.adapter.dispose();const signer=pinnedWallet({provider:a.p,identity:a.identity,readIdentity:async()=>a.identity});t.after(()=>signer.dispose());
 const sig=await signer.typed(p.payload,{expiresAt:Number(p.payload.message.deadline),now:()=>f.time});const body=f.body(app,{registrationTargetId:p.registrationTargetId,signature:sig}),key=f.key();
 const accepted=f.store.submitRecipientRegistration(f.aliceContext,app,body,key);assert.equal(accepted.record.target.signatureAccepted,true);assert.deepEqual(f.store.submitRecipientRegistration(f.aliceContext,app,body,key),accepted);assert.throws(()=>f.store.submitRecipientRegistration(f.aliceContext,app,f.body(app,{registrationTargetId:p.registrationTargetId,signature:sig}),f.key()),/ALREADY_SIGNED/);
});
