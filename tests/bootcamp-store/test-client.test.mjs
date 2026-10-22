// Invented wallets/source only. Existing HTTPS auth/store and the actual browser transport/controller run together.
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter,once} from 'node:events';
import {request} from 'node:https';import {mkdirSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {toUtf8String,getBytes} from 'ethers';
import {procedureFixture,START} from './procedure-fixture.mjs';import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createBootcampFrontendServer} from '../../tools/bootcamp/frontend-server.mjs';import {createNormalUiSession} from '../../src/bootcamp/ui-session.mjs';
import {P0_POLICY,p0PolicyHash} from '../../specs/bootcamp/p0-contract.mjs';
import {createNormalBootcampClient} from '../../src/bootcamp/normal-client.mjs';import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {createTestWalletSession} from '../../tools/bootcamp/test-client/session.js';import {createTestDriver} from '../../tools/bootcamp/test-client/driver.js';
const root=new URL('../../tools/bootcamp/test-client/',import.meta.url);
async function fixture(t){
 const f=await procedureFixture(t),H=x=>p0Hash('TEST-CLIENT-OFFLINE',x),pins={dataMode:'RECLAIM_SIGNED_RECORD',audience:'test-client',trustConfigHash:H('trust'),recipeHash:H('recipe'),expectedClaimOwner:f.alice.address.toLowerCase(),selectedCertificateId:null};let bound=null;
 const ui=createNormalUiSession({authentication:f.service,participantWallet:f.alice.address.toLowerCase(),operatorWallet:f.operator.address.toLowerCase(),getApplication:(c,a)=>f.store.getApplication(c,a),now:()=>f.time});
 const normalUi={getSession(c){const a=ui.authorize(c);if(bound)f.store.getOperationsProjection(c,bound);return {version:'clear-bootcamp-normal-session.1',role:a.role.toUpperCase(),applicationId:bound,
  policyHash:p0PolicyHash(P0_POLICY),runtimeMappingHash:H('unused'),sourceMode:'REGISTERED_TEST_SOURCE',receiptRequired:true};},
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
 const {createHash}=await import('node:crypto'),{assetSnapshot}=await import('../../tools/bootcamp/normal-host-config.mjs'),sha=p=>createHash('sha256').update(readFileSync(new URL('../../'+p,import.meta.url))).digest('hex');
 const manifest=JSON.parse(readFileSync(new URL('../../docs/current/BOOTCAMP_TEST_CLIENT_ASSETS.json',import.meta.url)));
 assert.equal(manifest.version,'clear-bootcamp-backend-test-client-assets.1');assert.equal(manifest.productFrontendAccepted,false);assert.equal(manifest.actualExecutionApprovedByThisRecord,false);assert.equal(manifest.apiContractsChanged,false);
 assert.equal(Object.keys(manifest.sourceArtifacts).length,5);for(const [path,h]of Object.entries(manifest.sourceArtifacts))assert.equal(sha(path),h,path);
 assert.equal(assetSnapshot(fileURLToPath(root).replace(/\/$/,'')),manifest.publicAssetSnapshotSha256);assert.equal(sha(manifest.normalClient.path),manifest.normalClient.sha256);
 assert.equal(sha(manifest.existingCoreIntake.path),'823761592e8178e682ad2f2c39dd6d95423dcbcebad9ffdd15bb2ccfb4424ba8');
 const v10=JSON.parse(readFileSync(new URL('../../'+manifest.existingCoreIntake.path,import.meta.url)));assert.equal(Object.keys(v10.sourceArtifactSha256).length,159);for(const [path,h]of Object.entries(v10.sourceArtifactSha256))assert.equal(sha(path),h,path);
});
