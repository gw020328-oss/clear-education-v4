import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';
import {syntheticMemoryCheck} from './memory-bridge.mjs';import {fixtureSigner} from '../model.mjs';import {record,proof,NOW} from './fixture.mjs';
const input=async()=>({scope:'PUBLIC_SYNTHETIC_ONLY',record:record(),proof:await proof(),signer:fixtureSigner().address.toLowerCase(),now:NOW});
function watch(){let child,closed=false,messages=0;return {forkChild:(...args)=>{const opts=args[2];assert.deepEqual(opts.execArgv,[]);assert.deepEqual(opts.stdio,['ignore','ignore','ignore','ipc']);assert.deepEqual(Object.keys(opts.env).sort(),['LOG_LEVEL','PATH']);child=fork(...args);child.on('message',()=>messages++);child.once('close',()=>closed=true);return child;},assertClosed:()=>{assert.equal(closed,true);assert.equal(child.connected,false);},assertMessages:n=>assert.equal(messages,n)};}
test('synthetic claim crosses memory IPC; public-only response waits for process close',async()=>{
 const w=watch(),result=await syntheticMemoryCheck(await input(),w);w.assertClosed();
 assert.equal(result.claimSignatureVerified,true);assert.equal(result.zkParserIntegrated,false);assert.equal(result.paymentAllowed,false);
 for(const marker of ['123456','history_html','signature','private','rowCount'])assert.equal(JSON.stringify(result).includes(marker),false);
});
test('tampered proof fails without exposing source or exception details',async()=>{
 const i=await input();i.proof.claim.context='PUBLIC_SYNTHETIC_PRIVATE_MARKER';const w=watch();
 await assert.rejects(syntheticMemoryCheck(i,w),e=>e.message==='MEMORY_CHECK_FAILED');w.assertClosed();
});
for(const behavior of ['hang','crash','malformed','network','duplicate'])test('worker '+behavior+' closes before safe failure',async()=>{
 const w=watch();await assert.rejects(syntheticMemoryCheck({scope:'PUBLIC_SYNTHETIC_ONLY',behavior},{...w,timeoutMs:behavior==='hang'?100:30000,workerUrl:new URL('./worker-fixture.mjs',import.meta.url)}),e=>e.message==='MEMORY_CHECK_FAILED');w.assertClosed();if(behavior==='duplicate')w.assertMessages(2);
});
test('abort reaps a running child; official/live mode stays disabled',async()=>{
 const controller=new AbortController(),w=watch();
 const p=syntheticMemoryCheck({scope:'PUBLIC_SYNTHETIC_ONLY',behavior:'hang'},{...w,signal:controller.signal,workerUrl:new URL('./worker-fixture.mjs',import.meta.url)});
 controller.abort();await assert.rejects(p,/MEMORY_CHECK_FAILED/);w.assertClosed();
 await assert.rejects(syntheticMemoryCheck({scope:'OFFICIAL'}),/LIVE_DISABLED/);
});
