import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {runYbmRoute} from '../../src/ybm-collector/run.mjs';
import {FakeClient} from './fake-client.mjs';
import {parseOptions} from '../../src/mac-collector/options.mjs';

function harness(overrides={}) {
  const client=new FakeClient(), calls=[], output=[], input=new PassThrough();let closedBrowser=false,closedClient=false;
  const options={
    openClient:async()=>({client,close:async()=>{closedClient=true;client.disconnect();}}),
    probe:async route=>{assert.equal(route.client,client);return {ybmHomeStatus:200};},
    launchBrowser:async(_session,opts)=>{assert.equal(opts.synthetic,false);assert.match(opts.proxyUrl,/^http:\/\/127\.0\.0\.1:/);return {
      send:async(method)=>{calls.push(method);if(method==='Target.getTargets')return {targetInfos:[{type:'page',targetId:'page'}]};if(method==='Target.attachToTarget')return {sessionId:'tab'};return {};},
      close:async()=>{closedBrowser=true;},
    };},input,output:line=>{output.push(line);},...overrides,
  };
  return {client,calls,output,input,options,closed:()=>({closedBrowser,closedClient})};
}
test('public rehearsal uses one client, does not enable capture or read cookies and closes resources',async()=>{
  const h=harness();const result=await runYbmRoute({},h.options);assert.equal(result.rawCapture,false);assert.equal(result.liveProof,false);assert.equal(result.sameClient,true);
  assert.deepEqual(h.calls,['Target.getTargets','Target.attachToTarget','Page.navigate']);assert.deepEqual(h.closed(),{closedBrowser:true,closedClient:true});
});
test('public probe failure closes client before any browser/login is opened',async()=>{
  const h=harness({probe:async()=>{throw new Error('PUBLIC_ROUTE_NOT_READY');}});await assert.rejects(runYbmRoute({},h.options),/PUBLIC_ROUTE_NOT_READY/);assert.equal(h.calls.length,0);assert.equal(h.closed().closedClient,true);
});
test('interactive login awaits explicit close; output is fixed text only',async()=>{
  const h=harness();h.options.interactive=true;
  h.options.output=line=>{h.output.push(line);if(h.output.length===3)setImmediate(()=>h.input.end('close\n'));};
  const result=await runYbmRoute({},h.options);assert.equal(result.scope,'YBM_LOGIN_ROUTE_ONLY');assert.equal(result.liveProof,false);assert.deepEqual(h.closed(),{closedBrowser:true,closedClient:true});
});
test('connection loss while user logs in terminates session and browser',async()=>{
  const h=harness();h.options.interactive=true;h.options.output=()=>setImmediate(()=>h.client.disconnect());
  await assert.rejects(runYbmRoute({},h.options),/ROUTE_RESTART_REQUIRES_LOGIN/);assert.deepEqual(h.closed(),{closedBrowser:true,closedClient:true});assert.equal(h.client.events.eventNames().length,0);
});
test('manual browser close ends login wait and releases the client',async()=>{
  const h=harness();const original=h.options.launchBrowser;h.options.interactive=true;
  h.options.launchBrowser=async(...args)=>({...await original(...args),closed:Promise.resolve()});
  await runYbmRoute({},h.options);assert.deepEqual(h.closed(),{closedBrowser:true,closedClient:true});
});
test('synthetic roots cannot enable real network mode',()=>{
  assert.throws(()=>parseOptions(['--ybm-route'],'/synthetic'),/MIXED_EXECUTION_MODES/);
  assert.throws(()=>parseOptions(['--public-route-check'],'/synthetic'),/MIXED_EXECUTION_MODES/);
  assert.throws(()=>parseOptions(['--ybm-route','--test-hold']),/MIXED_EXECUTION_MODES/);
  assert.throws(()=>parseOptions(['--ybm-route','--public-route-check']),/MIXED_EXECUTION_MODES/);
  assert.throws(()=>parseOptions(['--test-hold']),/TEST_ONLY/);
  assert.throws(()=>parseOptions(['--unknown']),/UNKNOWN_OPTION/);
  assert.equal(parseOptions(['--ybm-route']).interactive,true);
  assert.equal(parseOptions([]).network,undefined);
});

test('collection diagnostic requires opt-in and an interactive real-network mode',async()=>{
 assert.throws(()=>parseOptions(['--ybm-collection-check'],'/synthetic'),/MIXED_EXECUTION_MODES/);
 assert.throws(()=>parseOptions(['--ybm-route','--ybm-collection-check']),/MIXED_EXECUTION_MODES/);
 assert.equal(parseOptions(['--ybm-collection-check']).collectionCheck,true);
 await assert.rejects(runYbmRoute({}, {collectionCheck:true}),/INTERACTIVE_COLLECTION_REQUIRED/);
});

test('collection mode does not enable Fetch before ready and cancellation closes resources',async()=>{
 const h=harness(),events=new Map();const original=h.options.launchBrowser;
 h.options.launchBrowser=async(...args)=>({...await original(...args),on:(m,fn)=>{events.set(m,fn);return()=>events.delete(m);}});
 h.options.interactive=true;h.options.collectionCheck=true;
 h.options.output=line=>{h.output.push(line);if(h.output.length===3)setImmediate(()=>h.input.end('close\n'));};
 const result=await runYbmRoute({},h.options);assert.equal(result.collection.complete,false);assert.equal(result.rawCapture,false);assert.equal(result.liveProof,false);assert.ok(!h.calls.includes('Fetch.enable'));assert.deepEqual(h.closed(),{closedBrowser:true,closedClient:true});assert.equal(events.size,0);
});

test('ready connects recipient authorization, browser collection, matching and cleanup end to end',async()=>{
 const {registrationHtml,scoreHtml}=await import('./source-fixture.mjs');
 const {endpoints,methods}=await import('../../src/ybm-collector/source-policy.mjs');
 const h=harness(),events=new Map();const original=h.options.launchBrowser;
 h.options.launchBrowser=async(...args)=>{const b=await original(...args);return {...b,on:(m,fn)=>{events.set(m,fn);return()=>events.delete(m);},send:async(m,p,s)=>m==='Fetch.getResponseBody'?{body:p.requestId==='registration'?registrationHtml():scoreHtml(),base64Encoded:false}:b.send(m,p,s)};};
 h.options.interactive=true;h.options.collectionCheck=true;
 h.options.output=line=>{h.output.push(line);if(h.output.length===3)setImmediate(()=>h.input.write('ready\n'));if(h.output.length===4)setImmediate(()=>{
  for(const role of ['registration','score'])events.get('Fetch.requestPaused')({requestId:role,request:{url:endpoints[role],method:methods[role]},responseStatusCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}]},'tab');
 });};
 const result=await runYbmRoute({},h.options);assert.equal(result.collection.complete,true);assert.equal(result.collection.applicationBound,true);assert.equal(result.rawCapture,true);assert.equal(result.liveProof,false);assert.equal(result.payment,false);assert.equal(result.sameClient,true);assert.equal(events.size,0);assert.deepEqual(h.closed(),{closedBrowser:true,closedClient:true});assert.ok(!JSON.stringify(result).includes('123456'));assert.ok(h.output.some(line=>line.startsWith('진단 완료:')));
});

test('proof check is interactive, isolated from synthetic modes and needs registry before browser',async()=>{
 assert.equal(parseOptions(['--ybm-proof-check']).proofCheck,true);
 for(const args of [['--ybm-proof-check','--ybm-collection-check'],['--ybm-proof-check','--show-browser']])assert.throws(()=>parseOptions(args));
 assert.throws(()=>parseOptions(['--ybm-proof-check'],'/synthetic'));
 await assert.rejects(runYbmRoute({}, {proofCheck:true}),/INTERACTIVE_COLLECTION_REQUIRED/);
 const h=harness();await assert.rejects(runYbmRoute({},{...h.options,proofCheck:true,interactive:true,loadTrust:async()=>{throw new Error('ATTESTOR_TRUST_UNAVAILABLE');}}));assert.equal(h.calls.length,0);
});
for(const cancelDuringProof of [false,true])test('proof runner '+(cancelDuringProof?'cancels on user close':'passes the login client and cleans up without leaking secrets'),async()=>{
 const {registrationHtml,scoreHtml}=await import('./source-fixture.mjs');
 const {endpoints,methods}=await import('../../src/ybm-collector/source-policy.mjs');
 const h=harness(),events=new Map();const original=h.options.launchBrowser;let secretReads=0;
 h.options.launchBrowser=async(...args)=>{const b=await original(...args);return {...b,on:(m,fn)=>{events.set(m,fn);return()=>events.delete(m);},send:async(m,p,s)=>{
  if(m==='Network.getCookies'){secretReads++;return {cookies:[{name:'SYNTHETIC',value:'SYNTHETIC_COOKIE',domain:'.toeic.co.kr'}]};}
  if(m==='Fetch.getResponseBody')return {body:p.requestId==='registration'?registrationHtml():scoreHtml(),base64Encoded:false};
  return b.send(m,p,s);
 }};};
 h.options.interactive=true;h.options.proofCheck=true;h.options.loadTrust=async()=>['0x'+'12'.repeat(20)];
 h.options.prove=async options=>{
  assert.equal(options.client,h.client);assert.equal(options.routeClient,h.client);assert.equal(options.scoreIndex,0);options.diagnostic.collection.assertActive();
  if(cancelDuringProof){setImmediate(()=>h.input.write('close\n'));await new Promise(resolve=>options.signal.addEventListener('abort',resolve,{once:true}));throw new Error('CANCELLED');}
  return {proofVerified:true,independentProcess:true,paymentAllowed:false};
 };
 h.options.output=line=>{h.output.push(line);if(h.output.length===3){assert.equal(secretReads,0);setImmediate(()=>h.input.write('ready\n'));}if(h.output.length===4)setImmediate(()=>{
  for(const role of ['registration','score'])events.get('Fetch.requestPaused')({requestId:role,request:{url:endpoints[role],method:methods[role],...(role==='registration'?{postData:'encExamData=SYNTHETIC&zzxxcc='}:{})},responseStatusCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}]},'tab');
 });};
 if(cancelDuringProof)await assert.rejects(runYbmRoute({},h.options),/CANCELLED/);
 else {const result=await runYbmRoute({},h.options);assert.equal(result.verification.proofVerified,true);assert.equal(result.payment,false);}
 assert.equal(secretReads,2);assert.equal(events.size,0);assert.deepEqual(h.closed(),{closedBrowser:true,closedClient:true});assert.ok(!h.output.join('').includes('SYNTHETIC_COOKIE'));
});
