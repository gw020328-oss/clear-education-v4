import {cancelDiagnosticKey,readCancelDiagnostic,createCancelDiagnostic} from '../../src/embedded-wallet/cancel-diagnostics.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createCourseWalletController} from '../../src/embedded-wallet/moodle-native-controller.mjs';
import {createNativeMoodleLogin} from '../../src/embedded-wallet/moodle-native-login.mjs';

const origin = 'https://127.0.0.1:9477';
const config = {origin, appId: 'syntheticapp00001', redirectUri: origin + '/local/clearbridge/wallet-return',
  surface: 'MOODLE_NATIVE', phase: 'ACTIVE_LOCAL_TEST', chainId: 12345, rpcUrl: 'http://127.0.0.1:9479',
  instanceId: '0x'+'11'.repeat(32), role: 'operator', courseId: 2, sesskey: 'synthetic01'};
const address = '0x'+'12'.repeat(20);
function fixture({accountGate, endGate, rejectedEnd = false, changeAccountsOnFinish = false,
  rejectedRevoke = false, serverRole = 'operator', workflowGate, document, requestError, commandError, storageFailure=false} = {}) {
  const target = new EventTarget(); target.navigator = {locks: {request: (_name, _options, run) => run()}};
  target.document = document;
  const provider = new EventEmitter(), calls = [], stages = [], views = [];
  const values=new Map(),diagnosticWrites=[];
  target.localStorage={getItem:k=>values.get(k)??null,setItem(k,v){if(storageFailure)throw Error('denied');values.set(k,v);diagnosticWrites.push(JSON.parse(v));stages.push('diagnostic');}};
  let currentAddress = address;
  provider.request = async ({method}) => {
    calls.push(method);
    if (method === 'eth_requestAccounts') { await accountGate; return [address]; }
    if (method === 'eth_accounts') return [currentAddress];
    if (method === 'eth_chainId') return '0x3039';
    if (method === 'wallet_switchEthereumChain') return null;
    throw Error('UNEXPECTED_WALLET_REQUEST');
  };
  target.addEventListener('eip6963:requestProvider', () => {
    const event = new Event('eip6963:announceProvider');
    event.detail = {info: {rdns: 'io.metamask', uuid: '12345678-1234-1234-1234-123456789012'}, provider};
    target.dispatchEvent(event);
  });
  const controller = createCourseWalletController({config, target, onState: value => views.push(value),
    fetch: async (_url, options) => {
      const q = JSON.parse(options.body); return {ok: true, redirected: false, json: async () => ({result: q.method === 'eth_chainId' ? '0x3039' : '0x'})};
    },
    sessionFactory: ({wallet}) => ({
      async authenticate() { stages.push('authenticate'); return {role: serverRole}; },
      async assertSession(signal) { stages.push('assert-session'); await wallet.guard(signal);
        return {wallet: address, role: serverRole, expiresAt: Math.floor(Date.now()/1000)+60}; },
      async request(path){stages.push(path);await workflowGate;if(requestError)throw requestError;return {version:'clear-bootcamp-normal-session.1',role:'OPERATOR',applicationId:null,policyHash:'0x'+'11'.repeat(32),runtimeMappingHash:'0x'+'22'.repeat(32),sourceMode:'REGISTERED_TEST_SOURCE',receiptRequired:true};},
      async dispose() { stages.push('revoke'); if (rejectedRevoke) throw Error('synthetic'); },
    }),
    loginFactory: () => Object.fromEntries(['begin','complete','finish','end','command'].map(method => [method, async () => {
      stages.push(method);
      if(method==='command'&&commandError)throw commandError;
      if (method === 'finish' && changeAccountsOnFinish) currentAddress = '0x'+'34'.repeat(20);
      if (method === 'end') { await endGate; if (rejectedEnd) throw Error('synthetic lost end response'); }
    }]))});
  const view = () => views.at(-1);
  async function ready() {
    await controller.dispatch({action: 'connect-metamask', providerId: view().providers[0].providerId});
    await controller.dispatch({action: 'select-wallet', choiceId: view().choices[0].choiceId});
    await controller.dispatch({action: 'check-network'});
  }
  return {controller, view, views, calls, stages, provider, ready,diagnosticWrites,storage:target.localStorage};
}

test('Moodle mount/discovery do not request accounts, switch chain or sign; every stage is explicit', async () => {
  const f = fixture();
  assert.deepEqual(f.calls, []); assert.deepEqual(f.stages, []);
  assert.equal(f.view().selectedChoiceId, null);
  await f.ready(); assert.equal(f.view().phase, 'NETWORK_READY'); assert.deepEqual(f.stages, []);
  await f.controller.dispatch({action: 'sign-in'});
  assert.equal(f.view().phase, 'CONNECTION_PENDING'); assert.equal(f.view().authenticated, true);
  assert.deepEqual(f.stages, ['begin','authenticate','assert-session','complete']);
  assert(!f.stages.includes('finish'));
  await f.controller.dispatch({action: 'finish-connection'});
  assert.equal(f.view().phase, 'CONNECTED'); assert.deepEqual(f.stages.slice(-3), ['assert-session','finish','assert-session']);
  assert(!f.calls.some(method => method === 'eth_sendTransaction'));
  await f.controller.destroy(); assert.equal(f.view().phase, 'CLOSED');
});

test('cancel discards a late MetaMask address and retires all selectors', async () => {
  let resolve; const gate = new Promise(r => {resolve = r;}); const f = fixture({accountGate: gate});
  const oldProvider = f.view().providers[0].providerId;
  const pending = f.controller.dispatch({action: 'connect-metamask', providerId: oldProvider});
  await new Promise(r => setImmediate(r));
  await f.controller.dispatch({action: 'cancel'}); resolve(); await pending;
  assert.equal(f.view().choices.length, 0); assert.equal(f.view().selectedChoiceId, null);
  assert.notEqual(f.view().providers[0].providerId, oldProvider);
  await f.controller.dispatch({action: 'connect-metamask', providerId: oldProvider});
  assert.equal(f.view().error.code, 'STALE_SELECTION');
  assert(!f.stages.includes('authenticate')); await f.controller.destroy();
});

test('server role mismatch revokes CLEAR authentication and cannot reach finish', async () => {
  const f = fixture({serverRole: 'participant'}); await f.ready();
  await f.controller.dispatch({action: 'sign-in'});
  assert.equal(f.view().authenticated, false); assert.equal(f.view().error.code, 'ROLE_CHANGED');
  assert(f.stages.includes('revoke')); assert(!f.stages.includes('complete'));
  await assert.rejects(f.controller.dispatch({action:'finish-connection'})); await f.controller.destroy();
});

test('a pending Moodle cancellation blocks another connection until retirement completes', async () => {
  let releaseEnd,releaseAccount;
  const endGate=new Promise(r=>{releaseEnd=r;}),accountGate=new Promise(r=>{releaseAccount=r;});
  const f=fixture({endGate,accountGate});
  const providerId=f.view().providers[0].providerId;
  const connecting=f.controller.dispatch({action:'connect-metamask',providerId});
  await new Promise(r=>setImmediate(r));
  const cancelling=f.controller.dispatch({action:'cancel'});
  await new Promise(r=>setImmediate(r));
  assert.equal(f.view().busy,true);assert.deepEqual(f.view().allowedActions,[]);
  await assert.rejects(f.controller.dispatch({action:'connect-metamask',providerId:f.view().providers[0].providerId}));
  releaseEnd();releaseAccount();await cancelling;await connecting;
  assert.equal(f.view().busy,false);await f.controller.destroy();
});

test('unknown revocation blocks reconnect and late provider events cannot restore authentication', async () => {
  const f = fixture({rejectedRevoke:true}); await f.ready(); await f.controller.dispatch({action:'sign-in'});
  f.provider.emit('accountsChanged'); await new Promise(r => setImmediate(r));
  assert.equal(f.view().authenticated, false); assert.equal(f.view().selectedChoiceId, null);
  assert.equal(f.view().error.code, 'REVOCATION_UNKNOWN'); assert.deepEqual(f.view().allowedActions, ['sign-out']);
  await assert.rejects(f.controller.dispatch({action:'connect-metamask',providerId:'provider-1'})); await f.controller.destroy();
});

test('unknown Moodle end blocks reconnect after cancellation or dispatch failure, without resending end', async () => {
  for (const failure of ['cancel', 'dispatch', 'sign-out']) {
    const f = fixture({rejectedEnd: true, serverRole: failure === 'dispatch' ? 'participant' : 'operator'});
    await f.ready(); await f.controller.dispatch({action:'sign-in'});
    if (failure === 'cancel') { f.provider.emit('accountsChanged'); await new Promise(r => setImmediate(r)); }
    if (failure === 'sign-out') await f.controller.dispatch({action:'sign-out'});
    assert.equal(f.view().authenticated, false, failure);
    assert.deepEqual(f.view().allowedActions, [], failure);
    assert.equal(f.view().error.outcome, 'UNKNOWN', failure);
    assert.equal(f.stages.filter(s => s === 'end').length, 1, failure);
    await assert.rejects(f.controller.dispatch({action:'connect-metamask', providerId:f.view().providers[0].providerId}));
    await assert.rejects(f.controller.dispatch({action:'sign-in'}));
    await f.controller.destroy();
    assert.equal(f.stages.filter(s => s === 'end').length, 1, failure);
  }
});

test('silent account change during Moodle finish never renders CONNECTED and retires the captured session', async () => {
  const f = fixture({changeAccountsOnFinish:true});
  await f.ready(); await f.controller.dispatch({action:'sign-in'});
  await f.controller.dispatch({action:'finish-connection'});
  await new Promise(r => setImmediate(r));
  assert(f.stages.includes('finish'));
  assert(!f.views.some(v => v.phase === 'CONNECTED'));
  assert.equal(f.view().authenticated, false);
  assert(f.stages.includes('revoke')); assert(f.stages.includes('end'));
  await f.controller.destroy();
});

test('native handshake confines sesskey to C and lost finish response invokes only status, never a second finish', async () => {
  const hex = 'aa'.repeat(32), seen = [];
  const login = createNativeMoodleLogin({config,
    locks: {request: (_name, _options, run) => run()},
    api: async (path, options) => {
      assert(!JSON.stringify(options).includes(config.sesskey)); seen.push(path);
      return path.endsWith('bootstrap') ? {challenge: hex, expiresAtExclusive: 2000}
        : {status: 'WAITING', role: 'operator', expiresAtExclusive:2000, commandBinding:'cc'.repeat(32)};
    },
    fetch: async (url, options) => {
      assert.equal(url, origin + '/local/clearbridge/login_action.php');
      assert.equal(options.body.get('sesskey'), config.sesskey); const op = options.body.get('operation'); seen.push(op);
      assert(!options.headers?.['x-csrf-token']);
      if (['status','end'].includes(op)) assert.equal(options.body.get('intentTarget'), hex);
      if (op === 'finish') throw Error('synthetic response loss');
      return {ok:true, redirected:false, json:async () => op === 'start'
        ? {status:'WAITING',expiresAtExclusive:2000,launchCode:hex,browserProof:hex,finishProof:hex,intentTarget:hex}
        : {status:op === 'status' ? 'CONNECTED' : 'ENDED'}};
    }});
  const signal = new AbortController().signal;
  await login.end(signal); assert.deepEqual(seen, []);
  await login.begin(signal);
  await login.complete({request:async path => {seen.push(path);return {status:'RETURN_TO_MOODLE'};}},signal);
  await login.finish(signal);
  assert.deepEqual(seen, ['/moodle/connect/bootstrap','start','/moodle/connect/redeem','/auth/moodle-complete','finish','status']);
  await assert.rejects(login.finish(signal));
});

test('restored participant SDK wallet stays unselected and exposes no provider object', async () => {
  const target=new EventTarget();target.navigator={locks:{request:(_name,_options,run)=>run()}};
  const events=new EventEmitter(),calls=[],views=[];
  events.request=async ({method})=>{calls.push(method);return method==='eth_accounts'?[address]:'0x3039';};
  const account={type:'wallet',chainType:'ethereum',walletClientType:'privy',connectorType:'embedded',address,
    imported:false,delegated:false,userCanSign:true,walletIndex:0,id:'fixture-wallet'};
  const wallet={type:'ethereum',walletClientType:'privy',connectorType:'embedded',address,linked:true,imported:false,
    walletIndex:0,chainId:'eip155:12345',switchChain:async()=>{calls.push('switch');},getEthereumProvider:async()=>events};
  const controller=createCourseWalletController({config:{...config,role:'participant'},target,onState:v=>views.push(v),
    sdk:{login:async()=>{calls.push('oauth');},logout:async()=>{}},loginFactory:()=>({end:async()=>{}}),
    fetch:async (_url,options)=>({ok:true,redirected:false,json:async()=>({result:JSON.parse(options.body).method==='eth_chainId'?'0x3039':'0x'})})});
  controller.update({ready:true,authenticated:true,user:{id:'fixture-user',linkedAccounts:[account]},wallets:[wallet],walletsReady:false});
  assert.deepEqual(calls,[]);assert.deepEqual(views.at(-1).providers,[]);assert.equal(views.at(-1).selectedChoiceId,null);
  const choiceId=views.at(-1).choices[0].choiceId;
  assert.deepEqual(Object.keys(views.at(-1).choices[0]).sort(),['address','choiceId']);
  await controller.dispatch({action:'select-wallet',choiceId});assert.deepEqual(calls,[]);
  await controller.dispatch({action:'check-network'});assert.equal(views.at(-1).phase,'NETWORK_READY');
  assert(!calls.includes('oauth'));await controller.destroy();
});

test('native status and end retain the original intent target and never accept NOT_CURRENT', async () => {
  const proof = 'aa'.repeat(32), target = 'bb'.repeat(32), forms = [];
  const login = createNativeMoodleLogin({config, locks:{request:(_name,_options,run)=>run()},
    api:async path=>path.endsWith('bootstrap')?{challenge:proof,expiresAtExclusive:2000}
      :{status:'WAITING',role:'operator',expiresAtExclusive:2000,commandBinding:'cc'.repeat(32)},
    fetch:async (_url,options)=>{
      const form=Object.fromEntries(options.body); forms.push(form);
      if(form.operation==='finish')throw Error('lost response');
      return {ok:true,redirected:false,json:async()=>form.operation==='start'
        ?{status:'WAITING',expiresAtExclusive:2000,launchCode:proof,browserProof:proof,finishProof:proof,intentTarget:target}
        :{status:'NOT_CURRENT'}};
    }});
  const signal=new AbortController().signal;
  await login.begin(signal); await assert.rejects(login.finish(signal));
  login.invalidate(); await assert.rejects(login.end(signal));
  assert.deepEqual(forms.filter(f=>['status','end'].includes(f.operation)).map(f=>Object.keys(f).sort()),
    [['id','intentTarget','operation','sesskey'],['id','intentTarget','operation','sesskey']]);
  assert(forms.filter(f=>['status','end'].includes(f.operation)).every(f=>f.intentTarget===target));
  await assert.rejects(login.begin(signal));
});

test('workflow reads require the original completed connection and cancellation discards a late result',async()=>{
 let release;const workflowGate=new Promise(r=>{release=r;}),f=fixture({workflowGate});
 await assert.rejects(f.controller.runWorkflow({action:'read-session'}),/NOT_READY/);
 await f.ready();await f.controller.dispatch({action:'sign-in'});await f.controller.dispatch({action:'finish-connection'});
 const reading=f.controller.runWorkflow({action:'read-session'});reading.catch(()=>{});
 for(let i=0;i<10&&!f.stages.includes('/bootcamp/v4/session');i++)await new Promise(r=>setImmediate(r));
 assert(f.stages.includes('/bootcamp/v4/session'));await f.controller.dispatch({action:'cancel'});release();
 await assert.rejects(reading,e=>e.code==='MOODLE_WORKFLOW_UNAVAILABLE'&&e.outcome==='NOT_SENT');
 assert.equal(f.view().authenticated,false);await f.controller.destroy();
});

test('visible Moodle readers keep the session fresh after an explicit read and stop on teardown', async t => {
  t.mock.timers.enable({apis:['setInterval']});
  const document = {visibilityState:'visible'}, f = fixture({document});
  t.after(() => f.controller.destroy());
  await f.ready();
  await f.controller.dispatch({action:'sign-in'});
  await f.controller.dispatch({action:'finish-connection'});
  const reads = () => f.stages.filter(path => path === '/bootcamp/v4/session').length;
  const tick = async () => {t.mock.timers.tick(1000); await new Promise(r=>setImmediate(r));};
  await tick(); assert.equal(reads(),0);
  await f.controller.runWorkflow({action:'read-session'});
  await tick(); assert.equal(reads(),2);
  document.visibilityState='hidden';
  await tick(); assert.equal(reads(),2);
  document.visibilityState='visible';
  await tick(); assert.equal(reads(),3);
  await f.controller.destroy();
  await tick(); assert.equal(reads(),3);
});

async function connectedDiagnostic(f){await f.ready();await f.controller.dispatch({action:'sign-in'});await f.controller.dispatch({action:'finish-connection'});}
test('read 409 does not cancel or record; auth and write failures retain pre-normalized cause',async()=>{
 const f=fixture({requestError:Object.assign(Error('BC_VIEW_STALE'),{status:409})});await connectedDiagnostic(f);
 await assert.rejects(f.controller.runWorkflow({action:'read-session'}));
 assert.equal(f.view().authenticated,true);assert.equal(f.diagnosticWrites.length,0);await f.controller.destroy();
 for(const kind of ['auth','write']){
  const cause=Object.assign(Error(kind==='auth'?'AUTH_REQUIRED':'API_REQUEST_FAILED'),{status:kind==='auth'?401:409,body:'secret'});
  const x=fixture(kind==='auth'?{requestError:cause}:{commandError:cause});await connectedDiagnostic(x);
  const action=kind==='auth'?'read-session':'create-application';
  await assert.rejects(x.controller.runWorkflow({action,...(kind==='write'?{idempotencyKey:'synthetic-create'}:{})}));
  assert.equal(x.view().authenticated,false);assert.equal(x.diagnosticWrites.length,1);
  assert.deepEqual(readCancelDiagnostic(x.storage),{version:1,event:'CANCEL_TRIGGER',sequence:1,origin:'workflow-failure',action,causeCode:cause.message,httpStatus:cause.status});
  assert(x.stages.indexOf('diagnostic')<x.stages.indexOf('revoke'));
  await x.controller.destroy();await x.controller.destroy();assert.equal(x.diagnosticWrites.length,1);
 }
});
test('explicit cancel during pending read records once before duplicate disposal',async()=>{
 let release;const f=fixture({workflowGate:new Promise(r=>{release=r;})});await connectedDiagnostic(f);
 const pending=f.controller.runWorkflow({action:'read-session'});pending.catch(()=>{});
 await new Promise(r=>setImmediate(r));await f.controller.dispatch({action:'cancel'});release();await assert.rejects(pending);
 await f.controller.destroy();await f.controller.destroy();
 assert.equal(f.diagnosticWrites.length,1);assert.equal(readCancelDiagnostic(f.storage).origin,'explicit-cancel');
});
test('dispatch and wallet changes have distinct first triggers; storage failure cannot block revoke',async()=>{
 const f=fixture({serverRole:'participant'});await f.ready();await f.controller.dispatch({action:'sign-in'});
 assert.equal(readCancelDiagnostic(f.storage).origin,'dispatch-failure');assert.equal(readCancelDiagnostic(f.storage).causeCode,'ROLE_CHANGED');await f.controller.destroy();
 for(const storageFailure of [false,true]){
  const x=fixture({storageFailure});await connectedDiagnostic(x);x.provider.emit('accountsChanged');await new Promise(r=>setImmediate(r));
  assert(x.stages.includes('revoke'));if(!storageFailure)assert.equal(readCancelDiagnostic(x.storage).origin,'wallet-change');
  await x.controller.destroy();
 }
});
test('local diagnostic persists only fixed vocabulary after controller destruction',async()=>{
 const secret='token-cookie-wallet-application-signature-body-url-stack';
 const f=fixture({commandError:Object.assign(Error(secret),{code:secret,status:403,stack:secret,body:secret})});await connectedDiagnostic(f);
 await assert.rejects(f.controller.runWorkflow({action:'create-application',idempotencyKey:'synthetic-create'}));await f.controller.destroy();
 const d=readCancelDiagnostic(f.storage);assert.equal(d.causeCode,'UNKNOWN');assert.equal(d.httpStatus,403);
 assert(!f.storage.getItem(cancelDiagnosticKey).includes(secret));
 assert.deepEqual(Object.keys(d).sort(),['action','causeCode','event','httpStatus','origin','sequence','version']);
 const recorder=createCancelDiagnostic(f.storage);recorder.record('destroy','NONE',new Proxy({},{get(){throw Error(secret);}}));
 assert.equal(readCancelDiagnostic(f.storage).sequence,2);assert.equal(readCancelDiagnostic(f.storage).causeCode,'UNKNOWN');
 recorder.record('destroy','NONE');assert.equal(readCancelDiagnostic(f.storage).sequence,2);
});

test('expiry and direct destruction record once, and a later login starts a new diagnostic sequence',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const f=fixture();await connectedDiagnostic(f);t.mock.timers.tick(60000);await new Promise(r=>setImmediate(r));
 assert.equal(readCancelDiagnostic(f.storage).origin,'expiry');assert.equal(readCancelDiagnostic(f.storage).causeCode,'EXPIRED');
 assert(f.stages.includes('revoke'));await f.controller.destroy();assert.equal(f.diagnosticWrites.length,1);
 const x=fixture();await connectedDiagnostic(x);await x.controller.dispatch({action:'sign-out'});
 assert.equal(readCancelDiagnostic(x.storage).origin,'sign-out');await connectedDiagnostic(x);await x.controller.destroy();await x.controller.destroy();
 assert.equal(x.diagnosticWrites.length,2);assert.equal(readCancelDiagnostic(x.storage).origin,'destroy');assert.equal(readCancelDiagnostic(x.storage).sequence,2);
});
