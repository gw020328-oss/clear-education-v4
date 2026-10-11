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
