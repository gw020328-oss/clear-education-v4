import test from 'node:test';
import {Wallet} from 'ethers';
import {POLICY_HASH} from '../../src/hackerrank-evidence/request.mjs';
import assert from 'node:assert/strict';
import {withManagedHackerRankSource} from '../../src/hackerrank-evidence/managed-source.mjs';
import {syntheticRecipe,ACCOUNT_URL} from '../../src/hackerrank-evidence/recipes.mjs';
import {hash} from '../../src/hackerrank-evidence/values.mjs';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {createSourceDiagnostics} from '../../src/hackerrank-evidence/diagnostics.mjs';

// Host lifecycle only. This invented profile is never sent to an attestor and
// is not a reviewed live recipe. Fake transports cannot make a valid lease.
function setup(){
 const now=Math.floor(Date.now()/1000),recipe=syntheticRecipe();
 recipe.account.responseMatches[0].value='^HOST_TEST_ONLY(?<username>[A-Za-z0-9_-]+)$';
 const config={version:'clear-hackerrank-trust.1',status:'REVIEWED',dataMode:'RECLAIM_SIGNED_RECORD',
  approvalRef:'synthetic-host-test-never-live',sourceReview:'AUTHENTICATED_SOURCE_REVIEWED',contextReview:'SIGNED_REQUEST_CONTEXT_CONFIRMED',
  audience:'synthetic-host-test',notBefore:now-30,expiresAt:now+300,signers:['0x'+'12'.repeat(20)],epochs:[1],recipe,privacyKeyId:'synthetic-key'};
 const calls=[],client={isOpen:true,isInitialised:true,metadata:{}},routeStop=new AbortController();
 let endBrowser,source;
 const browser={closed:new Promise(resolve=>{endBrowser=resolve;}),async send(name,input){
  calls.push(name);
  if(name==='Target.getTargets')return {targetInfos:[{type:'page',targetId:'test-page'}]};
  if(name==='Target.attachToTarget')return {sessionId:'test-session'};
  if(name==='Page.navigate'){assert.equal(input.url,ACCOUNT_URL);return {};}
  assert.fail('No cookie or response-body read is expected');
 },async close(){calls.push('CLOSE_BROWSER');endBrowser();}};
 const input={trustConfig:config,commitmentKey:Buffer.alloc(32,71),selectedCertificateId:'synthetic-selected-id',
  async openClient({proofMode}){calls.push('OPEN_CLIENT');assert.equal(proofMode,true);return {client,async close(){calls.push('CLOSE_CLIENT');}};},
  async openRoute({client:provided,allowHost}){calls.push('OPEN_ROUTE');assert.equal(provided,client);assert(allowHost('www.hackerrank.com'));assert(!allowHost('accounts.google.com'));return {client,signal:routeStop.signal,proxyUrl:'http://127.0.0.1:12345',async close(){calls.push('CLOSE_ROUTE');}};},
  async launchBrowser(session,{synthetic,signal}){calls.push('OPEN_BROWSER');assert.equal(synthetic,false);assert.equal(signal.aborted,false);return browser;},
  async waitForReady(){calls.push('READY');},
  async useSource(value){calls.push('USE_SOURCE');source=value;assert.equal(source.status,'PREPARED');return {status:'HOST_CALLBACK_ONLY'};},
 };
 return {config,input,calls,browser,routeStop,endBrowser,source:()=>source,session:{path:'/synthetic/managed-profile',expiresAt:Date.now()+600000}};
}
const locked=process.env.CLEAR_LOCKED;
test.after(()=>{if(locked===undefined)delete process.env.CLEAR_LOCKED;else process.env.CLEAR_LOCKED=locked;});
process.env.CLEAR_LOCKED='1';

test('pending trust opens nothing; invalid live configuration fails before transport',async()=>{
 const x=setup(),blocked=await withManagedHackerRankSource(null,{...x.input,trustConfig:{status:'UNCONFIGURED'}});
 assert.equal(blocked.status,'BLOCKED');assert.deepEqual(x.calls,[]);
 for(const mutate of [
  c=>{c.dataMode='SYNTHETIC_FIXTURE';},
  c=>{c.recipe=syntheticRecipe();},
  c=>{c.signers=[];},
  c=>{c.expiresAt=c.notBefore+1;},
 ]){
  const y=setup();mutate(y.config);
  await assert.rejects(withManagedHackerRankSource(y.session,y.input));assert.deepEqual(y.calls,[]);
 }
});
test('one prepared owner reaches the host only after ready and closes on return',async()=>{
 const x=setup();let pins,held;
 x.input.useSource=async source=>{
  held=source;pins=source.pins();assert.equal(x.calls.at(-1),'READY');
  assert.equal(pins.trustConfigHash,hash('TRUST',x.config));
  assert.equal(pins.selectedCertificateId,'synthetic-selected-id');assert.equal(source.pins(),pins);
  assert.deepEqual(Object.keys(source).sort(),['close','collectLease','pins','status']);
  return {status:'HOST_CALLBACK_ONLY'};
 };
 assert.deepEqual(await withManagedHackerRankSource(x.session,x.input),{status:'HOST_CALLBACK_ONLY'});
 assert.equal(held.pins(),null);
 assert.deepEqual(x.calls.slice(-3),['CLOSE_BROWSER','CLOSE_ROUTE','CLOSE_CLIENT']);
 assert.equal(x.calls.filter(c=>c==='OPEN_CLIENT').length,1);
 assert(!x.calls.some(c=>/Cookies|ResponseBody/.test(c)));
});
function requestFor(pins,wallet){const now=Math.floor(Date.now()/1000);return {
 version:'clear-hackerrank-request.1',audience:pins.audience,participantId:'participant-test',
 participantWallet:wallet.address.toLowerCase(),applicationId:'application-test',criterionId:'python-basic-certificate',
 policyHash:POLICY_HASH,runtimeMappingHash:'0x'+'34'.repeat(32),trustConfigHash:pins.trustConfigHash,
 recipeHash:pins.recipeHash,expectedClaimOwner:pins.expectedClaimOwner,nonce:'0x'+'56'.repeat(32),
 issuedAt:now,expiresAt:now+240,selectedCertificateId:pins.selectedCertificateId};}
test('deferred host and repeated pin reads open no browser',async()=>{
 const x=setup();x.input.deferReadyUntilCollection=true;
 x.input.useSource=async source=>{for(let i=0;i<3;i++)assert(source.pins());
  assert(!x.calls.includes('OPEN_BROWSER'));assert(!x.calls.includes('READY'));};
 await withManagedHackerRankSource(x.session,x.input);
 assert.deepEqual(x.calls,['OPEN_CLIENT','OPEN_ROUTE','CLOSE_ROUTE','CLOSE_CLIENT']);
});
test('deferred launch follows a valid accepted signature, then waits for login',async()=>{
 const x=setup(),wallet=Wallet.createRandom();x.input.deferReadyUntilCollection=true;
 const entered=Promise.withResolvers(),accepted=Promise.withResolvers(),ready=Promise.withResolvers(),stop=new AbortController();
 x.input.waitForReady=async()=>{x.calls.push('READY');ready.resolve();await new Promise(()=>{});};
 x.input.useSource=async source=>{
  const pending=source.collectLease(requestFor(source.pins(),wallet),{signal:stop.signal,isAuthorized:()=>true,
   async signRequest(message){x.calls.push('SIGN_REQUEST');entered.resolve();await accepted.promise;
    x.calls.push('SIGN_ACCEPTED');return wallet.signMessage(message);}});
  const rejected=assert.rejects(pending,/COLLECTOR_CANCELLED/);
  await entered.promise;assert(!x.calls.includes('OPEN_BROWSER'));assert(!x.calls.includes('READY'));
  accepted.resolve();await ready.promise;
  assert(x.calls.indexOf('SIGN_ACCEPTED')<x.calls.indexOf('OPEN_BROWSER'));
  assert(x.calls.indexOf('Page.navigate')<x.calls.indexOf('READY'));
  stop.abort();await rejected;
 };
 await withManagedHackerRankSource(x.session,x.input);
 assert.equal(x.calls.filter(c=>c==='OPEN_BROWSER').length,1);
 assert.deepEqual(x.calls.slice(-3),['CLOSE_BROWSER','CLOSE_ROUTE','CLOSE_CLIENT']);
});
test('closed host input after deferred navigation preserves the first READY failure and closes the source',async()=>{
 const x=setup(),wallet=Wallet.createRandom(),input=new PassThrough();let held;
 const diagnostics=createSourceDiagnostics({persist(){}});
 x.input.deferReadyUntilCollection=true;x.input.diagnostics=diagnostics;
 x.input.waitForReady=async()=>{
  x.calls.push('READY');
  const lines=createInterface({input,terminal:false});
  const pending=new Promise((_,reject)=>lines.once('close',()=>reject(Error('NORMAL_HOST_INPUT_CLOSED'))));
  input.end();await pending;
 };
 x.input.useSource=async source=>{
  held=source;
  return source.collectLease(requestFor(source.pins(),wallet),{isAuthorized:()=>true,
   signRequest:message=>wallet.signMessage(message)});
 };
 await assert.rejects(withManagedHackerRankSource(x.session,x.input),/COLLECTION_FAILED/);
 const d=diagnostics.snapshot();
 assert.equal(d.firstFailure.stage,'PREPARED_SOURCE');
 assert.equal(d.firstFailure.code,'NORMAL_HOST_INPUT_CLOSED');
 assert.equal(d.stages.COLLECTOR_SETUP.state,'NOT_OBSERVED');
 assert.equal(held.pins(),null);
 assert(x.calls.indexOf('Page.navigate')<x.calls.indexOf('READY'));
 assert.deepEqual(x.calls.slice(-3),['CLOSE_BROWSER','CLOSE_ROUTE','CLOSE_CLIENT']);
 assert(!x.calls.some(c=>/Cookies|ResponseBody/.test(c)));
});
test('rejected, forged, expired, cancelled or revoked approval never opens a browser',async t=>{
 for(const mode of ['rejected','forged','expired','cancelled','revoked','closed'])await t.test(mode,async st=>{
  const x=setup(),wallet=Wallet.createRandom(),stop=new AbortController();let allowed=true;
  x.input.deferReadyUntilCollection=true;
  x.input.useSource=async source=>{
   const request=requestFor(source.pins(),wallet);
   await assert.rejects(source.collectLease(request,{signal:stop.signal,isAuthorized:()=>allowed,
    async signRequest(message){
     if(mode==='rejected')throw Error('USER_REJECTED');
     if(mode==='cancelled')stop.abort();
     if(mode==='revoked')allowed=false;
     if(mode==='closed')source.close();
     if(mode==='expired')st.mock.method(Date,'now',()=>request.expiresAt*1000);
     return (mode==='forged'?Wallet.createRandom():wallet).signMessage(message);
    }}));
  };
  await withManagedHackerRankSource(x.session,x.input);
  assert(!x.calls.includes('OPEN_BROWSER'));assert(!x.calls.includes('READY'));
  assert.deepEqual(x.calls.slice(-2),['CLOSE_ROUTE','CLOSE_CLIENT']);
 });
});
test('caller trust and key changes during transport cannot change prepared pins',async()=>{
 const x=setup(),originalHash=hash('TRUST',x.config),open=x.input.openClient;
 x.input.openClient=async args=>{x.config.audience='mutated-caller';x.input.commitmentKey.fill(0);return open(args);};
 x.input.useSource=async source=>{assert.equal(source.pins().trustConfigHash,originalHash);};
 await withManagedHackerRankSource(x.session,x.input);
});
test('cancel while waiting for login never exposes the source and closes all transports',async()=>{
 const x=setup(),controller=new AbortController();x.input.signal=controller.signal;
 x.input.waitForReady=async()=>controller.abort();
 await assert.rejects(withManagedHackerRankSource(x.session,x.input),/COLLECTOR_CANCELLED/);
 assert(!x.calls.includes('USE_SOURCE'));assert.deepEqual(x.calls.slice(-3),['CLOSE_BROWSER','CLOSE_ROUTE','CLOSE_CLIENT']);
});
test('browser exit or route cancellation immediately invalidates prepared owner',async()=>{
 for(const mode of ['browser','route']){
  const x=setup();
  x.input.useSource=async(source,{signal})=>{
   assert(source.pins());if(mode==='browser')x.endBrowser();else x.routeStop.abort();
   await Promise.resolve();assert.equal(signal.aborted,true);assert.equal(source.pins(),null);
   await assert.rejects(source.collectLease({}),/COLLECTOR_CLOSED/);
  };
  await assert.rejects(withManagedHackerRankSource(x.session,x.input),/COLLECTOR_CANCELLED/);
  assert.deepEqual(x.calls.slice(-3),['CLOSE_BROWSER','CLOSE_ROUTE','CLOSE_CLIENT']);
 }
});
test('host failure is sanitized and cleanup failure never returns callback success',async()=>{
 for(const mode of ['host','cleanup']){
  const x=setup();let held;
  x.input.useSource=async source=>{held=source;if(mode==='host')throw Error('SYNTHETIC_PRIVATE_HOST_DETAIL');return 'success';};
  if(mode==='cleanup')x.browser.close=async()=>{x.calls.push('CLOSE_BROWSER');throw Error('SYNTHETIC_PRIVATE_CLOSE_DETAIL');};
  await assert.rejects(withManagedHackerRankSource(x.session,x.input),e=>e.message===(mode==='host'?'COLLECTION_FAILED':'COLLECTOR_CLEANUP_FAILED'));
  assert.equal(held.pins(),null);assert.deepEqual(x.calls.slice(-3),['CLOSE_BROWSER','CLOSE_ROUTE','CLOSE_CLIENT']);
 }
});
test('partial startup failure closes acquired transports without invoking ready or host',async()=>{
 for(const mode of ['route','browser','navigate']){
  const x=setup();
  if(mode==='route')x.input.openRoute=async()=>{throw Error('SYNTHETIC_FAILURE');};
  if(mode==='browser')x.input.launchBrowser=async()=>{throw Error('SYNTHETIC_FAILURE');};
  if(mode==='navigate'){const send=x.browser.send;x.browser.send=async(name,args)=>name==='Page.navigate'?{errorText:'SYNTHETIC_FAILURE'}:send(name,args);}
  await assert.rejects(withManagedHackerRankSource(x.session,x.input));
  assert(!x.calls.includes('READY'));assert(!x.calls.includes('USE_SOURCE'));assert.equal(x.calls.at(-1),'CLOSE_CLIENT');
  if(mode!=='route')assert(x.calls.includes('CLOSE_ROUTE'));
 }
});
