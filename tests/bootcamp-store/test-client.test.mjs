import {execFileSync} from 'node:child_process';
// Invented wallets/source only. Existing HTTPS auth/store and the actual browser transport/controller run together.
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter,once} from 'node:events';
import {request} from 'node:https';import {mkdirSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {toUtf8String,getBytes} from 'ethers';
import {procedureFixture,START} from './procedure-fixture.mjs';import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createBootcampFrontendServer} from '../../tools/bootcamp/frontend-server.mjs';import {createNormalUiSession} from '../../src/bootcamp/ui-session.mjs';
import {P0_POLICY,p0PolicyHash} from '../../specs/bootcamp/p0-contract.mjs';
import {createNormalBootcampClient} from '../../src/bootcamp/normal-client.mjs';import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {createTestWalletSession} from '../../tools/bootcamp/test-client/session.js';import {createTestDriver,createTestAutoReader} from '../../tools/bootcamp/test-client/driver.js';
const historicalAsset=p=>execFileSync('git',['show','1421c5ff2105694461f6d470d6b0127d4fd11ce2:'+p]);
const historicalRuntime=p=>p.startsWith('tools/bootcamp/test-client/')||p==='src/bootcamp/normal-client.mjs';
const root=new URL('../../tools/bootcamp/test-client/',import.meta.url);
async function fixture(t){
 const f=await procedureFixture(t),H=x=>p0Hash('TEST-CLIENT-OFFLINE',x),pins={dataMode:'RECLAIM_SIGNED_RECORD',audience:'test-client',trustConfigHash:H('trust'),recipeHash:H('recipe'),expectedClaimOwner:f.alice.address.toLowerCase(),selectedCertificateId:null};let bound=null;
 const ui=createNormalUiSession({authentication:f.service,participantWallet:f.alice.address.toLowerCase(),operatorWallet:f.operator.address.toLowerCase(),getApplication:(c,a)=>f.store.getApplication(c,a),now:()=>f.time});
 const normalUi={getSession(c){const a=ui.authorize(c);if(bound)f.store.getOperationsProjection(c,bound);return {version:'clear-bootcamp-normal-session.1',role:a.role.toUpperCase(),applicationId:bound,phase:'AWAITING_AUTHENTICATED_APP_CONSENTS',
  policyHash:p0PolicyHash(P0_POLICY),runtimeMappingHash:H('unused'),sourceMode:'REGISTERED_TEST_SOURCE',receiptRequired:true,
  expectedPayment:{recipient:f.alice.address.toLowerCase(),token:'0x'+'33'.repeat(20),amountAtoms:'100000000',symbol:'TEST',decimals:6}};},
  bindParticipant(c,a){ui.bindParticipant(c,a,pins);bound=a;return {applicationId:a,paymentAuthorization:false};},pendingSignature:c=>ui.pendingSignature(c),submitSignature:(c,a,b)=>ui.submitSignature(c,b)};
 // Resolve genuine per-application metadata after binding, exactly as the host does.
 let receiptOverride=null;normalUi.getPaymentReceipt=(c,a)=>{const o=f.store.getOperationsProjection(c,a);return receiptOverride??{version:'clear-bootcamp-normal-payment-receipt.1',applicationId:a,role:o.role,expectedPayment:{amountAtoms:'100000000',symbol:'TEST',decimals:6},claim:{state:'NOT_OBSERVED',canonical:null,finalized:null,transferAmountAtoms:null},balance:{receivedAtoms:null,exactExpectedAmountVerified:null}};};
 const original=normalUi.getSession;normalUi.getSession=c=>{const r=original(c);if(bound){const v=f.store.getOperationsProjection(c,bound);r.runtimeMappingHash=v.runtimeMappingHash;}return r;};
 const dir=join(f.directory,'test-client-tls');mkdirSync(dir,{mode:0o700});const fp=createCertificates(dir);
 const mounted=createBootcampFrontendServer({authentication:f.service,store:f.store,tls:loadTls(dir,fp),sourceMode:'REGISTERED_TEST_SOURCE',chainId:f.config.chainId,normalUi,webRoot:fileURLToPath(root).replace(/\/$/,'')});
 mounted.server.listen(0,'127.0.0.1');await once(mounted.server,'listening');t.after(async()=>{mounted.server.closeAllConnections();await new Promise(r=>mounted.server.close(r));await mounted.drain();ui.close();});
 function browser(wallet){
  const provider=new EventEmitter(),counts={signs:0,posts:0,logout:null,writes:[]},cookies=new Map();let account=wallet.address,hook=async()=>{},walletHook=async()=>{},losePath=null;
  provider.request=async({method,params})=>{await walletHook(method,params);if(['eth_requestAccounts','eth_accounts'].includes(method))return [account];if(method==='eth_chainId')return '0x'+f.config.chainId.toString(16);
   if(method==='wallet_addEthereumChain')return null;if(method==='personal_sign'){counts.signs++;return wallet.signMessage(getBytes(params[0]));}throw Error('unexpected wallet call');};
  const fetchImpl=async(url,options)=>{await hook(new URL(url).pathname,options);assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');if(options.method==='POST'){counts.posts++;if(new URL(url).pathname.startsWith('/bootcamp/'))counts.writes.push({path:new URL(url).pathname,key:options.headers['idempotency-key'],body:options.body});}
   return new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',servername:'localhost',port:mounted.server.address().port,path:new URL(url).pathname,method:options.method,signal:options.signal,
    ca:readFileSync(join(dir,'ca.pem')),headers:{host:'clear.example.invalid','sec-fetch-site':'same-origin',...(options.method==='POST'?{origin:f.config.origin}:{}),
     ...options.headers,cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')}},res=>{for(const c of res.headers['set-cookie']??[]){const [k,v]=c.split(';')[0].split('=');if(v)cookies.set(k,v);else cookies.delete(k);}const chunks=[];
     res.on('data',c=>chunks.push(c));res.on('end',()=>{if(new URL(url).pathname==='/auth/logout'){const r=JSON.parse(Buffer.concat(chunks));counts.logout={status:res.statusCode,code:r.code??r.error??null,loggedOut:r.loggedOut??false};}if(losePath===new URL(url).pathname){losePath=null;reject(Error('SYNTHETIC_RESPONSE_LOST_AFTER_COMMIT'));return;}resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:{'content-type':res.headers['content-type']}}));});});req.on('error',reject);req.end(options.body);});};
  let ended=0;const session=createTestWalletSession({origin:f.config.origin,provider,fetchImpl,now:()=>f.time*1000,onEnd:()=>ended++}),driver=createTestDriver({session,createNormalClient:createNormalBootcampClient,now:()=>f.time*1000});
  t.after(()=>session.dispose());return {provider,session,driver,counts,cookies,get ended(){return ended;},setAccount:x=>{account=x;provider.emit('accountsChanged',[x]);},setHook:x=>{hook=x;},setWalletHook:x=>{walletHook=x;},loseNext:x=>{losePath=x;},fetchImpl};
 }
 return {f,browser,ui,pins,mounted,setReceipt:value=>{receiptOverride=value;}};
}
test('static test assets are same-origin and two real HTTPS login sessions create/bind/read one app',async t=>{
 const x=await fixture(t),a=x.browser(x.f.alice),o=x.browser(x.f.operator);
 for(const b of [a,o]){await b.driver.config();assert.equal(b.counts.signs,0);await b.driver.login();assert.equal(b.counts.signs,1);}
 await assert.rejects(o.driver.create(),/TEST_PARTICIPANT_ONLY/);await a.driver.create();const app=a.driver.snapshot().applicationId;await a.driver.bind();await o.driver.refresh();
 assert.equal(o.driver.snapshot().applicationId,app);assert.equal(o.driver.snapshot().bootstrap.role,'OPERATOR');
 const html=await a.fetchImpl(x.f.config.origin+'/',{method:'GET',headers:{},credentials:'same-origin',redirect:'error'});assert.equal(await html.text(),readFileSync(new URL('index.html',root),'utf8'));
 for(const path of ['main.js','driver.js','session.js','style.css']){const r=await a.fetchImpl(x.f.config.origin+'/'+path,{method:'GET',headers:{},credentials:'same-origin',redirect:'error'});assert.equal(r.status,200);assert.equal(await r.text(),readFileSync(new URL(path,root),'utf8'));}
});
test('displayed P1 is signed only on the second explicit action and never after expiry',async t=>{
 const x=await fixture(t),a=x.browser(x.f.alice);await a.driver.config();await a.driver.login();await a.driver.create();await a.driver.bind();
 const app=a.driver.snapshot().applicationId,v=x.f.store.getApplication(x.f.aliceContext,app),expected={version:'clear-hackerrank-request.1',...x.pins,applicationId:app,participantId:v.participantId,participantWallet:x.f.alice.address.toLowerCase(),criterionId:'python-basic-certificate',policyHash:v.policyHash,runtimeMappingHash:v.runtimeMappingHash,nonce:p0Hash('TEST','nonce'),issuedAt:START,expiresAt:START+240};delete expected.dataMode;
 const {requestMessage}=await import('../../src/hackerrank-evidence/request.mjs');const pending=x.ui.requestSignature(expected,requestMessage(expected));pending.catch(()=>{});
 await a.driver.approval();assert.equal(a.counts.signs,1);const shown=a.driver.snapshot().approval.message;assert.equal(shown,requestMessage(expected));await a.driver.sign();assert.equal(a.counts.signs,2);assert.equal(toUtf8String(getBytes('0x'+Buffer.from(shown).toString('hex'))),shown);assert.match(await pending,/^0x/);
 await assert.rejects(a.driver.sign(),/TEST_APPROVAL_EXPIRED/);assert.equal(a.counts.signs,2);
});
test('both users explicitly consent through normal client, stale view is rejected and new read is required',async t=>{
 const x=await fixture(t),a=x.browser(x.f.alice),o=x.browser(x.f.operator);for(const b of [a,o]){await b.driver.config();await b.driver.login();}
 await a.driver.create();await a.driver.bind();const app=a.driver.snapshot().applicationId;await x.f.complete(app);x.f.publish(app);
 await a.driver.refresh();await o.driver.refresh();assert.deepEqual(a.driver.snapshot().view.target,o.driver.snapshot().view.target);
 await a.driver.consent('AGREE');await assert.rejects(o.driver.consent('AGREE'),e=>e.code==='BC_VIEW_STALE');assert.equal(o.driver.snapshot().view,null);
 await o.driver.refresh();await o.driver.consent('AGREE');await a.driver.refresh();assert.equal(a.driver.snapshot().view.consent.bothCurrent,true);
});
test('wallet account event aborts local authority and revokes original HTTPS server session',async t=>{
 const x=await fixture(t),a=x.browser(x.f.alice);await a.driver.config();await a.driver.login();const token=a.cookies.get('__Host-clear-session');a.setAccount(x.f.bob.address);
 for(let i=0;i<50&&a.counts.logout===null;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(a.ended,1);assert.deepEqual(a.counts.logout,{status:200,code:null,loggedOut:true});assert.throws(()=>x.f.service.whoami({token,wallet:x.f.alice.address,chainId:x.f.config.chainId,csrf:null}),/AUTH_REQUIRED/);
 await assert.rejects(a.driver.login());
});
test('transport bounds errors, rejects privileged/foreign routes, discards cancelled late responses and never retries writes',async()=>{
 let calls=0;const s=createTestWalletSession({origin:'https://127.0.0.1:9445',provider:null,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({error:'BC_NORMAL_PROCEDURE_NOT_READY'}),{status:409,headers:{'content-type':'application/json'}});}});
 await assert.rejects(s.publicRead('/__dev/config'),e=>e.code==='BC_NORMAL_PROCEDURE_NOT_READY');assert.equal(calls,1);
 for(const p of ['https://else.invalid/','/rpc','/__dev/config?key=x'])await assert.rejects(s.publicRead(p),/TEST_ROUTE/);assert.equal(calls,1);
 let release;const controller=new AbortController(),late=createTestWalletSession({origin:'https://127.0.0.1:9445',provider:null,fetchImpl:()=>new Promise(r=>release=r)});
 const p=late.publicRead('/__dev/config',{signal:controller.signal});await new Promise(r=>setImmediate(r));controller.abort();await assert.rejects(p,e=>e.code==='TEST_CANCELLED');release(new Response('{}',{headers:{'content-type':'application/json'}}));await late.end();
});

test('lost create and consent replies retain exact explicit replay keys without adding a second command',async t=>{
 const x=await fixture(t),a=x.browser(x.f.alice);await a.driver.config();await a.driver.login();a.loseNext('/bootcamp/v1/applications');
 await assert.rejects(a.driver.create(),e=>e.outcome==='UNKNOWN');assert.equal(a.driver.snapshot().applicationId,null);const afterCreate=x.f.counts();
 await a.driver.create();assert.deepEqual(x.f.counts(),afterCreate);assert.deepEqual(a.counts.writes[0],a.counts.writes[1]);await a.driver.bind();
 const app=a.driver.snapshot().applicationId;await x.f.complete(app);x.f.publish(app);await a.driver.refresh();a.loseNext('/bootcamp/v3/applications/'+app+'/review-consents');
 await assert.rejects(a.driver.consent('AGREE'),e=>e.outcome==='UNKNOWN');assert.equal(a.driver.snapshot().consentReplayPending,true);const afterConsent=x.f.counts();
 await a.driver.refresh();await assert.rejects(a.driver.consent('AGREE'),/TEST_REFRESH_BEFORE_CONSENT/);await a.driver.replayConsent();assert.deepEqual(x.f.counts(),afterConsent);
 const writes=a.counts.writes.filter(w=>w.path.endsWith('/review-consents'));assert.deepEqual(writes[0],writes[1]);assert.equal(x.f.view(app).consent.records.length,1);
});
test('cancelled wallet prompt returns no late signature POST and expired approval never opens a prompt',async t=>{
 for(const expired of [false,true]){
  const x=await fixture(t),a=x.browser(x.f.alice);await a.driver.config();await a.driver.login();await a.driver.create();await a.driver.bind();const app=a.driver.snapshot().applicationId,v=x.f.store.getApplication(x.f.aliceContext,app);
  const expected={version:'clear-hackerrank-request.1',...x.pins,applicationId:app,participantId:v.participantId,participantWallet:x.f.alice.address.toLowerCase(),criterionId:'python-basic-certificate',policyHash:v.policyHash,runtimeMappingHash:v.runtimeMappingHash,nonce:p0Hash('TEST','nonce'),issuedAt:START,expiresAt:START+240};delete expected.dataMode;
  const {requestMessage}=await import('../../src/hackerrank-evidence/request.mjs');const pending=x.ui.requestSignature(expected,requestMessage(expected));pending.catch(()=>{});await a.driver.approval();
  if(expired){x.f.setTime(START+241);await assert.rejects(a.driver.sign(),/TEST_APPROVAL_EXPIRED/);assert.equal(a.counts.signs,1);}
  else{let release,entered;const enteredPromise=new Promise(r=>entered=r);a.setWalletHook(async method=>{if(method==='personal_sign'){entered();await new Promise(r=>release=r);}});
   const signing=a.driver.sign();await enteredPromise;a.driver.cancel();await assert.rejects(signing);release();await new Promise(r=>setImmediate(r));}
  assert.equal(a.counts.writes.filter(w=>w.path.endsWith('/source-signature')).length,0);
 }
});
test('prepared phase never connects a wallet or posts an application',async()=>{
 let walletCalls=0,fetchCalls=0;const session=createTestWalletSession({origin:'https://127.0.0.1:9445',provider:{request(){walletCalls++;}},fetchImpl:async()=>{fetchCalls++;return Response.json({version:'clear-bootcamp-frontend-host.1',sourceMode:'REGISTERED_TEST_SOURCE',phase:'PREPARED_NOT_ACTIVATED',origin:'https://127.0.0.1:9445',chainId:null,network:null,productionEnabled:false});}});
 const driver=createTestDriver({session,createNormalClient:createNormalBootcampClient});await driver.config();await assert.rejects(driver.login(),/TEST_LOGIN_NOT_READY/);await assert.rejects(driver.create());assert.equal(walletCalls,0);assert.equal(fetchCalls,1);
});

test('receipt display keeps null and clears a formerly verified result when a later read is invalid',async t=>{
 const x=await fixture(t),a=x.browser(x.f.alice);await a.driver.config();await a.driver.login();await a.driver.create();await a.driver.bind();await a.driver.receipt();
 assert.equal(a.driver.snapshot().receipt.balance.receivedAtoms,null);const app=a.driver.snapshot().applicationId;
 const receipt={version:'clear-bootcamp-normal-payment-receipt.1',applicationId:app,role:'PARTICIPANT',expectedPayment:{amountAtoms:'100000000',symbol:'TEST',decimals:6},claim:{state:'INCLUDED',canonical:true,finalized:false,transferAmountAtoms:'100000000'},balance:{receivedAtoms:'100000000',exactExpectedAmountVerified:true}};
 x.setReceipt(receipt);await a.driver.receipt();assert.equal(a.driver.snapshot().receipt.claim.finalized,false);
 x.setReceipt({...receipt,balance:{receivedAtoms:null,exactExpectedAmountVerified:null}});await assert.rejects(a.driver.receipt(),/BC_NORMAL_RECEIPT/);assert.equal(a.driver.snapshot().receipt,null);
});
test('missing CSRF stops consent and revokes the original session instead of retrying or reauthenticating',async t=>{
 const x=await fixture(t),a=x.browser(x.f.alice);await a.driver.config();await a.driver.login();await a.driver.create();await a.driver.bind();const app=a.driver.snapshot().applicationId;
 await x.f.complete(app);x.f.publish(app);await a.driver.refresh();const before=a.counts.posts,token=a.cookies.get('__Host-clear-session');
 a.setHook(async(path,o)=>{if(path.endsWith('/review-consents'))delete o.headers['x-csrf-token'];});
 await assert.rejects(a.driver.consent('AGREE'),e=>e.code==='CSRF');assert.equal(x.f.view(app).consent.records.length,0);assert.equal(a.counts.posts,before+2);
 assert.throws(()=>x.f.service.whoami({token,wallet:x.f.alice.address,chainId:x.f.config.chainId,csrf:null}),/AUTH_REQUIRED/);assert.equal(a.ended,1);
});
test('network button only offers the supplied loopback TEST chain and rejected wallet requests are not repeated',async()=>{
 const calls=[],provider={request:async x=>{calls.push(x);throw Object.assign(Error('synthetic user rejection'),{code:4001});}},session=createTestWalletSession({origin:'https://127.0.0.1:9445',provider});
 const config={origin:'https://127.0.0.1:9445',phase:'ACTIVE_LOCAL_TEST',sourceMode:'REGISTERED_TEST_SOURCE',chainId:123,network:{chainId:'0x7b',rpcUrls:['http://127.0.0.1:19999']}};
 await assert.rejects(session.network({...config,network:{...config.network,rpcUrls:['https://public.invalid']}}),/TEST_NETWORK/);assert.equal(calls.length,0);
 await assert.rejects(session.network(config),/TEST_WALLET_REJECTED/);assert.equal(calls.length,1);assert.equal(calls[0].method,'wallet_addEthereumChain');assert.deepEqual(calls[0].params[0].nativeCurrency,{name:'Local test Ether',symbol:'ETH',decimals:18});
});
test('exact test-client asset generation preserves every existing v10 core source and contract input',async()=>{
 const {createHash}=await import('node:crypto'),{assetSnapshot}=await import('../../tools/bootcamp/normal-host-config.mjs'),sha=p=>createHash('sha256').update(historicalRuntime(p)?historicalAsset(p):readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const manifest=JSON.parse(readFileSync(new URL('../../docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V2.json',import.meta.url)));
 assert.equal(sha('docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V2.json'),'6ca6c41575def55fe59a58e328cde2dc793551f95757add9eb6342127bf0422b');assert.equal(manifest.version,'clear-bootcamp-backend-test-client-assets.2');assert.equal(manifest.productFrontendAccepted,false);assert.equal(manifest.actualExecutionApprovedByThisRecord,false);assert.equal(manifest.apiContractsChanged,false);
 const previous=JSON.parse(readFileSync(new URL('../../'+manifest.previousRecord.path,import.meta.url)));assert.equal(sha(manifest.previousRecord.path),'6e3f89fa45b3e22d84cfdcee11617c7cf4e75c4bbdf1d2bfec0eeabd30111e89');
 const {execFileSync}=await import('node:child_process');for(const [p,h]of Object.entries(previous.sourceArtifacts))assert.equal(createHash('sha256').update(execFileSync('git',['show',manifest.previousRecord.sourceHead+':'+p])).digest('hex'),h,p);
 assert.deepEqual(manifest.changedFromV1,['tools/bootcamp/test-client/session.js']);for(const [p,h]of Object.entries(previous.sourceArtifacts)){assert.equal(manifest.sourceArtifacts[p],manifest.sourceDelta[p]?.after??h,p);if(manifest.sourceDelta[p])assert.equal(manifest.sourceDelta[p].before,h,p);}
 assert.equal(Object.keys(manifest.sourceArtifacts).length,5);for(const [path,h]of Object.entries(manifest.sourceArtifacts))assert.equal(sha(path),h,path);
 const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
 const oldSnapshot=Buffer.concat([Buffer.from('/\ntext/html; charset=utf-8\n'),historicalAsset('tools/bootcamp/test-client/index.html'),...Object.keys(manifest.sourceArtifacts).sort().flatMap(p=>{const name='/'+p.split('/').at(-1);return [Buffer.from(name+'\n'+types[p.split('.').at(-1)]+'\n'),historicalAsset(p)];})]);
 assert.equal(createHash('sha256').update(oldSnapshot).digest('hex'),manifest.publicAssetSnapshotSha256);assert.equal(sha(manifest.normalClient.path),manifest.normalClient.sha256);
 assert.equal(sha(manifest.existingCoreIntake.path),'823761592e8178e682ad2f2c39dd6d95423dcbcebad9ffdd15bb2ccfb4424ba8');
 const v10=JSON.parse(readFileSync(new URL('../../'+manifest.existingCoreIntake.path,import.meta.url)));assert.equal(Object.keys(v10.sourceArtifactSha256).length,159);for(const [path,h]of Object.entries(v10.sourceArtifactSha256))assert.equal(createHash('sha256').update(execFileSync('git',['show','944afafda1543cff70cb257915ccd7d7a0fa8cf3:'+path])).digest('hex'),h,path);
});
test('duplicate wallet notifications from initial connection keep the same authority, real chain change revokes it',async t=>{
 const x=await fixture(t),a=x.browser(x.f.alice);await a.driver.config();await a.driver.login();a.provider.emit('accountsChanged',[x.f.alice.address]);a.provider.emit('chainChanged','0x'+x.f.config.chainId.toString(16));
 await a.driver.refresh();assert.equal(a.ended,0);const token=a.cookies.get('__Host-clear-session');a.provider.emit('chainChanged','0x1');
 for(let i=0;i<50&&a.counts.logout===null;i++)await new Promise(r=>setTimeout(r,5));assert.equal(a.ended,1);assert.deepEqual(a.counts.logout,{status:200,code:null,loggedOut:true});
 assert.throws(()=>x.f.service.whoami({token,wallet:x.f.alice.address,chainId:x.f.config.chainId,csrf:null}),/AUTH_REQUIRED/);
});

test('v3 preserves v2 browser bytes and consumes only the exact reviewed v11 host source delta',async()=>{
 const {createHash}=await import('node:crypto'),sha=p=>createHash('sha256').update(historicalRuntime(p)?historicalAsset(p):readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const path='docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V3.json';assert.equal(sha(path),'6ad8e4de3ea7dcfad2527f4738a6ab16c284feb2b0087f95d0f060e9f21552a2');
 const manifest=JSON.parse(readFileSync(new URL('../../'+path,import.meta.url))),previous=JSON.parse(readFileSync(new URL('../../'+manifest.previousRecord.path,import.meta.url)));
 assert.equal(manifest.version,'clear-bootcamp-backend-test-client-assets.3');assert.equal(sha(manifest.previousRecord.path),'6ca6c41575def55fe59a58e328cde2dc793551f95757add9eb6342127bf0422b');
 assert.deepEqual(manifest.changedFromV2,[]);assert.deepEqual(manifest.sourceDelta,{});assert.deepEqual(manifest.sourceArtifacts,previous.sourceArtifacts);assert.equal(manifest.publicAssetSnapshotSha256,previous.publicAssetSnapshotSha256);
 for(const [p,h]of Object.entries(manifest.sourceArtifacts))assert.equal(sha(p),h,p);
 assert.equal(manifest.apiContractsChanged,false);assert.equal(manifest.productFrontendAccepted,false);assert.equal(manifest.actualExecutionApprovedByThisRecord,false);
 assert.equal(sha(manifest.existingCoreIntake.path),'55c2986611b5ed0b3df69cc2e5294e3932715a847649ca5adc36f4f52146b65d');
 const intake=JSON.parse(readFileSync(new URL('../../'+manifest.existingCoreIntake.path,import.meta.url)));assert.equal(Object.keys(intake.sourceArtifactSha256).length,159);
 assert.deepEqual(intake.changedFromV10,['tools/bootcamp/live-context.mjs']);for(const [p,h]of Object.entries(intake.sourceArtifactSha256))assert.equal(createHash('sha256').update(execFileSync('git',['show','85212551fd8e86b22b2c0c0b3525100e9579f2f7:'+p])).digest('hex'),h,p);
});

test('v4 keeps all browser/API bytes and consumes exact v12 diagnostics sources',async()=>{
 const {createHash}=await import('node:crypto'),sha=p=>createHash('sha256').update(historicalRuntime(p)?historicalAsset(p):readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const path='docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V4.json';assert.equal(sha(path),'526d276b5a587698235c759190a65f6e373d1a92676ee3b65de38891a6d452e8');
 const m=JSON.parse(readFileSync(new URL('../../'+path,import.meta.url))),old=JSON.parse(readFileSync(new URL('../../'+m.previousRecord.path,import.meta.url)));
 assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.4');assert.equal(sha(m.previousRecord.path),'6ad8e4de3ea7dcfad2527f4738a6ab16c284feb2b0087f95d0f060e9f21552a2');
 assert.deepEqual(m.changedFromV3,[]);assert.deepEqual(m.sourceDelta,{});assert.deepEqual(m.sourceArtifacts,old.sourceArtifacts);assert.deepEqual(m.normalClient,old.normalClient);assert.equal(m.publicAssetSnapshotSha256,old.publicAssetSnapshotSha256);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 for(const k of ['apiContractsChanged','productFrontendAccepted','actualExecutionApprovedByThisRecord'])assert.equal(m[k],false);
 assert.equal(sha(m.existingCoreIntake.path),'ed279c819aab1bc91b8cb15b3c1f974e9a42df5feaf038e4270e89a7b1d49bcd');
 const intake=JSON.parse(readFileSync(new URL('../../'+m.existingCoreIntake.path,import.meta.url)));assert.equal(Object.keys(intake.sourceArtifactSha256).length,160);
 for(const [p,h]of Object.entries(intake.sourceArtifactSha256))assert.equal(createHash('sha256').update(execFileSync('git',['show','18bbb2455de6971558077b4ab9a77c27008b5ba4:'+p])).digest('hex'),h,p);
});

test('v5 preserves browser/API bytes and consumes only the exact v13 signature wait fix',async()=>{
 const {createHash}=await import('node:crypto'),sha=p=>createHash('sha256').update(historicalRuntime(p)?historicalAsset(p):readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const path='docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V5.json';assert.equal(sha(path),'eae6cc99de3382036e62da9ff6a9de530e8da5ea4dc5528a419c8e66b5cb4f8b');
 const m=JSON.parse(readFileSync(new URL('../../'+path,import.meta.url))),old=JSON.parse(readFileSync(new URL('../../'+m.previousRecord.path,import.meta.url)));
 assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.5');assert.equal(sha(m.previousRecord.path),'526d276b5a587698235c759190a65f6e373d1a92676ee3b65de38891a6d452e8');
 assert.deepEqual(m.changedFromV4,[]);assert.deepEqual(m.sourceDelta,{});assert.deepEqual(m.sourceArtifacts,old.sourceArtifacts);assert.deepEqual(m.normalClient,old.normalClient);assert.equal(m.publicAssetSnapshotSha256,old.publicAssetSnapshotSha256);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 for(const k of ['apiContractsChanged','productFrontendAccepted','actualExecutionApprovedByThisRecord'])assert.equal(m[k],false);
 assert.equal(sha(m.existingCoreIntake.path),'611a62d521854c8bd89a4eb7584c6deae71a7346d7b62c2409580f622d9d7880');
 const intake=JSON.parse(readFileSync(new URL('../../'+m.existingCoreIntake.path,import.meta.url)));assert.equal(Object.keys(intake.sourceArtifactSha256).length,160);
 for(const [p,h]of Object.entries(intake.sourceArtifactSha256))assert.equal(createHash('sha256').update(execFileSync('git',['show','d678464fec400b01767aaaf2cbc7130e805c27be:'+p])).digest('hex'),h,p);
});

test('v6 preserves browser/API bytes and consumes only exact v14 SDK diagnostics',async()=>{
 const {createHash}=await import('node:crypto'),sha=p=>createHash('sha256').update(historicalRuntime(p)?historicalAsset(p):readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const path='docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V6.json';assert.equal(sha(path),'f7e16794b7e9963fdcc18428cf619de4bce4c836cbaddb66f76bb9b0cf41ffa9');
 const m=JSON.parse(readFileSync(new URL('../../'+path,import.meta.url))),old=JSON.parse(readFileSync(new URL('../../'+m.previousRecord.path,import.meta.url)));
 assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.6');assert.equal(sha(m.previousRecord.path),'eae6cc99de3382036e62da9ff6a9de530e8da5ea4dc5528a419c8e66b5cb4f8b');
 assert.deepEqual(m.changedFromV5,[]);assert.deepEqual(m.sourceDelta,{});assert.deepEqual(m.sourceArtifacts,old.sourceArtifacts);assert.deepEqual(m.normalClient,old.normalClient);assert.equal(m.publicAssetSnapshotSha256,old.publicAssetSnapshotSha256);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 for(const k of ['apiContractsChanged','productFrontendAccepted','actualExecutionApprovedByThisRecord'])assert.equal(m[k],false);
 assert.equal(sha(m.existingCoreIntake.path),'7f558777c3550522db9880359054f387d38460f4d487bceb708d2bfb1b3411de');
 const intake=JSON.parse(readFileSync(new URL('../../'+m.existingCoreIntake.path,import.meta.url)));assert.equal(Object.keys(intake.sourceArtifactSha256).length,160);
 for(const [p,h]of Object.entries(intake.sourceArtifactSha256))assert.equal(createHash('sha256').update(execFileSync('git',['show','4b0a1063cc442f331510c1a0ed9e65bbbd570daf:'+p])).digest('hex'),h,p);
});

test('v7 preserves browser/API bytes and consumes exact v15 transport boundaries',async()=>{
 const {createHash}=await import('node:crypto'),sha=p=>createHash('sha256').update(historicalRuntime(p)?historicalAsset(p):readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const path='docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V7.json';assert.equal(sha(path),'98775a866470b75cde59e154fd476cd25be9a1c6e7630d24702ef87e37c3ea5b');
 const m=JSON.parse(readFileSync(new URL('../../'+path,import.meta.url))),old=JSON.parse(readFileSync(new URL('../../'+m.previousRecord.path,import.meta.url)));
 assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.7');assert.equal(sha(m.previousRecord.path),'f7e16794b7e9963fdcc18428cf619de4bce4c836cbaddb66f76bb9b0cf41ffa9');
 assert.deepEqual(m.changedFromV6,[]);assert.deepEqual(m.sourceDelta,{});assert.deepEqual(m.sourceArtifacts,old.sourceArtifacts);assert.deepEqual(m.normalClient,old.normalClient);assert.equal(m.publicAssetSnapshotSha256,old.publicAssetSnapshotSha256);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 for(const k of ['apiContractsChanged','productFrontendAccepted','actualExecutionApprovedByThisRecord'])assert.equal(m[k],false);
 assert.equal(sha(m.existingCoreIntake.path),'6b5c80282fba406a3097f81b568b400ef22636bdf481c5ae3d400176c3e06887');
 const intake=JSON.parse(readFileSync(new URL('../../'+m.existingCoreIntake.path,import.meta.url)));assert.equal(Object.keys(intake.sourceArtifactSha256).length,161);
 for(const [p,h]of Object.entries(intake.sourceArtifactSha256))assert.equal(createHash('sha256').update(execFileSync('git',['show','0b9091f299f7ab56a622a8b3db7a976c529f6eca:'+p])).digest('hex'),h,p);
});

test('v8 preserves browser/API bytes and consumes exact v16 bounded send policy',async()=>{
 const {createHash}=await import('node:crypto'),sha=p=>createHash('sha256').update(historicalRuntime(p)?historicalAsset(p):readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const path='docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V8.json';assert.equal(sha(path),'fce4314fcbd18bec54ac69717e59f1f009e2ceaf8d99ca8a7db7c224e1702e0d');
 const m=JSON.parse(readFileSync(new URL('../../'+path,import.meta.url))),old=JSON.parse(readFileSync(new URL('../../'+m.previousRecord.path,import.meta.url)));
 assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.8');assert.equal(sha(m.previousRecord.path),'98775a866470b75cde59e154fd476cd25be9a1c6e7630d24702ef87e37c3ea5b');
 assert.deepEqual(m.changedFromV7,[]);assert.deepEqual(m.sourceDelta,{});assert.deepEqual(m.sourceArtifacts,old.sourceArtifacts);assert.deepEqual(m.normalClient,old.normalClient);assert.equal(m.publicAssetSnapshotSha256,old.publicAssetSnapshotSha256);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 for(const k of ['apiContractsChanged','productFrontendAccepted','actualExecutionApprovedByThisRecord'])assert.equal(m[k],false);
 assert.equal(sha(m.existingCoreIntake.path),'32e3d63af6d224f889c807866adb929056dff1bc16b4a2cf1190f8a2e049d36c');
 const intake=JSON.parse(readFileSync(new URL('../../'+m.existingCoreIntake.path,import.meta.url)));assert.equal(Object.keys(intake.sourceArtifactSha256).length,162);
 for(const [p,h]of Object.entries(intake.sourceArtifactSha256))assert.equal(createHash('sha256').update(execFileSync('git',['show','253f94ff1461e3521dd787395c71b40a4da214b6:'+p])).digest('hex'),h,p);
});

test('v9 preserves browser/API bytes and consumes exact v17 claim-return diagnostics',async()=>{
 const {createHash}=await import('node:crypto'),sha=p=>createHash('sha256').update(historicalRuntime(p)?historicalAsset(p):readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const path='docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V9.json';assert.equal(sha(path),'776e9c7cda92f245e740c060448f9e51e3fbebb9bf81e8712695fea4bcd845c4');
 const m=JSON.parse(readFileSync(new URL('../../'+path,import.meta.url))),old=JSON.parse(readFileSync(new URL('../../'+m.previousRecord.path,import.meta.url)));
 assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.9');assert.equal(sha(m.previousRecord.path),'fce4314fcbd18bec54ac69717e59f1f009e2ceaf8d99ca8a7db7c224e1702e0d');
 assert.deepEqual(m.changedFromV8,[]);assert.deepEqual(m.sourceDelta,{});assert.deepEqual(m.sourceArtifacts,old.sourceArtifacts);assert.deepEqual(m.normalClient,old.normalClient);assert.equal(m.publicAssetSnapshotSha256,old.publicAssetSnapshotSha256);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 for(const k of ['apiContractsChanged','productFrontendAccepted','actualExecutionApprovedByThisRecord'])assert.equal(m[k],false);
 assert.equal(sha(m.existingCoreIntake.path),'24c2808e5521ceac304efa167d00167f35f1e425cd29850add4bd7db22ce5361');
 const intake=JSON.parse(readFileSync(new URL('../../'+m.existingCoreIntake.path,import.meta.url)));assert.equal(Object.keys(intake.sourceArtifactSha256).length,163);
 for(const [p,h]of Object.entries(intake.sourceArtifactSha256))assert.equal(createHash('sha256').update(execFileSync('git',['show','36c9aed6370623a915e8eff858d96078da09f26b:'+p])).digest('hex'),h,p);
});

test('v10 preserves browser/API bytes and consumes exact v18 STWO compatibility',async()=>{
 const {createHash}=await import('node:crypto'),sha=p=>createHash('sha256').update(historicalRuntime(p)?historicalAsset(p):readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const path='docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V10.json';assert.equal(sha(path),'16bcbcacec12d6808775b38b6a75e6f4f8b3897a519780061f7829725f84cf04');
 const m=JSON.parse(readFileSync(new URL('../../'+path,import.meta.url))),old=JSON.parse(readFileSync(new URL('../../'+m.previousRecord.path,import.meta.url)));
 assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.10');assert.equal(sha(m.previousRecord.path),'776e9c7cda92f245e740c060448f9e51e3fbebb9bf81e8712695fea4bcd845c4');
 assert.deepEqual(m.changedFromV9,[]);assert.deepEqual(m.sourceDelta,{});assert.deepEqual(m.sourceArtifacts,old.sourceArtifacts);assert.deepEqual(m.normalClient,old.normalClient);assert.equal(m.publicAssetSnapshotSha256,old.publicAssetSnapshotSha256);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 for(const k of ['apiContractsChanged','productFrontendAccepted','actualExecutionApprovedByThisRecord'])assert.equal(m[k],false);
 assert.equal(sha(m.existingCoreIntake.path),'12ddc5d166d8b3f090aa8e4211e4bd335938365e068757259df5244174c70b13');
 const intake=JSON.parse(readFileSync(new URL('../../'+m.existingCoreIntake.path,import.meta.url)));assert.equal(Object.keys(intake.sourceArtifactSha256).length,164);
 for(const [p,h]of Object.entries(intake.sourceArtifactSha256))assert.equal(createHash('sha256').update(execFileSync('git',['show','03f8d157043fa1b1d004d5ef9d645a5767a26ffe:'+p])).digest('hex'),h,p);
});

test('v11 preserves browser/API bytes and consumes exact v19 registration currentness',async()=>{
 const {createHash}=await import('node:crypto'),sha=p=>createHash('sha256').update(historicalRuntime(p)?historicalAsset(p):readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const path='docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V11.json';assert.equal(sha(path),'0ada61dfc01abbb62b65fb4ed00865e9a6c102510f7983438d07a68308dae7b3');
 const m=JSON.parse(readFileSync(new URL('../../'+path,import.meta.url))),old=JSON.parse(readFileSync(new URL('../../'+m.previousRecord.path,import.meta.url)));
 assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.11');assert.equal(sha(m.previousRecord.path),'16bcbcacec12d6808775b38b6a75e6f4f8b3897a519780061f7829725f84cf04');
 assert.deepEqual(m.changedFromV10,[]);assert.deepEqual(m.sourceDelta,{});assert.deepEqual(m.sourceArtifacts,old.sourceArtifacts);assert.deepEqual(m.normalClient,old.normalClient);assert.equal(m.publicAssetSnapshotSha256,old.publicAssetSnapshotSha256);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 for(const k of ['apiContractsChanged','productFrontendAccepted','actualExecutionApprovedByThisRecord'])assert.equal(m[k],false);
 assert.equal(sha(m.existingCoreIntake.path),'51c1b01c643b6f11d05fbb6a85a89c66eb86a426db3cc4d947e1df7bb09e1d72');
 const intake=JSON.parse(readFileSync(new URL('../../'+m.existingCoreIntake.path,import.meta.url)));assert.equal(Object.keys(intake.sourceArtifactSha256).length,165);
 for(const [p,h]of Object.entries(intake.sourceArtifactSha256))assert.equal(createHash('sha256').update(execFileSync('git',['show','1e923495380c81abf2eab13b21ec918ef2915495:'+p])).digest('hex'),h,p);
});

test('v12 preserves browser/API bytes and consumes exact v20 managed AI run binding',async()=>{
 const {createHash}=await import('node:crypto'),sha=p=>createHash('sha256').update(historicalRuntime(p)?historicalAsset(p):readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const path='docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V12.json';assert.equal(sha(path),'39aa5aac54571dee6c5db0d231c7b5db4d3b6d6eb47e07ac239b12fa10ae4ad3');
 const m=JSON.parse(readFileSync(new URL('../../'+path,import.meta.url))),old=JSON.parse(readFileSync(new URL('../../'+m.previousRecord.path,import.meta.url)));
 assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.12');assert.equal(sha(m.previousRecord.path),'0ada61dfc01abbb62b65fb4ed00865e9a6c102510f7983438d07a68308dae7b3');
 assert.deepEqual(m.changedFromV11,[]);assert.deepEqual(m.sourceDelta,{});assert.deepEqual(m.sourceArtifacts,old.sourceArtifacts);assert.deepEqual(m.normalClient,old.normalClient);assert.equal(m.publicAssetSnapshotSha256,old.publicAssetSnapshotSha256);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 for(const k of ['apiContractsChanged','productFrontendAccepted','actualExecutionApprovedByThisRecord'])assert.equal(m[k],false);
 assert.equal(sha(m.existingCoreIntake.path),'25a66433edefd19bbdb98e57a7699748440b347cec95b145a491385813c9ef77');
 const intake=JSON.parse(readFileSync(new URL('../../'+m.existingCoreIntake.path,import.meta.url)));assert.equal(Object.keys(intake.sourceArtifactSha256).length,166);
 for(const [p,h]of Object.entries(intake.sourceArtifactSha256))assert.equal(createHash('sha256').update(execFileSync('git',['show','ffb999f5e1af802619c265908ab3b4fbeab72012:'+p])).digest('hex'),h,p);
});

test('v13 preserves browser/API bytes and consumes exact v21 consent read currentness',async()=>{
 const {createHash}=await import('node:crypto'),sha=p=>createHash('sha256').update(historicalRuntime(p)?historicalAsset(p):readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const path='docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V13.json';assert.equal(sha(path),'f0c8dbd6092af20f24b1b6ba4a88b23902c5276c2fa8678b27802ca827e8dcc2');
 const m=JSON.parse(readFileSync(new URL('../../'+path,import.meta.url))),old=JSON.parse(readFileSync(new URL('../../'+m.previousRecord.path,import.meta.url)));
 assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.13');assert.equal(sha(m.previousRecord.path),'39aa5aac54571dee6c5db0d231c7b5db4d3b6d6eb47e07ac239b12fa10ae4ad3');
 assert.deepEqual(m.changedFromV12,[]);assert.deepEqual(m.sourceDelta,{});assert.deepEqual(m.sourceArtifacts,old.sourceArtifacts);assert.deepEqual(m.normalClient,old.normalClient);assert.equal(m.publicAssetSnapshotSha256,old.publicAssetSnapshotSha256);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 for(const k of ['apiContractsChanged','productFrontendAccepted','actualExecutionApprovedByThisRecord'])assert.equal(m[k],false);
 assert.equal(sha(m.existingCoreIntake.path),'2edf76879b3b45562b71a65b38fea8aa6b8ef9732c11ea616a0c8d6036f5565b');
 const intake=JSON.parse(readFileSync(new URL('../../'+m.existingCoreIntake.path,import.meta.url)));assert.equal(Object.keys(intake.sourceArtifactSha256).length,166);
 for(const [p,h]of Object.entries(intake.sourceArtifactSha256))assert.equal(createHash('sha256').update(execFileSync('git',['show','1421c5ff2105694461f6d470d6b0127d4fd11ce2:'+p])).digest('hex'),h,p);
});

function scheduledReader(driver){
 let next=null,visible=true;
 const reader=createTestAutoReader({driver,visible:()=>visible,setTimer:fn=>{next=fn;return fn;},clearTimer:()=>{next=null;}});
 reader.sync();return {reader,get scheduled(){return !!next;},async tick(){const fn=next;assert.equal(typeof fn,'function');next=null;await fn();},
  visible(value){visible=value;reader.sync();}};
}
test('automatic reads preserve the displayed source message and never sign or post',async t=>{
 const x=await fixture(t),a=x.browser(x.f.alice);await a.driver.config();await a.driver.login();await a.driver.create();await a.driver.bind();
 const app=a.driver.snapshot().applicationId,v=x.f.store.getApplication(x.f.aliceContext,app),expected={version:'clear-hackerrank-request.1',...x.pins,
  applicationId:app,participantId:v.participantId,participantWallet:x.f.alice.address.toLowerCase(),criterionId:'python-basic-certificate',policyHash:v.policyHash,
  runtimeMappingHash:v.runtimeMappingHash,nonce:p0Hash('TEST','auto-reader-source'),issuedAt:START,expiresAt:START+240};delete expected.dataMode;
 const {requestMessage}=await import('../../src/hackerrank-evidence/request.mjs');const pending=x.ui.requestSignature(expected,requestMessage(expected));pending.catch(()=>{});
 await a.driver.approval();const message=a.driver.snapshot().approval.message,counts={posts:a.counts.posts,signs:a.counts.signs};
 const live=scheduledReader(a.driver);t.after(()=>live.reader.close());await live.tick();
 assert.equal(a.driver.snapshot().approval.message,message);assert.equal(a.counts.posts,counts.posts);assert.equal(a.counts.signs,counts.signs);
 live.visible(false);assert.equal(live.scheduled,false);live.visible(true);assert.equal(live.scheduled,true);
 live.reader.close();assert.equal(live.scheduled,false);
});
test('automatic views give both real HTTPS users the same recipient/100 TEST and allow only their two explicit consents',async t=>{
 const x=await fixture(t),a=x.browser(x.f.alice),o=x.browser(x.f.operator);for(const b of [a,o]){await b.driver.config();await b.driver.login();}
 await a.driver.create();await a.driver.bind();const app=a.driver.snapshot().applicationId;await x.f.complete(app);x.f.publish(app);
 const ar=scheduledReader(a.driver),or=scheduledReader(o.driver);t.after(()=>{ar.reader.close();or.reader.close();});
 const before=[a.counts.posts,o.counts.posts];await ar.tick();await or.tick();
 for(const b of [a,o]){assert.equal(b.driver.snapshot().canAgree,true);assert.equal(b.driver.snapshot().bootstrap.expectedPayment.recipient,x.f.alice.address.toLowerCase());
  assert.equal(b.driver.snapshot().bootstrap.expectedPayment.amountAtoms,'100000000');}
 assert.deepEqual(a.driver.snapshot().view.target,o.driver.snapshot().view.target);
 assert.deepEqual([a.counts.posts,o.counts.posts],before);const expiry=a.driver.snapshot().view.sourceValidUntilExclusive;
 x.f.setTime(START+60);await ar.tick();await or.tick();await a.driver.consent('AGREE');
 assert.equal(x.f.view(app).consent.bothCurrent,false);x.f.setTime(START+120);await or.tick();await o.driver.consent('AGREE');
 assert.equal(x.f.view(app).consent.bothCurrent,true);assert.equal(x.f.view(app).consent.records.length,2);
 assert.equal(o.driver.snapshot().view,null);await ar.tick();assert.equal(a.driver.snapshot().view.sourceValidUntilExclusive,expiry);
 assert.equal(a.counts.signs,1);assert.equal(o.counts.signs,1);
});
test('minimum review display and the final reserve stop buttons without issuing a consent POST',async t=>{
 for(const lateFirstDisplay of [true,false]){
  const x=await fixture(t),a=x.browser(x.f.alice);await a.driver.config();await a.driver.login();await a.driver.create();await a.driver.bind();
  const app=a.driver.snapshot().applicationId;await x.f.complete(app);x.f.publish(app);
  if(!lateFirstDisplay)await a.driver.refresh();x.f.setTime(START+(lateFirstDisplay?191:271));
  await a.driver.readLive();assert.equal(a.driver.snapshot().canAgree,false);
  const posts=a.counts.posts;await assert.rejects(a.driver.consent('AGREE'),/TEST_REVIEW_WINDOW_REQUIRED/);assert.equal(a.counts.posts,posts);
  assert.equal(x.f.view(app).consent.records.length,0);
 }
});
test('an automatically displayed new decision cannot inherit an old selection or consent',async t=>{
 const x=await fixture(t),a=x.browser(x.f.alice);await a.driver.config();await a.driver.login();await a.driver.create();await a.driver.bind();
 const app=a.driver.snapshot().applicationId;await x.f.complete(app);x.f.publish(app);await a.driver.refresh();const old=a.driver.snapshot().view.target;
 await a.driver.consent('AGREE');x.f.setTime(START+10);x.f.change(app,'activity-complete',{sourceHash:'0x'+'77'.repeat(32)});await x.f.accept(app,'activity-complete');x.f.publish(app);
 await a.driver.readLive();assert.notEqual(a.driver.snapshot().view.target.targetDecisionHash,old.targetDecisionHash);
 assert.equal(a.driver.snapshot().consentTargetChanged,true);assert.equal(a.driver.snapshot().canAgree,false);assert.equal(x.f.view(app).consent.bothCurrent,false);
 const posts=a.counts.posts;await assert.rejects(a.driver.consent('AGREE'),/TEST_REVIEW_WINDOW_REQUIRED/);assert.equal(a.counts.posts,posts);
 await a.driver.refresh();assert.equal(a.driver.snapshot().consentTargetChanged,false);assert.equal(a.driver.snapshot().canAgree,true);
});
test('a pending unknown consent never starts an automatic replay or replaces its frozen intent',async t=>{
 const x=await fixture(t),a=x.browser(x.f.alice);await a.driver.config();await a.driver.login();await a.driver.create();await a.driver.bind();
 const app=a.driver.snapshot().applicationId;await x.f.complete(app);x.f.publish(app);await a.driver.refresh();
 const live=scheduledReader(a.driver);t.after(()=>live.reader.close());a.loseNext('/bootcamp/v3/applications/'+app+'/review-consents');
 await assert.rejects(a.driver.consent('AGREE'),e=>e.outcome==='UNKNOWN');const posts=a.counts.posts;live.reader.sync();assert.equal(live.scheduled,false);
 assert.equal(a.driver.snapshot().consentReplayPending,true);assert.equal(a.counts.posts,posts);assert.equal(x.f.view(app).consent.records.length,1);
});


test('v14 pins six current browser assets and the reviewed v22 human review window',async()=>{
 const {createHash}=await import('node:crypto'),{assetSnapshot}=await import('../../tools/bootcamp/normal-host-config.mjs');
 const sha=p=>createHash('sha256').update(historicalRuntime(p)?execFileSync('git',['show','dd10cb27dda05c320530a15305f4b464d2361780:'+p]):readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const m=JSON.parse(readFileSync(new URL('../../docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V14.json',import.meta.url)));
 assert.equal(sha('docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V14.json'),'8b423a94d31c7482388835201d89e5af20a6fcbc1fde9ec271eb2e36448cdd40');assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.14');
 assert.equal(sha(m.previousRecord.path),'f0c8dbd6092af20f24b1b6ba4a88b23902c5276c2fa8678b27802ca827e8dcc2');assert.equal(Object.keys(m.sourceArtifacts).length,6);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);
 const paths=['/',...Object.keys(m.sourceArtifacts).map(p=>'/'+p.split('/').at(-1))].sort((a,b)=>a.localeCompare(b));const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};const bytes=Buffer.concat(paths.flatMap(path=>{const p='tools/bootcamp/test-client/'+(path==='/'?'index.html':path.slice(1));return [Buffer.from(path+'\n'+types[p.split('.').at(-1)]+'\n'),execFileSync('git',['show','dd10cb27dda05c320530a15305f4b464d2361780:'+p])];}));assert.equal(createHash('sha256').update(bytes).digest('hex'),m.publicAssetSnapshotSha256);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 assert.equal(sha(m.existingCoreIntake.path),'3072f09076cd07b1db2efbb4001ee2c5ee7d48fabb15649082abff5f8534ca97');assert.equal(m.existingCoreIntake.sources,170);
 assert.equal(m.productFrontendAccepted,false);assert.equal(m.actualExecutionApprovedByThisRecord,false);assert.equal(m.existingApiContractsRetained,true);
});

test('v15 pins the rebalanced budget and current action explanations',async()=>{
 const {createHash}=await import('node:crypto'),{assetSnapshot}=await import('../../tools/bootcamp/normal-host-config.mjs');
 const sha=p=>createHash('sha256').update(readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const m=JSON.parse(readFileSync(new URL('../../docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V15.json',import.meta.url)));
 assert.equal(sha('docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V15.json'),'bd5ef7fbb97b7f7b18c415d400c30635452ec45751ee934d5e77459f3f6452d8');assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.15');
 assert.equal(sha(m.previousRecord.path),'8b423a94d31c7482388835201d89e5af20a6fcbc1fde9ec271eb2e36448cdd40');assert.equal(Object.keys(m.sourceArtifacts).length,6);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);
 assert.equal(assetSnapshot(fileURLToPath(root).replace(/\/$/,'')),m.publicAssetSnapshotSha256);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 assert.equal(sha(m.existingCoreIntake.path),'a950980645917f3353759dd01065766e2859e29af928a434106b6566a524ca3c');assert.equal(m.existingCoreIntake.sources,170);
 assert.equal(m.productFrontendAccepted,false);assert.equal(m.actualExecutionApprovedByThisRecord,false);assert.equal(m.existingApiContractsRetained,true);
});

test('v16 preserves browser assets and consumes exact post-send recovery clock checks',async()=>{
 const {createHash}=await import('node:crypto'),{assetSnapshot}=await import('../../tools/bootcamp/normal-host-config.mjs');
 const sha=p=>createHash('sha256').update(readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const m=JSON.parse(readFileSync(new URL('../../docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V16.json',import.meta.url)));
 assert.equal(sha('docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V16.json'),'c5132921fc82cb4879c05a19b6a2c0943de44b88c7258fac5a61cf4adbc3c103');assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.16');
 assert.equal(sha(m.previousRecord.path),'bd5ef7fbb97b7f7b18c415d400c30635452ec45751ee934d5e77459f3f6452d8');assert.equal(Object.keys(m.sourceArtifacts).length,6);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);
 assert.equal(assetSnapshot(fileURLToPath(root).replace(/\/$/,'')),m.publicAssetSnapshotSha256);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 assert.equal(sha(m.existingCoreIntake.path),'8ec4832c29f6717b32d47d1266798600994bc17190027b19be604ee6591512fc');assert.equal(m.existingCoreIntake.sources,170);
 assert.equal(m.productFrontendAccepted,false);assert.equal(m.actualExecutionApprovedByThisRecord,false);assert.equal(m.existingApiContractsRetained,true);
});

test('v17 preserves browser assets and pins bounded normal-payment diagnostics',async()=>{
 const {createHash}=await import('node:crypto'),{assetSnapshot}=await import('../../tools/bootcamp/normal-host-config.mjs');
 const sha=p=>createHash('sha256').update(readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const m=JSON.parse(readFileSync(new URL('../../docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V17.json',import.meta.url)));
 assert.equal(sha('docs/current/BOOTCAMP_TEST_CLIENT_ASSETS_V17.json'),'0d6dfc4e3aac5311e42428c11a7262f09026f6c4361bca427567ee8146b25e6d');assert.equal(m.version,'clear-bootcamp-backend-test-client-assets.17');
 assert.equal(sha(m.previousRecord.path),'c5132921fc82cb4879c05a19b6a2c0943de44b88c7258fac5a61cf4adbc3c103');assert.equal(Object.keys(m.sourceArtifacts).length,6);
 for(const [p,h]of Object.entries(m.sourceArtifacts))assert.equal(sha(p),h,p);
 assert.equal(assetSnapshot(fileURLToPath(root).replace(/\/$/,'')),m.publicAssetSnapshotSha256);assert.equal(sha(m.normalClient.path),m.normalClient.sha256);
 assert.equal(sha(m.existingCoreIntake.path),'8c4b1dcca74ca3a350a08268d705e0c8332e849bfbb014c997a926d192398a16');assert.equal(m.existingCoreIntake.sources,171);
 assert.equal(m.productFrontendAccepted,false);assert.equal(m.actualExecutionApprovedByThisRecord,false);assert.equal(m.existingApiContractsRetained,true);
});
