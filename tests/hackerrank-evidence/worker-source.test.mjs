// Entirely invented responses and ephemeral signatures; network is forbidden.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import {fixture,NOW,USERNAME,actors,sdk,signProof} from './fixture.mjs';
import {createHackerRankCollector,readHackerRankCollectorLease} from '../../src/hackerrank-evidence/collector.mjs';
import {createHackerRankVerifier} from '../../src/hackerrank-evidence/verifier.mjs';
import {workerRecipe,parametersFor} from '../../src/hackerrank-evidence/recipes.mjs';
import {requestMessage} from '../../src/hackerrank-evidence/request.mjs';
import {canonical,hash} from '../../src/hackerrank-evidence/values.mjs';
import {inspectWorkerTranscript} from '../../src/hackerrank-evidence/worker-response.mjs';
import {collectWorkerSource,readWorkerSource} from '../../src/hackerrank-evidence/worker-source.mjs';
const quiet={trace(){},debug(){},info(){},warn(){},error(){},fatal(){},child(){return this;}};
const COOKIE='session=SYNTHETIC_PRIVATE_COOKIE',PRIVATE='synthetic-private-email@example.invalid';
function account(username=USERNAME){return '<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{prefetchedData:{profile:{username,email:PRIVATE,unused:0.5}},dehydrateState:{queries:[{queryKey:['prefetchData'],state:{data:{profile:{username,email:PRIVATE}}}}]}}}})+'</script></body></html>';}
function row(id='synthetic-python-rose',status='test_passed'){return {id,attributes:{username:USERNAME,status,test_unique_id:'synthetic-test-python',certificate:{label:'Python',level:'Basic',track_slug:'python_basic',unique_id:'different-metadata-id'},unused:0.75,private:PRIVATE}};}
function response(body,role,{chunked=false,headers='',status='200 OK'}={}){
 const bytes=Buffer.from(body),type=role==='account'?'text/html':'application/json';
 const payload=chunked?Buffer.concat([Buffer.from(bytes.length.toString(16)+'\r\n'),bytes,Buffer.from('\r\n0\r\n\r\n')]):bytes;
 return Buffer.concat([Buffer.from(`HTTP/1.1 ${status}\r\nContent-Type: ${type}; charset=utf-8\r\n${chunked?'Transfer-Encoding: chunked':'Content-Length: '+bytes.length}\r\n${headers}\r\n`),payload]);
}
function packet(sender,bytes,tlsVersion){return {sender,message:{type:'ciphertext',contentType:'APPLICATION_DATA',data:Buffer.from([23]),plaintext:tlsVersion==='TLS1_3'?Buffer.concat([bytes,Buffer.from([23])]):Buffer.from(bytes)}};}
function transcriptFor(input,body,options={}){
 const tlsVersion=options.tlsVersion??'TLS1_3',http=sdk.providers.http,request=http.createRequest(input.secretParams,structuredClone(input.params),quiet);
 const raw=response(body,input.context.clearSourceRole,options),requestBytes=Buffer.from(request.data);
 const transcript=[packet('client',requestBytes,tlsVersion),packet('server',raw.subarray(0,29),tlsVersion),packet('server',raw.subarray(29),tlsVersion)];
 return {tlsVersion,transcript,raw,request,requestBytes};
}
async function proofFor(input,wire,change){
 const http=sdk.providers.http,req=Buffer.from(wire.requestBytes),res=Buffer.from(wire.raw);
 for(const r of wire.request.redactions)req.fill('*',r.fromIndex,r.toIndex);
 for(const r of http.getResponseRedactions({response:wire.raw,params:input.params,logger:quiet,ctx:sdk.PROVIDER_CTX}))res.fill('*',r.fromIndex,r.toIndex);
 assert.equal(req.includes(COOKIE),false);assert.equal(res.includes(PRIVATE),false);
 const fields=(await http.assertValidProviderReceipt({clientVersion:sdk.PROVIDER_CTX.version,receipt:[{sender:'client',message:req},{sender:'server',message:res}],params:input.params,logger:quiet,ctx:sdk.PROVIDER_CTX})).extractedParameters;
 const claim={provider:'http',parameters:canonical(input.params),owner:(new Wallet(input.ownerPrivateKey)).address.toLowerCase(),timestampS:NOW-1,epoch:1,identifier:'',context:canonical({...input.context,providerHash:sdk.hashProviderParams(input.params),extractedParameters:fields})};
 if(change)change(claim);
 const proof=await signProof(claim);
 return {proof,result:{claim:proof.claim,signatures:{claimSignature:Buffer.from(proof.signature.slice(2),'hex'),attestorAddress:proof.attestor}}};
}
async function setup({bodies={},selection=null,wireOptions={},hook,changeClaim,clock=()=>NOW}={}){
 const f=await fixture(),config={...f.config,recipe:workerRecipe()};
 const collector=createHackerRankCollector({trustConfig:config,commitmentKey:f.key,clock});
 const request={...f.request,selectedCertificateId:selection,expectedClaimOwner:collector.claimOwner,recipeHash:hash('RECIPE',config.recipe),trustConfigHash:hash('TRUST',config)};
 const envelope={request,signature:await actors.participant.signMessage(requestMessage(request))},proofs={},calls=[],inputs=[];
 const client={isOpen:true,isInitialised:true,metadata:{clientVersion:sdk.PROVIDER_CTX.version},async terminateConnection(){this.isOpen=false;}};
 let lease;
 const options={envelope,expectedRequest:request,client,routeClient:client,async readCookies({role}){calls.push(role);return COOKIE;},
  async createClaim(input){
   inputs.push(input);const role=input.context.clearSourceRole;
   const wire=transcriptFor(input,bodies[role]??(role==='account'?account():JSON.stringify({data:[row()]})),wireOptions);
   const before=wire.transcript.map(b=>Buffer.from(b.message.plaintext));
   if(hook)await hook(input,wire);else assert.deepEqual(await input.updateProviderParams(wire.transcript,wire.tlsVersion),{params:{},secretParams:{}});
   for(let i=0;i<before.length;i++)assert.deepEqual(wire.transcript[i].message.plaintext,before[i]);
   const signed=await proofFor(input,wire,changeClaim);proofs[role]=signed.proof;return signed.result;
  },async submit(value){lease=value.lease;value.recheck();},
 };
 return {config,key:f.key,collector,request,envelope,proofs,calls,inputs,options,get lease(){return lease;}};
}
test('same TLS response yields a private lease with explicit worker/attestor responsibilities',async()=>{
 for(const tlsVersion of ['TLS1_2','TLS1_3'])for(const chunked of [false,true]){
  const x=await setup({wireOptions:{tlsVersion,chunked}}),candidate=await x.collector.collect(x.options);
  assert.equal(candidate.condition,'MET');assert.equal(candidate.sourceVersion,'hackerrank-two-proof.3');
  assert.equal(candidate.verification.structureValidation,'TRUSTED_WORKER');assert.equal(candidate.verification.disclosedFieldValidation,'ATTESTOR');assert.equal(candidate.verification.independentStructureProof,false);
  assert.equal(readHackerRankCollectorLease(x.lease).candidate,candidate);
  for(const secret of [PRIVATE,COOKIE,USERNAME,'synthetic-python-rose'])assert.equal(JSON.stringify(candidate).includes(secret),false);
  const naked=await createHackerRankVerifier({trustConfig:x.config,commitmentKey:x.key,clock:()=>NOW}).verify({envelope:x.envelope,proofs:x.proofs},x.request);
  assert.equal(naked.code,'WORKER_SOURCE_REQUIRED');x.lease.dispose();
 }
});
test('explicit selection binds all disclosed fields to one row; failed certificate is NOT_MET',async()=>{
 const x=await setup({selection:'selected-python',bodies:{certificate:JSON.stringify({data:[row(),row('selected-python','test_failed')]})}});
 const candidate=await x.collector.collect(x.options);assert.equal(candidate.condition,'NOT_MET');x.lease.dispose();
});
test('missing, repeated and failed hooks cannot be hidden by a signed driver result',async()=>{
 for(const hook of [async()=>{},async(i,w)=>{await i.updateProviderParams(w.transcript,w.tlsVersion);await assert.rejects(i.updateProviderParams(w.transcript,w.tlsVersion));},async(i,w)=>{await assert.rejects(i.updateProviderParams([],w.tlsVersion));}]){
  const x=await setup({hook});await assert.rejects(x.collector.collect(x.options),/WORKER_HOOK_REQUIRED/);assert.deepEqual(x.calls,['account']);assert.equal(x.lease,undefined);
 }
});
test('hook retained after completion cannot mint a new source observation',async()=>{
 const x=await setup();await x.collector.collect(x.options);
 await assert.rejects(x.inputs[0].updateProviderParams([], 'TLS1_3'),/WORKER_HOOK_REUSED/);x.lease.dispose();
});
test('final signed params, owner, context and fields must equal the same observed call',async()=>{
 for(const changeClaim of [c=>{const p=JSON.parse(c.parameters);p.method='POST';c.parameters=canonical(p);},c=>{c.owner=actors.other.address.toLowerCase();},c=>{const v=JSON.parse(c.context);v.clearRequestHash='0x'+'ff'.repeat(32);c.context=canonical(v);},c=>{const v=JSON.parse(c.context);v.extractedParameters.username='synthetic-other';c.context=canonical(v);},c=>{const v=JSON.parse(c.context);v.providerHash='wrong';c.context=canonical(v);}]){
  const x=await setup({changeClaim});await assert.rejects(x.collector.collect(x.options),/WORKER_SIGNED_CLAIM|SIGNED_REQUEST_BINDING|WORKER_SIGNED_FIELDS/);assert.deepEqual(x.calls,['account']);
 }
});
test('strict account path, decoded duplicate keys, duplicate scripts and cache disagreement fail privately',async()=>{
 const original=account();
 for(const body of [original.replace('"profile":{"username":','"profile":{"username":"shadow","user\\u006eame":'),original+original,original.replaceAll('prefetchedData','otherData'),original.replace('"queryKey":["prefetchData"]','"queryKey":["other"]'),original.replaceAll('"profile":{"username":','"profile":{"decoy":{"username":"synthetic-other"},"username":')]){
  const x=await setup({bodies:{account:body}});await assert.rejects(x.collector.collect(x.options),e=>!e.message.includes(USERNAME)&&!e.message.includes(PRIVATE));assert.deepEqual(x.calls,['account']);
 }
});
test('cross-account rows, duplicate IDs, ambiguity, wrong class and unknown status fail before lease',async()=>{
 const other=row('other');other.attributes.username='synthetic-other';
 const wrong=row();wrong.attributes.certificate.label='Other';
 for(const rows of [[row(),other],[row(),row()],[row(),row('another')],[wrong],[row('unknown','unknown')]]){
  const x=await setup({bodies:{certificate:JSON.stringify({data:rows})}});await assert.rejects(x.collector.collect(x.options));assert.equal(x.lease,undefined);
 }
});
test('request transcript, protocol and malformed HTTP fail before attestor submission',async()=>{
 for(const options of [{status:'302 Found'},{headers:'Content-Encoding: gzip\r\n'},{headers:'Content-Length: 1\r\n'},{headers:'Transfer-Encoding: chunked\r\n'}]){
  const x=await setup({wireOptions:options});await assert.rejects(x.collector.collect(x.options),/WORKER_HTTP/);assert.deepEqual(x.calls,['account']);
 }
 const x=await setup({hook:async(i,w)=>{w.transcript[0].message.plaintext[0]=33;await i.updateProviderParams(w.transcript,w.tlsVersion);}});
 await assert.rejects(x.collector.collect(x.options),/WORKER_REQUEST_MISMATCH/);
 const y=await setup();y.options.client.metadata.clientVersion='unknown';await assert.rejects(y.collector.collect(y.options),/WORKER_PROTOCOL/);
});
test('pure inspection cannot forge process-local source authority',async()=>{
 const x=await setup(),params=parametersFor(x.config.recipe,'account'),input={params,secretParams:{cookieStr:COOKIE},context:{clearSourceRole:'account'}};
 const w=transcriptFor(input,account());
 const observed=await inspectWorkerTranscript({...w,role:'account',params,secretParams:input.secretParams,selectedCertificateId:null,clientVersion:sdk.PROVIDER_CTX.version});
 assert.deepEqual(observed,{username:USERNAME});
 for(const fake of [observed,{fields:observed},null])assert.throws(()=>readWorkerSource(fake,{config:x.config,request:x.request,role:'account',proof:{}}),/WORKER_SOURCE_REQUIRED/);
 x.collector.close();
});
test('worker provenance is bound to request, role, config, exact proof and disposal',async()=>{
 const x=await setup(),params=parametersFor(x.config.recipe,'account');
 const issued=await collectWorkerSource({config:x.config,request:x.request,role:'account',params,client:x.options.client,routeClient:x.options.client,secretParams:{cookieStr:COOKIE},ownerPrivateKey:actors.owner.privateKey,clock:()=>NOW,
  async createClaim(i){const w=transcriptFor(i,account());await i.updateProviderParams(w.transcript,w.tlsVersion);const signed=await proofFor(i,w,c=>{c.owner=x.request.expectedClaimOwner;});return signed.result;}});
 const args={config:x.config,request:x.request,role:'account',proof:issued.proof};assert.equal(readWorkerSource(issued.source,args).username,USERNAME);
 for(const patch of [{role:'certificate'},{request:{...x.request,nonce:'0x'+'f1'.repeat(32)}},{config:{...x.config,approvalRef:'other'}},{proof:{...issued.proof,attestor:actors.other.address.toLowerCase()}}])assert.throws(()=>readWorkerSource(issued.source,{...args,...patch}),/WORKER_SOURCE_BINDING/);
 assert.throws(()=>readWorkerSource({...issued.source},args),/WORKER_SOURCE_REQUIRED/);issued.source.dispose();assert.throws(()=>readWorkerSource(issued.source,args),/WORKER_SOURCE_REQUIRED/);x.collector.close();
});
test('large private account metadata is inspected without being disclosed; original signed limits stay small',async()=>{
 const x=await setup({bodies:{account:account().replace('"unused":0.5','"unused":0.5,"large":"'+'x'.repeat(70000)+'"')}});
 const candidate=await x.collector.collect(x.options);assert.equal(candidate.condition,'MET');assert.ok(JSON.stringify(x.proofs.account).length<5000);x.lease.dispose();
});
test('SDK-visible framing cannot disclose arbitrary metadata or accept ambiguous lengths',async()=>{
 for(const transform of [
  b=>Buffer.from(b.toString().replace('200 OK','200 '+PRIVATE)),
  b=>Buffer.from(b.toString().replace('charset=utf-8','charset=utf-8; private='+PRIVATE)),
  b=>Buffer.from(b.toString().replace('\r\nContent-Type:', '\r\nDate: '+PRIVATE+'\r\nContent-Type:')),
  b=>b.subarray(0,b.length-1),
  b=>Buffer.concat([b,Buffer.from('trailing')]),
 ]){
  const x=await setup({hook:async(i,w)=>{const raw=transform(w.raw),transcript=[w.transcript[0],packet('server',raw,w.tlsVersion)];await i.updateProviderParams(transcript,w.tlsVersion);}});
  await assert.rejects(x.collector.collect(x.options),/WORKER_HTTP/);assert.equal(x.lease,undefined);
 }
 const x=await setup({wireOptions:{chunked:true},hook:async(i,w)=>{
  const at=w.raw.indexOf('\r\n\r\n')+4,end=w.raw.indexOf('\r\n',at),raw=Buffer.concat([w.raw.subarray(0,end),Buffer.from(';private='+PRIVATE),w.raw.subarray(end)]);
  await i.updateProviderParams([w.transcript[0],packet('server',raw,w.tlsVersion)],w.tlsVersion);
 }});await assert.rejects(x.collector.collect(x.options),/WORKER_HTTP_FRAMING/);
});
test('private cache mismatch, escaped duplicate data and cross-row decoys fail before disclosure',async()=>{
 const badCache=account().replace('"data":{"profile":{"username":"'+USERNAME+'"','"data":{"profile":{"username":"synthetic-other"');
 const duplicate=JSON.stringify({data:[row()]}).replace('{"data":','{"da\\u0074a":[],"data":');
 const decoy=row();decoy.attributes={decoy:{status:'test_failed'},...decoy.attributes};
 for(const bodies of [{account:badCache},{certificate:duplicate},{certificate:JSON.stringify({data:[decoy]})}]){
  const x=await setup({bodies});await assert.rejects(x.collector.collect(x.options),/WORKER_ACCOUNT_COPIES|SOURCE_JSON_KEY|WORKER_EXTRACTION_MISMATCH/);assert.equal(x.lease,undefined);
 }
});
test('untrusted signature after valid worker inspection cannot authorize certificate collection',async()=>{
 const x=await setup(),original=x.options.createClaim;
 x.options.createClaim=async input=>{const r=await original(input);r.signatures.claimSignature=Buffer.alloc(65);return r;};
 await assert.rejects(x.collector.collect(x.options),/CLAIM_SIGNATURE/);assert.deepEqual(x.calls,['account']);
});
test('expiry or cancellation during the hook cannot leave a usable lease',async()=>{
 let at=NOW;const x=await setup({clock:()=>at,hook:async(i,w)=>{await i.updateProviderParams(w.transcript,w.tlsVersion);at=NOW+900;}});
 await assert.rejects(x.collector.collect(x.options),/REQUEST_EXPIRED/);assert.equal(x.lease,undefined);
 const cancelled=new AbortController(),y=await setup({hook:async(i,w)=>{await i.updateProviderParams(w.transcript,w.tlsVersion);cancelled.abort();}});y.options.signal=cancelled.signal;
 await assert.rejects(y.collector.collect(y.options),/COLLECTOR_CANCELLED/);assert.equal(y.lease,undefined);
});
test('live mode rejects a substituted claim driver before cookie or network access',async()=>{
 const f=await fixture(),now=Math.floor(Date.now()/1000),config={...f.config,dataMode:'RECLAIM_SIGNED_RECORD',sourceReview:'TRUSTED_WORKER_TRANSCRIPT_REVIEWED',contextReview:'SIGNED_REQUEST_CONTEXT_REQUIRED',recipe:workerRecipe(),notBefore:now-30,expiresAt:now+1800};
 const collector=createHackerRankCollector({trustConfig:config,commitmentKey:f.key}),request={...f.request,expectedClaimOwner:collector.claimOwner,issuedAt:now,expiresAt:now+800,recipeHash:hash('RECIPE',config.recipe),trustConfigHash:hash('TRUST',config)};
 const envelope={request,signature:await actors.participant.signMessage(requestMessage(request))},client={isOpen:true,isInitialised:true,metadata:{clientVersion:sdk.PROVIDER_CTX.version}};
 await assert.rejects(collector.collect({envelope,expectedRequest:request,client,routeClient:client,readCookies(){assert.fail('cookies');},submit(){assert.fail('submit');},createClaim(){assert.fail('driver');}}),/COLLECTOR_TEST_DRIVER/);
});
