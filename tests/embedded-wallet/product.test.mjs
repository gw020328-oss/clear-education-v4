import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Wallet,id,getBytes,verifyMessage} from 'ethers';
import {pinnedWallet} from '../../src/embedded-wallet/provider-boundary.mjs';
import {createProductSession} from '../../src/embedded-wallet/product-session.mjs';
import {recipientRegistration,verifyRecipientRegistration} from '../../src/bootcamp/recipient-registration.mjs';
import {requestMessage,requestHash,POLICY_HASH,CRITERION} from '../../src/hackerrank-evidence/request.mjs';
import {productWalletMount,productSigningContext} from '../../tools/embedded-wallet/product-mount.mjs';
const CHAIN=1901234567;
function fixture(t){
 const now=Math.floor(Date.now()/1000),w=Wallet.createRandom(),provider=new EventEmitter();let calls=0,posts=0,after=()=>{},role='participant',postError=null;
 const identity={sdkUserId:'synthetic',walletId:'synthetic',address:w.address,chainId:CHAIN};
 provider.request=async({method,params})=>{if(method==='eth_accounts')return[w.address];if(method==='eth_chainId')return'0x'+CHAIN.toString(16);
  calls++;let s;if(method==='personal_sign')s=await w.signMessage(getBytes(params[0]));else if(method==='eth_signTypedData_v4'){const p=JSON.parse(params[1]);delete p.types.EIP712Domain;s=await w.signTypedData(p.domain,p.types,p.message);}else throw Error('UNEXPECTED_METHOD');after();return s;};
 const wallet=pinnedWallet({provider,identity,readIdentity:()=>identity});t.after(()=>wallet.dispose());
 const config={appId:'synthetic00001',origin:'https://127.0.0.1:9445',redirectUri:'https://127.0.0.1:9445/onboarding',phase:'ACTIVE_LOCAL_TEST',chainId:CHAIN,rpcUrl:'http://127.0.0.1:9545',instanceId:id('instance')};
 const r={version:'clear-hackerrank-request.1',audience:'fixture',participantId:'participant-fixture',participantWallet:w.address.toLowerCase(),applicationId:'application-fixture',criterionId:CRITERION,policyHash:POLICY_HASH,runtimeMappingHash:id('mapping'),trustConfigHash:id('trust'),recipeHash:id('recipe'),expectedClaimOwner:Wallet.createRandom().address.toLowerCase(),nonce:id('nonce'),issuedAt:now,expiresAt:now+120,selectedCertificateId:null};
 const source={applicationId:r.applicationId,approvalId:'approval-fixture',requestHash:requestHash(r),message:requestMessage(r),expiresAt:r.expiresAt,purpose:'HACKERRANK_EVIDENCE_OBSERVATION_NOT_PAYMENT_AUTHORIZATION'};
 const payload=recipientRegistration({chainId:CHAIN,verifyingContract:Wallet.createRandom().address,instanceId:config.instanceId,policyHash:POLICY_HASH,runtimeMappingHash:r.runtimeMappingHash,participant:w.address,applicationSalt:id('salt'),nonce:id('reg'),deadline:now+100});
 const packet={version:'clear-bootcamp-recipient-registration.1',applicationId:r.applicationId,role:'PARTICIPANT',status:'AWAITING_SIGNATURE',purpose:'REGISTER_FIXED_RECIPIENT',calldataPublic:true,registrationTargetId:'registration-fixture',payload,observedAt:now};
 const b={version:'clear-bootcamp-normal-session.1',role:'PARTICIPANT',applicationId:r.applicationId,policyHash:POLICY_HASH,runtimeMappingHash:r.runtimeMappingHash,sourceMode:'REGISTERED_TEST_SOURCE',receiptRequired:true,expectedPayment:{recipient:w.address.toLowerCase()},signingContext:{source:{...r},registration:{applicationId:r.applicationId,instanceId:config.instanceId,verifyingContract:payload.domain.verifyingContract,policyHash:POLICY_HASH,runtimeMappingHash:r.runtimeMappingHash,participant:w.address.toLowerCase()}}};
 let submitted=null;
 const session={assertSession:async()=>({wallet:w.address,role}),dispose:async()=>{},request:async(path,opts={})=>{
  if(path==='/bootcamp/v4/session')return structuredClone(b);
  if(path.endsWith('/source-signature'))return structuredClone(source);
  if(path.endsWith('/recipient-registration')){if(opts.method==='POST'){posts++;submitted=opts.body.signature;if(postError)throw postError;return{version:'clear-bootcamp-procedure-operation.1',record:{applicationId:r.applicationId},current:true,usableForPayment:false};}return structuredClone(packet);}
  throw Error('UNEXPECTED_PATH');}};
 const product=createProductSession({session,wallet,config});
 return {product,b,source,packet,config,w,r,now,get calls(){return calls;},get posts(){return posts;},get submitted(){return submitted;},after:fn=>{after=fn;},role:v=>{role=v;},failPost:e=>{postError=e;}};
}
test('product source uses independent owner anchors and exact reviewed message',async t=>{const f=fixture(t);const s=await f.product.bridge.sign(f.source.message);assert.equal(verifyMessage(f.source.message,s),f.w.address);assert.equal(f.calls,1);assert.equal(f.posts,0);});
test('source owner mismatch and unreviewed message never prompt wallet',async t=>{const f=fixture(t);await assert.rejects(f.product.bridge.sign('other'),/SOURCE_STALE/);f.b.signingContext.source.expectedClaimOwner=f.w.address.toLowerCase();await assert.rejects(f.product.bridge.sign(f.source.message),/SOURCE_BINDING/);assert.equal(f.calls,0);});
test('operator cannot sign source or recipient registration',async t=>{const f=fixture(t);f.role('operator');f.b.role='OPERATOR';await assert.rejects(f.product.bridge.sign(f.source.message),/FORBIDDEN/);await assert.rejects(f.product.readRegistration(),/FORBIDDEN/);assert.equal(f.calls,0);});
test('product instance differs from bootstrap fails before signature',async t=>{const f=fixture(t);f.b.signingContext.registration.instanceId=id('other');await assert.rejects(f.product.bridge.sign(f.source.message),/PRODUCT_BINDING/);assert.equal(f.calls,0);});
test('registration requires a read, signs exact V2 payload and submits once',async t=>{const f=fixture(t);await assert.rejects(f.product.submitRegistration(f.packet),/REGISTRATION_REVIEW_REQUIRED/);const p=await f.product.readRegistration();assert.equal(f.calls,0);await f.product.submitRegistration(p);assert.equal(f.posts,1);assert.equal(f.calls,1);verifyRecipientRegistration(p.payload,f.submitted,{applicationOwner:f.w.address,nowSeconds:f.now,sourceValidUntilExclusive:f.now+120});await assert.rejects(f.product.submitRegistration(p),/REGISTRATION_REVIEW_REQUIRED/);});
test('changed recipient registration packet during prompt cannot be submitted',async t=>{const f=fixture(t);const p=await f.product.readRegistration();f.after(()=>{f.packet.decisionRevision=99;});await assert.rejects(f.product.submitRegistration(p),/REGISTRATION_STALE/);assert.equal(f.posts,0);});
test('lost registration POST response blocks another signature or retry',async t=>{const f=fixture(t);const p=await f.product.readRegistration();f.failPost(Object.assign(Error('TRANSPORT'),{outcome:'UNKNOWN'}));await assert.rejects(f.product.submitRegistration(p));assert.equal(f.product.registrationUnknown,true);await assert.rejects(f.product.readRegistration());assert.equal(f.posts,1);assert.equal(f.calls,1);});
test('cancel after signature does not submit registration',async t=>{const f=fixture(t),a=new AbortController(),p=await f.product.readRegistration();f.after(()=>a.abort());await assert.rejects(f.product.submitRegistration(p,{signal:a.signal}));assert.equal(f.posts,0);});
test('diagnostic phase cannot instantiate a product session',async t=>{const f=fixture(t);assert.throws(()=>createProductSession({config:{...f.config,phase:'AUTH_LOCAL_TEST'}}),/PRODUCT_NOT_ACTIVE/);});
test('already authenticated product bridge rejects old chain or RPC',async t=>{const f=fixture(t),host={...f.config,network:{chainId:'0x'+CHAIN.toString(16),rpcUrls:[f.config.rpcUrl]}};assert.equal((await f.product.bridge.login(host)).role,'participant');await assert.rejects(f.product.bridge.login({...host,chainId:CHAIN+1}),/PRODUCT_HOST_CHANGED/);});
test('mount is opt-in, runtime required, narrow CSP and no signing routes added',()=>{
 const assets=new Map(),origin='https://127.0.0.1:9445',network={rpcUrls:['http://127.0.0.1:9545']},runtime={instanceId:id('instance')};
 assert.equal(productWalletMount({assets,origin,chainId:CHAIN}),null);
 assets.set('/clear-wallet-app.html',{body:Buffer.from('<meta name="clear-wallet-app" content="synthetic00001">\n')});
 assert.throws(()=>productWalletMount({assets,origin,chainId:CHAIN,network,runtime}));
 for(const p of ['/assets/onboarding.js','/assets/operator.js'])assets.set(p,{body:Buffer.from('')});
 const m=productWalletMount({assets,origin,chainId:CHAIN,network,runtime}),headers={};let body='';const res={setHeader:(k,v)=>{headers[k]=v;},writeHead:()=>{},end:b=>{body=b;}};
 assert.equal(m.handle({method:'GET',url:'/onboarding?code=redacted'},res),true);assert.match(body,/sc-nonce/);assert.match(headers['Content-Security-Policy'],/https:\/\/auth.privy.io/);assert.doesNotMatch(headers['Content-Security-Policy'],/unsafe-|\*/);assert.equal(m.handle({method:'POST',url:'/auth/verify'},res),false);
 assert.equal(m.config.instanceId,runtime.instanceId);assert.equal(m.config.phase,'ACTIVE_LOCAL_TEST');
 assert.throws(()=>productWalletMount({assets,origin,chainId:CHAIN,network,runtime:null}));
});
test('server anchors use runtime and collector pins, never participant as proof owner',()=>{
 const participant='0x'+'11'.repeat(20),pins={expectedClaimOwner:'0x'+'22'.repeat(20),selectedCertificateId:null};
 const runtime={instanceId:id('realm'),vaultAddress:'0x'+'33'.repeat(20),policyHash:POLICY_HASH,runtimeMappingHash:id('mapping')};
 assert.equal(productSigningContext({applicationId:null}),null);
 const c=productSigningContext({runtime,pins,applicationId:'application-fixture',participantId:'participant-fixture',participant});
 assert.equal(c.source.expectedClaimOwner,pins.expectedClaimOwner);assert.equal(c.registration.participant,participant);assert.equal(c.registration.verifyingContract,runtime.vaultAddress);
});
