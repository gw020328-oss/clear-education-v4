import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpsRequest} from 'node:https';
import {once} from 'node:events';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {procedureFixture,START} from './procedure-fixture.mjs';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createBootcampFrontendServer} from '../../tools/bootcamp/frontend-server.mjs';
import {createNormalBootcampClient,normalView} from '../../src/bootcamp/normal-client.mjs';

async function fixture(t){
 const f=await procedureFixture(t),tlsDirectory=join(f.directory,'c1-tls');mkdirSync(tlsDirectory,{mode:0o700});
 const fingerprint=createCertificates(tlsDirectory),mounted=createBootcampFrontendServer({authentication:f.service,store:f.store,
  tls:loadTls(tlsDirectory,fingerprint),sourceMode:'SYNTHETIC_TEST_SOURCE',chainId:f.config.chainId});
 mounted.server.listen(0,'127.0.0.1');await once(mounted.server,'listening');
 t.after(async()=>{mounted.server.closeAllConnections();await new Promise(r=>mounted.server.close(r));await mounted.drain();});
 let posts=0;
 function raw(path,{method='GET',body,context=f.aliceContext,idempotencyKey,headers={}}={}){
  if(method==='POST')posts++;
  return new Promise((resolve,reject)=>{
   const req=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:mounted.server.address().port,path,method,
    ca:readFileSync(join(tlsDirectory,'ca.pem')),headers:{host:'clear.example.invalid',origin:f.config.origin,
     cookie:'__Host-clear-session='+context.token,'x-wallet':context.wallet,'x-chain-id':String(context.chainId),'x-csrf-token':context.csrf,
     ...(body===undefined?{}:{'content-type':'application/json'}),...(idempotencyKey?{'idempotency-key':idempotencyKey}:{}),...headers}},res=>{
      const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks)),headers:res.headers}));
     });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
 }
 const client=context=>createNormalBootcampClient({request:async(path,options)=>{const r=await raw(path,{...options,context});
  if(r.status!==200)throw Object.assign(Error(r.body.error),{status:r.status});return r.body;}});
 return {f,mounted,raw,client,posts:()=>posts};
}
test('existing HTTPS auth and bootcamp handlers serve both roles and preserve null versus zero and original states',async t=>{
 const x=await fixture(t),a=x.f.create(),learner=x.client(x.f.aliceContext),operator=x.client(x.f.operatorContext);
 const s=await learner.view(a),o=await operator.view(a);
 assert.equal(s.sourceMode,'SYNTHETIC_TEST_SOURCE');assert.deepEqual(s.target,o.target);assert.equal(s.decision.current,true);
 assert.equal(s.decision.evidenceCurrent,false);assert.ok(s.criteria.every(r=>r.state!=='MET'&&r.current===false));
 assert.equal(s.agreedPayment.amountAtoms,'100000000');assert.equal(s.funding.amountAtoms,'100000000');
 assert.equal(s.payment.receivedAtoms,null);assert.equal(s.payment.canonicalTransferVerified,null);
 assert.equal(o.role,'COURSE_OPERATOR');assert.ok(o.criteria.every(r=>r.originalEvidence.authorized===false));
 assert.ok(s.criteria.every(r=>r.originalEvidence.httpAvailable===false&&r.source.actualSourceVerification===null));
 const config=await x.raw('/__dev/config');assert.equal(config.body.sourceCollectionConfigured,false);assert.equal(config.body.executionReceiptHttpImplemented,false);
 assert.equal((await x.raw(`/bootcamp/v2/applications/${a}/source-collection`,{method:'POST',body:{}})).status,404);
 assert.equal((await x.raw('/rpc',{method:'POST',body:{method:'eth_sendRawTransaction'}})).status,404);
 assert.equal((await x.raw(`/bootcamp/v3/applications/${a}/unsigned-preparations`,{method:'POST',body:{}})).status,404);
});
test('S4 same-origin HTTPS mount serves both roles and historical decision GET while rejecting writes and foreign owners',async t=>{
 const x=await fixture(t),a=x.f.create();await x.f.complete(a);
 const counts=x.f.counts(),learner=x.client(x.f.aliceContext),operator=x.client(x.f.operatorContext);
 const initial=await learner.decisionEvidence(a),d=initial.manifest.decision.decisionId;
 assert.deepEqual((await operator.decisionEvidence(a,{decisionId:d})).manifest,initial.manifest);
 const base=`/bootcamp/v3/applications/${a}/decision-evidence`;
 assert.equal((await x.raw(base)).headers['cache-control'],'no-store');
 await assert.rejects(x.client(x.f.bobContext).decisionEvidence(a),/FORBIDDEN/);
 assert.equal((await x.raw(base,{headers:{origin:'https://wrong.invalid'}})).status,403);
 assert.equal((await x.raw(base,{headers:{cookie:''}})).status,401);
 assert.equal((await x.raw(base,{method:'POST',body:{}})).status,404);
 assert.equal((await x.raw(base+'/decision-missing')).status,404);
 x.f.setTime(START+302);const past=await operator.decisionEvidence(a,{decisionId:d});
 assert.equal(past.manifestHash,initial.manifestHash);assert.equal(past.availability.every(r=>r.status==='EXPIRED'),true);
 assert.deepEqual(x.f.counts(),counts);
});
test('both roles consent to the same target; explicit replay is idempotent and old target is refused',async t=>{
 const x=await fixture(t),a=x.f.create();await x.f.complete(a);x.f.publish(a);
 const learner=x.client(x.f.aliceContext),operator=x.client(x.f.operatorContext),s=await learner.view(a),o=await operator.view(a);
 assert.equal(s.decision.conditionsStatus,'MET');assert.ok(s.criteria.every(r=>r.current&&r.state==='MET'));
 assert.equal(s.funding.matchesCurrentDecision,true);assert.deepEqual(s.target,o.target);
 const options={idempotencyKey:'same-target-student'},first=await learner.consent(a,s,'AGREE',options);
 assert.equal(first.record.target.decisionId,s.target.targetDecisionId);
 assert.deepEqual(await learner.consent(a,s,'AGREE',options),first);assert.deepEqual(await learner.operation(a,first.record.operationId),first);
 const count=x.posts();await assert.rejects(operator.consent(a,o,'AGREE',{idempotencyKey:'stale-operator'}),/BC_VIEW_STALE/);assert.equal(x.posts(),count+1);
 const current=await operator.view(a);await operator.consent(a,current,'AGREE',{idempotencyKey:'current-operator'});
 const both=await learner.view(a);assert.equal(both.consent.bothCurrent,true);assert.equal(both.procedure.status,'EARLY_CONSENT_PREFLIGHT_CANDIDATE');
 assert.equal(both.payment.transactionState,null);assert.equal(both.payment.receivedAtoms,null);
});
test('wrong wallet, CSRF, origin and uninstalled route cannot become successful frontend results',async t=>{
 const x=await fixture(t),a=x.f.create();
 await assert.rejects(x.client(x.f.bobContext).view(a),/FORBIDDEN/);
 assert.equal((await x.raw(`/bootcamp/v3/applications/${a}/procedure`,{headers:{origin:'https://wrong.invalid'}})).status,403);
 assert.equal((await x.raw(`/bootcamp/v3/applications/${a}/review-consents`,{method:'POST',body:{},headers:{'x-csrf-token':'wrong'}})).status,403);
 assert.equal((await x.raw(`/bootcamp/v3/applications/${a}/procedure`,{headers:{cookie:''}})).status,401);
 assert.equal((await x.raw('/__dev/config',{headers:{origin:'https://wrong.invalid'}})).status,403);
 assert.equal((await x.raw('/private/test-roles.json')).status,404);
});
test('accepted right remains distinct from receipt/received amount after source expiry',async t=>{
 const x=await fixture(t),a=x.f.create();await x.f.complete(a);x.f.publish(a);x.f.setAccepted();x.f.setTime(START+400);
 const view=await x.client(x.f.operatorContext).view(a);
 assert.equal(view.procedure.status,'ACCEPTED_RIGHT_PRESERVED');assert.equal(view.payment.acceptedRight.state,'FIXED_RIGHT_PRESERVED');
 assert.equal(view.payment.claimState,'UNCLAIMED');assert.equal(view.payment.receivedAtoms,null);
 assert.equal(view.payment.transactionState,'FINALIZED');assert.equal(view.payment.canonicalTransferVerified,null);
 assert.ok(view.criteria.every(r=>r.current===false));
});
test('changed source between reads rejects a mixed view without retrying or posting',async t=>{
 const x=await fixture(t),a=x.f.create();await x.f.complete(a);x.f.publish(a);let calls=0;
 const client=createNormalBootcampClient({request:async(path,options)=>{
  const r=await x.raw(path,options);if(++calls===2)x.f.setTime(START+301);if(r.status!==200)throw Error(r.body.error);return r.body;
 }});
 await assert.rejects(client.view(a),/BC_NORMAL_STALE/);assert.equal(calls,4);assert.equal(x.posts(),0);
});
test('missing funding port is null, and projection rejects unsupported versions and mixed decision hashes',async t=>{
 const x=await fixture(t),a=x.f.create(),p=x.f.store.getProcedure(x.f.aliceContext,a),o=x.f.store.getOperationsProjection(x.f.aliceContext,a);
 const p0=structuredClone(p);Object.assign(p0.funding,{implementation:'NOT_IMPLEMENTED',status:null,amountAtoms:null,reservedAtoms:null});
 const view=normalView({procedure:p0,operations:o,host:x.mounted.config});assert.equal(view.funding.amountAtoms,null);assert.equal(view.funding.reservedAtoms,null);
 assert.throws(()=>normalView({procedure:p,operations:{...o,decisionHash:'0x'+'00'.repeat(32)},host:x.mounted.config}),/BC_NORMAL_STALE/);
 assert.throws(()=>normalView({procedure:{...p,version:'unknown'},operations:o,host:x.mounted.config}),/BC_NORMAL_RESPONSE/);
 const badProcedure=structuredClone(p),badOperations=structuredClone(o);badProcedure.evidence.criteria[0].state=badOperations.evidence.criteria[0].state='NEW_UNKNOWN_ENUM';
 assert.throws(()=>normalView({procedure:badProcedure,operations:badOperations,host:x.mounted.config}),/BC_NORMAL_RESPONSE/);
 assert.throws(()=>normalView({procedure:p,operations:o,host:{...x.mounted.config,policyHash:'0x'+'00'.repeat(32)}}),/BC_NORMAL_RESPONSE/);
});
test('mounted existing authentication challenge and login retain Secure HttpOnly cookie',async t=>{
 const x=await fixture(t),q=await x.raw('/auth/nonce',{method:'POST',body:{wallet:x.f.alice.address,chainId:x.f.config.chainId}});
 assert.equal(q.status,200);const preauth=q.headers['set-cookie'][0].split(';')[0];
 const logged=await x.raw('/auth/verify',{method:'POST',body:{nonce:q.body.nonce,signature:await x.f.alice.signMessage(q.body.message)},headers:{cookie:preauth}});
 assert.equal(logged.status,200);assert.ok(logged.headers['set-cookie'].some(c=>c.startsWith('__Host-clear-session=')&&c.includes('Secure')&&c.includes('HttpOnly')));
 assert.equal(logged.body.token,undefined);
});

test('active wallet network is explicit loopback only and never inherited by the display host',async t=>{
 const x=await fixture(t);assert.equal(x.mounted.config.network,null);assert.equal(x.mounted.config.phase,'DISPLAY_ONLY');
 const dir=join(x.f.directory,'network-tls');mkdirSync(dir,{mode:0o700});const fp=createCertificates(dir);
 const options={authentication:x.f.service,store:x.f.store,tls:loadTls(dir,fp),sourceMode:'REGISTERED_TEST_SOURCE',chainId:x.f.config.chainId,normalUi:{}};
 const server=createBootcampFrontendServer({...options,network:{chainId:x.f.config.chainId,rpcUrl:'http://127.0.0.1:19999'}});
 assert.equal(server.config.phase,'ACTIVE_LOCAL_TEST');assert.deepEqual(server.config.network.rpcUrls,['http://127.0.0.1:19999']);
 assert.equal(server.config.network.chainId,'0x'+BigInt(x.f.config.chainId).toString(16));assert.equal(server.config.network.nativeCurrency.decimals,18);
 for(const network of [{chainId:x.f.config.chainId+1,rpcUrl:'http://127.0.0.1:19999'},{chainId:x.f.config.chainId,rpcUrl:'https://public.invalid'},
  {chainId:x.f.config.chainId,rpcUrl:'http://user:pass@127.0.0.1:19999'}])assert.throws(()=>createBootcampFrontendServer({...options,network}),/BC_FRONTEND_NETWORK/);
});
