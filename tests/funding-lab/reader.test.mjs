import test from 'node:test';
import assert from 'node:assert/strict';
import { id } from 'ethers';
import { openLab } from '../../spikes/funding-lab/environment.mjs';
import { createLabReader } from '../../spikes/funding-lab/reader.mjs';
const setup=async t=>{const f=await openLab();t.after(f.close);await f.register();return f;};
test('lost submission response recovers from a new reader and retry never doubles credit/payment',async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId;const {operationId,tx}=await f.topUp('100000000');
  const restarted=createLabReader(f.provider,f.pin);assert.equal((await restarted.operation(app,operationId,'100000000')).applied,true);
  assert.equal((await restarted.confirmTopUp(app,operationId,'100000000',tx.hash)).applied,true);
  await(await f.vault.topUp(app,operationId,'100000000')).wait();await f.mine();assert.equal((await restarted.snapshot(app)).fundedTotalAtoms,'100000000');
  await(await f.vault.allocate(app)).wait();await(await f.vault.claim(app)).wait(); // pretend response was lost
  await f.mine();assert.equal((await createLabReader(f.provider,f.pin).snapshot(app)).claimState,'PAID');
  await(await f.vault.claim(app)).wait();assert.equal(await f.token.balanceOf(f.fixtures[0].recipient),100000000n);
});
test('pending, failed, wrong transaction and conflicting operation never become confirmed funding',async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId,op=id('new');
  await assert.rejects(()=>f.reader.confirmTopUp(app,op,'1',id('missing')),/LAB_TX_UNKNOWN/);
  const bad=await f.vault.topUp(app,op,1,{gasLimit:500000});await assert.rejects(()=>bad.wait());await f.mine();
  await assert.rejects(()=>f.reader.confirmTopUp(app,op,'1',bad.hash),/LAB_TX_FAILED/);
  const {operationId,tx}=await f.topUp('40000000');
  await assert.rejects(()=>f.reader.confirmTopUp(app,operationId,'1',tx.hash),/LAB_TX_BINDING/);
  await assert.rejects(()=>f.reader.operation(app,operationId,'1'),/LAB_OPERATION_CONFLICT/);
  await(await f.token.approve(f.pin.vault,1)).wait();const recent=await f.vault.topUp(app,op,1);await recent.wait();
  await assert.rejects(()=>f.reader.confirmTopUp(app,op,'1',recent.hash),/LAB_CONFIRMATIONS/);
  await f.mine();assert.equal((await f.reader.confirmTopUp(app,op,'1',recent.hash)).applied,true);
});
test('reorg removes prior receipt/credit; fresh reader rechecks canonical state',async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId,checkpoint=await f.provider.send('evm_snapshot',[]);
  const {tx,operationId}=await f.topUp('100000000');assert.equal((await f.reader.confirmTopUp(app,operationId,'100000000',tx.hash)).applied,true);
  await f.provider.send('evm_revert',[checkpoint]);for(let i=0;i<5;i++)await f.mine();
  await assert.rejects(()=>f.reader.confirmTopUp(app,operationId,'100000000',tx.hash),/LAB_TX_UNKNOWN|LAB_REORG/);
  assert.equal((await f.reader.operation(app,operationId,'100000000')).applied,false);assert.equal((await f.reader.snapshot(app)).securedAtoms,'0');
});
test('wrong pins, RPC failure and block replacement during a read fail closed',async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId;
  for(const patch of [{genesisHash:id('wrong')},{instanceId:id('wrong')},{configHash:id('wrong')}])await assert.rejects(()=>createLabReader(f.provider,{...f.pin,...patch}).snapshot(app),/LAB_ENVIRONMENT/);
  assert.throws(()=>createLabReader(f.provider,{...f.pin,confirmations:1}),/LAB_PIN/);
  const failing=new Proxy(f.provider,{get(target,key){if(key==='send')return async()=>{throw new Error('SYNTHETIC_RPC_UNAVAILABLE');};const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
  await assert.rejects(()=>createLabReader(failing,f.pin).snapshot(app),/RPC_UNAVAILABLE/);
  let reads=0;const replaced=new Proxy(f.provider,{get(target,key){if(key==='send')return async(method,args)=>{const r=await target.send(method,args);if(method==='eth_getBlockByNumber'&&args[0]!=='0x0'&&++reads===2)return {...r,hash:id('reorg')};return r;};const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
  await assert.rejects(()=>createLabReader(replaced,f.pin).snapshot(app),/LAB_REORG/);
});

test('a mismatched transaction receipt cannot confirm another operation',async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId,{operationId,tx}=await f.topUp('100000000');
  const swapped=new Proxy(f.provider,{get(target,key){if(key==='send')return async(method,args)=>{const r=await target.send(method,args);return method==='eth_getTransactionReceipt'?{...r,transactionHash:id('other-tx')}:r;};const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
  await assert.rejects(()=>createLabReader(swapped,f.pin).confirmTopUp(app,operationId,'100000000',tx.hash),/LAB_TX_BINDING/);
});
