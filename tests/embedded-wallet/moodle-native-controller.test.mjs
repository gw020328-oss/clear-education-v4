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
  rejectedRevoke = false, serverRole = 'operator', workflowGate, document, requestError, commandError, storageFailure=false, requestFor, commandResult, revokeError} = {}) {
  const target = new EventTarget(); target.navigator = {locks: {request: (_name, _options, run) => run()}};
  target.document = document;
  const provider = new EventEmitter(), calls = [], stages = [], views = [], commandInputs = [];
  const values=new Map(),diagnosticWrites=[];
  target.localStorage={getItem:k=>values.get(k)??null,setItem(k,v){if(storageFailure)throw Error('denied');values.set(k,v);diagnosticWrites.push(JSON.parse(v));stages.push('diagnostic');}};
  let currentAddress = address;
  provider.request = async ({method}) => {
    calls.push(method);
    if (method === 'eth_requestAccounts') { await accountGate; return [address]; }
    if (method === 'eth_accounts') return [currentAddress];
    if (method === 'eth_chainId') return '0x3039';
    if (method === 'wallet_switchEthereumChain') return null;
    if (method === 'wallet_revokePermissions') { if (revokeError) throw revokeError; return null; }
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
      async request(path){stages.push(path);await workflowGate;if(requestError)throw requestError;const custom=requestFor?.(path);if(custom!==undefined)return custom;return {version:'clear-bootcamp-normal-session.1',role:'OPERATOR',applicationId:null,policyHash:'0x'+'11'.repeat(32),runtimeMappingHash:'0x'+'22'.repeat(32),sourceMode:'REGISTERED_TEST_SOURCE',receiptRequired:true};},
      async dispose() { stages.push('revoke'); if (rejectedRevoke) throw Error('synthetic'); },
    }),
    loginFactory: () => Object.fromEntries(['begin','complete','finish','end','command'].map(method => [method, async (...args) => {
      stages.push(method);
      if(method==='command')commandInputs.push(args[1]);
      if(method==='command'&&commandError)throw commandError;
      if(method==='command'&&commandResult!==undefined)return commandResult;
      if (method === 'finish' && changeAccountsOnFinish) currentAddress = '0x'+'34'.repeat(20);
      if (method === 'end') { await endGate; if (rejectedEnd) throw Error('synthetic lost end response'); }
    }]))});
  const view = () => views.at(-1);
  async function ready() {
    await controller.dispatch({action: 'connect-metamask', providerId: view().providers[0].providerId});
    await controller.dispatch({action: 'select-wallet', choiceId: view().choices[0].choiceId});
    await controller.dispatch({action: 'check-network'});
  }
  return {controller, view, views, calls, stages, provider, ready,diagnosticWrites,storage:target.localStorage,commandInputs};
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

test('exact certificate CAS rejection preserves connection and requires explicit fresh review',async()=>{
 // Inject the API layer's trusted fixed error, whose route/status allowlist is tested separately.
 const cause=Object.assign(Error('API_REQUEST_FAILED'),{code:'BC_REVISION_CONFLICT',status:409});
 const f=fixture({requestError:cause});await connectedDiagnostic(f);
 const before=f.stages.filter(s=>s==='/bootcamp/v4/session').length;
 await assert.rejects(f.controller.runWorkflow({action:'start-certificate',applicationId:'application-one',expectedRevision:1,idempotencyKey:'start-one'}),error=>error.code==='MOODLE_CERTIFICATE_REVIEW_CHANGED'&&error.outcome==='HTTP_ERROR'&&error.serverEffect==='NOT_ACCEPTED');
 assert.equal(f.view().authenticated,true);assert.equal(f.view().phase,'CONNECTED');
 assert.equal(f.diagnosticWrites.length,0);assert(!f.stages.includes('revoke'));
 assert.equal(f.stages.filter(s=>s==='/bootcamp/v4/session').length,before+1);
 await f.controller.destroy();
});

test('certificate exception does not cover auth status, other writes or unknown conflicts',async()=>{
 for(const [action,cause]of [['start-certificate',Object.assign(Error('API_REQUEST_FAILED'),{code:'BC_REVISION_CONFLICT',status:401})],['start-certificate',Object.assign(Error('API_REQUEST_FAILED'),{code:'BC_REVISION_CONFLICT',status:403})],['start-certificate',Object.assign(Error('API_REQUEST_FAILED'),{code:'API_REQUEST_FAILED',status:409})],['create-application',Object.assign(Error('API_REQUEST_FAILED'),{code:'BC_REVISION_CONFLICT',status:409})]]){
  const f=fixture(action==='create-application'?{commandError:cause}:{requestError:cause});await connectedDiagnostic(f);
  await assert.rejects(f.controller.runWorkflow(action==='start-certificate'?{action,applicationId:'application-one',expectedRevision:1,idempotencyKey:'start-one'}:{action,idempotencyKey:'create-one'}));
  assert.equal(f.view().authenticated,false);assert.equal(f.diagnosticWrites.length,1);assert(f.stages.includes('revoke'));await f.controller.destroy();
 }
});

// Operator consent: a stale reviewed target (fresh pre-consent view) or an exact server CAS 409 was not recorded.
function consentViews(){
 const h=n=>'0x'+String(n).repeat(64).slice(0,64);
 const evidence={conditionsStatus:'MET',current:true,validUntilExclusive:null,criteria:['activity-complete','assignment-submitted','reflection-topics','python-basic-certificate'].map(criterionId=>({criterionId,state:'MET',current:true,evidenceId:'evidence-'+criterionId,originalEvidenceAccessible:false}))};
 const procedure={version:'clear-bootcamp-review-procedure.1',applicationId:'application-one',role:'COURSE_OPERATOR',policyHash:h(1),runtimeMappingHash:h(2),applicationRevision:8,ledgerSequence:70,decisionId:'decision-one',decisionRevision:5,decisionHash:h(3),asOf:1,evidence,funding:{},procedure:{},consent:{records:[]},objection:{blocked:false},chain:{acceptedRight:null,transactionState:null,transactionHash:null,blockRef:null}};
 const operations={...procedure,version:'clear-bootcamp-operations-projection.2',role:'OPERATOR',current:true};
 const requestFor=path=>path==='/__dev/config'?{version:'clear-bootcamp-frontend-host.1',sourceMode:'REGISTERED_TEST_SOURCE',policyHash:h(1),procedureHttpVersion:procedure.version,operationsHttpVersion:operations.version}
  :path.endsWith('/procedure')?structuredClone(procedure):path.endsWith('/operations')?structuredClone(operations):undefined;
 return {procedure,operations,requestFor};
}
test('consent whose reviewed target changed before sending keeps the login and reports NOT_ACCEPTED',async()=>{
 const v=consentViews(),f=fixture({requestFor:v.requestFor});await connectedDiagnostic(f);
 const reviewed=await f.controller.runWorkflow({action:'read-application',applicationId:'application-one'});
 v.procedure.ledgerSequence++;v.operations.ledgerSequence++; // the other role consented meanwhile
 await assert.rejects(f.controller.runWorkflow({action:'consent',reviewed,value:'AGREE',idempotencyKey:'consent-old'}),
  error=>error.code==='MOODLE_CONSENT_REVIEW_CHANGED'&&error.outcome==='NOT_SENT'&&error.serverEffect==='NOT_ACCEPTED');
 assert(!f.stages.includes('command'),'nothing was sent');assert.equal(f.view().authenticated,true);assert.equal(f.view().phase,'CONNECTED');
 assert(!f.stages.includes('revoke'));assert.equal(f.diagnosticWrites.length,0);
 const current=await f.controller.runWorkflow({action:'read-application',applicationId:'application-one'});
 assert.equal(current.target.expectedLedgerSequence,71,'a fresh review shows the new target');
 await f.controller.destroy();
});
test('consent pressed before chain registration (exact 409 NOT_READY) keeps the login and records nothing',async()=>{
 const early=Object.assign(Error('API_REQUEST_FAILED'),{code:'BC_NORMAL_PROCEDURE_NOT_READY',status:409,outcome:'HTTP_ERROR'});
 const v=consentViews(),f=fixture({requestFor:v.requestFor,commandError:early});await connectedDiagnostic(f);
 const reviewed=await f.controller.runWorkflow({action:'read-application',applicationId:'application-one'});
 await assert.rejects(f.controller.runWorkflow({action:'consent',reviewed,value:'AGREE',idempotencyKey:'consent-early'}),
  error=>error.code==='MOODLE_CONSENT_REVIEW_CHANGED'&&error.serverEffect==='NOT_ACCEPTED');
 assert.equal(f.view().authenticated,true);assert(!f.stages.includes('revoke'));assert.equal(f.diagnosticWrites.length,0);
 await f.controller.destroy();
 const x=fixture({requestFor:consentViews().requestFor,commandError:Object.assign(Error('API_REQUEST_FAILED'),{code:'BC_NORMAL_PROCEDURE_NOT_READY',status:503})});
 await connectedDiagnostic(x);const r=await x.controller.runWorkflow({action:'read-application',applicationId:'application-one'});
 await assert.rejects(x.controller.runWorkflow({action:'consent',reviewed:r,value:'AGREE',idempotencyKey:'consent-x'}),e=>e.code==='MOODLE_WORKFLOW_UNAVAILABLE');
 assert.equal(x.view().authenticated,false,'a non-409 status is still not a definite rejection');await x.controller.destroy();
});
test('exact server consent CAS rejection keeps the login; unknown or auth consent failures still cancel',async()=>{
 const stale=Object.assign(Error('API_REQUEST_FAILED'),{code:'BC_VIEW_STALE',status:409});
 const v=consentViews(),f=fixture({requestFor:v.requestFor,commandError:stale});await connectedDiagnostic(f);
 const reviewed=await f.controller.runWorkflow({action:'read-application',applicationId:'application-one'});
 await assert.rejects(f.controller.runWorkflow({action:'consent',reviewed,value:'AGREE',idempotencyKey:'consent-one'}),
  error=>error.code==='MOODLE_CONSENT_REVIEW_CHANGED'&&error.outcome==='HTTP_ERROR'&&error.serverEffect==='NOT_ACCEPTED');
 assert.equal(f.view().authenticated,true);assert(!f.stages.includes('revoke'));assert.equal(f.diagnosticWrites.length,0);
 await f.controller.destroy();
 for(const cause of [Object.assign(Error('API_REQUEST_FAILED'),{code:'API_REQUEST_FAILED',status:409}),
  Object.assign(Error('API_REQUEST_FAILED'),{code:'BC_VIEW_STALE',status:403}),Object.assign(Error('API_NETWORK'),{code:'API_NETWORK',outcome:'UNKNOWN'})]){
  const w=consentViews(),x=fixture({requestFor:w.requestFor,commandError:cause});await connectedDiagnostic(x);
  const r=await x.controller.runWorkflow({action:'read-application',applicationId:'application-one'});
  await assert.rejects(x.controller.runWorkflow({action:'consent',reviewed:r,value:'AGREE',idempotencyKey:'consent-x'}),error=>error.code==='MOODLE_WORKFLOW_UNAVAILABLE');
  assert.equal(x.view().authenticated,false);assert(x.stages.includes('revoke'));await x.controller.destroy();
 }
});

test('operator preview request uses one fresh Moodle command grant per call and never cancels the login on failure',async()=>{
 const body={version:'clear-operator-preview.1',sourceText:'synthetic notice'};
 const f=fixture({commandResult:{version:'clear-operator-preview.1',stage:'PREPARED'}});await connectedDiagnostic(f);
 assert.deepEqual(await f.controller.previewRequest('/bootcamp/preview/prepare',{method:'POST',body}),{version:'clear-operator-preview.1',stage:'PREPARED'});
 await f.controller.previewRequest('/bootcamp/preview/prepare',{method:'POST',body});
 const [a,b]=f.commandInputs;
 assert.deepEqual([a.method,a.path,a.body],['POST','/bootcamp/preview/prepare',body]);assert.notEqual(a.body,body,'body is copied');
 assert.match(a.idempotencyKey,/^preview-[0-9a-f]{24}$/);assert.notEqual(a.idempotencyKey,b.idempotencyKey,'no key reuse');
 for(const [path,options] of [['/bootcamp/preview/publish',{method:'POST',body}],['/bootcamp/preview/prepare',{method:'GET',body}],
  ['/bootcamp/preview/prepare',{method:'POST',body:null}],['/bootcamp/v3/applications',{method:'POST',body}]])
  await assert.rejects(f.controller.previewRequest(path,options),/MOODLE_PREVIEW_REQUEST/);
 assert.equal(f.commandInputs.length,2,'refused shapes never reach Moodle');
 await f.controller.destroy();
 const failed=Object.assign(Error('API_REQUEST_FAILED'),{code:'API_REQUEST_FAILED',status:503,outcome:'UNKNOWN'});
 const x=fixture({commandError:failed});await connectedDiagnostic(x);
 await assert.rejects(x.controller.previewRequest('/bootcamp/preview/execute',{method:'POST',body}),e=>e===failed,'the API error reaches the panel unchanged');
 assert.equal(x.view().authenticated,true);assert(!x.stages.includes('revoke'));assert.equal(x.diagnosticWrites.length,0,'a preview failure is not a payment workflow failure');
 await x.controller.destroy();
 const n=fixture();await assert.rejects(n.controller.previewRequest('/bootcamp/preview/prepare',{method:'POST',body}),/MOODLE_PREVIEW_NOT_READY/);await n.controller.destroy();
});
test('participant pages have no preview request',async()=>{
 const target=new EventTarget();target.navigator={locks:{request:(_n,_o,run)=>run()}};
 const c=createCourseWalletController({config:{...config,role:'participant'},target,onState(){},fetch:async()=>({ok:true,json:async()=>({})}),
  sdk:{login:async()=>{},logout:async()=>{}},loginFactory:()=>({end:async()=>{}}),sessionFactory:()=>({})});
 await assert.rejects(c.previewRequest('/bootcamp/preview/prepare',{method:'POST',body:{a:1}}),/MOODLE_PREVIEW_REQUEST/);await c.destroy();
});

test('operator connect drops an earlier site permission before asking for accounts, and tolerates wallets without it',async()=>{
 const f=fixture();await f.ready();
 const i=f.calls.indexOf('wallet_revokePermissions'),j=f.calls.indexOf('eth_requestAccounts');
 assert(i>=0&&j>i,'revoke precedes the account request');assert.equal(f.calls.filter(c=>c==='wallet_revokePermissions').length,1);
 await f.controller.destroy();
 const x=fixture({revokeError:Object.assign(Error('unsupported'),{code:4200})});await x.ready();
 assert(x.calls.includes('eth_requestAccounts'),'unsupported revoke falls back to the old request');assert(x.calls.includes('wallet_switchEthereumChain'),'the flow continues to the network check');
 await x.controller.destroy();
});
