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
function fixture({accountGate, endGate, rejectedRevoke = false, serverRole = 'operator'} = {}) {
  const target = new EventTarget(); target.navigator = {locks: {request: (_name, _options, run) => run()}};
  const provider = new EventEmitter(), calls = [], stages = [], views = [];
  provider.request = async ({method}) => {
    calls.push(method);
    if (method === 'eth_requestAccounts') { await accountGate; return [address]; }
    if (method === 'eth_accounts') return [address];
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
    sessionFactory: () => ({
      async authenticate() { stages.push('authenticate'); return {role: serverRole}; },
      async assertSession() { stages.push('assert-session'); return {wallet: address, role: serverRole, expiresAt: Math.floor(Date.now()/1000)+60}; },
      async dispose() { stages.push('revoke'); if (rejectedRevoke) throw Error('synthetic'); },
    }),
    loginFactory: () => Object.fromEntries(['begin','complete','finish','end'].map(method => [method, async () => {
      stages.push(method); if(method==='end')await endGate;
    }]))});
  const view = () => views.at(-1);
  async function ready() {
    await controller.dispatch({action: 'connect-metamask', providerId: view().providers[0].providerId});
    await controller.dispatch({action: 'select-wallet', choiceId: view().choices[0].choiceId});
    await controller.dispatch({action: 'check-network'});
  }
  return {controller, view, views, calls, stages, provider, ready};
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
  assert.equal(f.view().phase, 'CONNECTED'); assert.equal(f.stages.at(-1), 'finish');
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

test('native handshake confines sesskey to C and lost finish response invokes only status, never a second finish', async () => {
  const hex = 'aa'.repeat(32), seen = [];
  const login = createNativeMoodleLogin({config,
    locks: {request: (_name, _options, run) => run()},
    api: async (path, options) => {
      assert(!JSON.stringify(options).includes(config.sesskey)); seen.push(path);
      return path.endsWith('bootstrap') ? {challenge: hex, expiresAtExclusive: 2000}
        : {status: 'WAITING', role: 'operator', expiresAtExclusive:2000};
    },
    fetch: async (url, options) => {
      assert.equal(url, origin + '/local/clearbridge/login_action.php');
      assert.equal(options.body.get('sesskey'), config.sesskey); const op = options.body.get('operation'); seen.push(op);
      assert(!options.headers?.['x-csrf-token']);
      if (op === 'finish') throw Error('synthetic response loss');
      return {ok:true, redirected:false, json:async () => op === 'start'
        ? {status:'WAITING',expiresAtExclusive:2000,launchCode:hex,browserProof:hex,finishProof:hex}
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
