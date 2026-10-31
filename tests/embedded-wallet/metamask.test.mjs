import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Wallet, getBytes} from 'ethers';
import {discoverMetaMask, requestMetaMaskAddress, connectMetaMask} from '../../src/embedded-wallet/metamask-adapter.mjs';
const config = {appId: null, origin: 'https://127.0.0.1:9457', redirectUri: 'https://127.0.0.1:9457/onboarding',
  rpcUrl: 'http://127.0.0.1:9458', phase: 'AUTH_LOCAL_TEST', chainId: 1234567890, instanceId: '0x' + 'a'.repeat(64)};
function actor(t) {
  const signer = Wallet.createRandom(), provider = new EventEmitter(), calls = [];
  let accounts = [signer.address], chain = '0x1', missing = false, reject = null, hook = null;
  provider.request = async q => {
    calls.push(q); if (hook) { const result = await hook(q); if (result !== undefined) return result; }
    if (q.method === 'eth_requestAccounts' || q.method === 'eth_accounts') return accounts;
    if (q.method === 'eth_chainId') return chain;
    if (q.method === 'wallet_switchEthereumChain') {
      if (reject) throw Object.assign(Error('denied'), {code: reject});
      if (missing) throw Object.assign(Error('missing'), {code: 4902});
      chain = q.params[0].chainId; provider.emit('chainChanged', chain); return null;
    }
    if (q.method === 'wallet_addEthereumChain') { missing = false; return null; }
    if (q.method === 'personal_sign') return signer.signMessage(getBytes(q.params[0]));
    throw Error('UNEXPECTED_METHOD');
  };
  const choice = {id: '00000000-0000-4000-8000-000000000001', provider, address: signer.address};
  let current = choice, invalidated = 0;
  const connect = async () => {
    const boundary = await connectMetaMask({choice, address: signer.address, readChoice: () => current, config,
      onInvalidate: () => {invalidated++;}}); t.after(() => boundary.dispose()); return boundary;
  };
  return {signer,provider,choice,calls,connect,get invalidated(){return invalidated;},
    accounts: v => {accounts=v;}, missing: () => {missing=true;}, reject: v => {reject=v;},
    current: v => {current=v;}, hook: v => {hook=v;}};
}
test('EIP-6963 discovery ignores other wallets and cannot replace a selected provider', t => {
  const a=actor(t), target=new EventTarget(); let choices=[];
  const stop=discoverMetaMask(target,v=>{choices=v;});
  const emit=(rdns,provider=a.provider)=>target.dispatchEvent(Object.assign(new Event('eip6963:announceProvider'),
    {detail:{info:{rdns,uuid:a.choice.id},provider}}));
  emit('untrusted.example'); assert.equal(choices.length,0);
  emit('io.metamask'); assert.equal(choices.length,1); assert.equal(choices[0].provider,a.provider);
  emit('io.metamask',{request(){},on(){},removeListener(){}}); assert.equal(choices[0].provider,a.provider);
  stop(); assert.equal(choices.length,1);
});
test('address discovery requires exactly one permitted account and sends no signature', async t => {
  const a=actor(t); assert.equal(await requestMetaMaskAddress(a.provider),a.signer.address);
  for(const list of [[],[a.signer.address,Wallet.createRandom().address]]){
    a.accounts(list); await assert.rejects(requestMetaMaskAddress(a.provider),/ONE_ACCOUNT_REQUIRED/);
  }
  assert.ok(a.calls.every(q=>q.method==='eth_requestAccounts'));
});
test('missing custom chain adds only validated loopback config then pins provider/address/chain', async t => {
  const a=actor(t);a.missing();const boundary=await a.connect();await boundary.guard();
  const add=a.calls.find(q=>q.method==='wallet_addEthereumChain');
  assert.deepEqual(add.params[0].rpcUrls,[config.rpcUrl]);assert.equal(add.params[0].chainId,'0x'+config.chainId.toString(16));
  assert.equal(add.params[0].blockExplorerUrls,undefined);
  assert.equal(boundary.pin.address,a.signer.address);
  const sig=await boundary.personal('synthetic CLEAR login',{expiresAt:Math.floor(Date.now()/1000)+60});assert.equal(sig.length,132);
  assert.ok(!a.calls.some(q=>q.method.startsWith('eth_send')));
});
test('rejected chain switch never adds a chain or signs', async t => {
  const a=actor(t);a.reject(4001);await assert.rejects(a.connect());
  assert.deepEqual(a.calls.map(q=>q.method),['wallet_switchEthereumChain']);
});
test('provider or selected address replacement fails guard even without an event',async t=>{
  for(const change of ['provider','address']){
    const a=actor(t),boundary=await a.connect();
    a.current({...a.choice,[change]:change==='provider'?new EventEmitter():Wallet.createRandom().address});
    await assert.rejects(boundary.guard(),/SELECTION_CHANGED/);assert.equal(a.invalidated,1);
  }
});
test('MetaMask account change while signing discards a late signature and retires boundary',async t=>{
  const a=actor(t),boundary=await a.connect();let resolveSign,started;
  const begun=new Promise(r=>{started=r;});
  a.hook(q=>q.method==='personal_sign'?new Promise(r=>{resolveSign=r;started();}):undefined);
  const signing=boundary.personal('late',{expiresAt:Math.floor(Date.now()/1000)+60});
  await begun;a.provider.emit('accountsChanged',[Wallet.createRandom().address]);
  resolveSign(await a.signer.signMessage('late'));await assert.rejects(signing,/CANCELLED/);
  await assert.rejects(boundary.guard(),/CANCELLED/);assert.equal(a.invalidated,1);
});
test('cancellation during network prompt cannot publish a connected boundary',async t=>{
  const a=actor(t),controller=new AbortController();let resolveSwitch,started;
  const begun=new Promise(r=>{started=r;});
  a.hook(q=>q.method==='wallet_switchEthereumChain'?new Promise(r=>{resolveSwitch=r;started();}):undefined);
  const pending=connectMetaMask({choice:a.choice,address:a.signer.address,readChoice:()=>a.choice,config,signal:controller.signal});
  await begun;controller.abort();resolveSwitch(null);await assert.rejects(pending,/CANCELLED/);
  assert.equal(a.provider.listenerCount('accountsChanged'),0);
});
