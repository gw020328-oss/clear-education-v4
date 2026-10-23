import {createSourceDiagnostics} from '../../src/hackerrank-evidence/diagnostics.mjs';
import {installClaimRpcObserver} from '../../src/ybm-collector/claim-rpc-observer.mjs';
import {installBoundedSender,PROOF_SEND_LIMIT} from '../../src/ybm-collector/socket.mjs';
// Entirely invented responses and ephemeral signatures; network is forbidden.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import {createRequire} from 'node:module';
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
const transportSdk=await import(createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url)).resolve('@reclaimprotocol/attestor-core'));
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
async function setup({bodies={},selection=null,wireOptions={},hook,afterHook,transformResult,changeClaim,diagnostics,claimFailure,rpc,corruptCertificate=false,clock=()=>NOW}={}){
 const f=await fixture(),config={...f.config,recipe:workerRecipe()};
 const collector=createHackerRankCollector({trustConfig:config,commitmentKey:f.key,clock,diagnostics});
 const request={...f.request,selectedCertificateId:selection,expectedClaimOwner:collector.claimOwner,recipeHash:hash('RECIPE',config.recipe),trustConfigHash:hash('TRUST',config)};
 const envelope={request,signature:await actors.participant.signMessage(requestMessage(request))},proofs={},calls=[],inputs=[];
 const client={isOpen:true,isInitialised:true,metadata:{clientVersion:sdk.PROVIDER_CTX.version},async terminateConnection(){this.isOpen=false;}};
 if(rpc){client.rpc=rpc;installClaimRpcObserver(client);}
 let lease;
 const options={envelope,expectedRequest:request,client,routeClient:client,async readCookies({role}){calls.push(role);return COOKIE;},
  async createClaim(input){
   if(claimFailure)throw claimFailure;
   inputs.push(input);const role=input.context.clearSourceRole;
   const wire=transcriptFor(input,bodies[role]??(role==='account'?account():JSON.stringify({data:[row()]})),wireOptions);
   const before=wire.transcript.map(b=>Buffer.from(b.message.plaintext));
   if(hook)await hook(input,wire);else assert.deepEqual(await input.updateProviderParams(wire.transcript,wire.tlsVersion),{params:{},secretParams:{}});
   for(let i=0;i<before.length;i++)assert.deepEqual(wire.transcript[i].message.plaintext,before[i]);
   if(afterHook)await afterHook(input);
   const signed=await proofFor(input,wire,changeClaim);proofs[role]=signed.proof;if(corruptCertificate&&role==='certificate')signed.result.signatures.claimSignature=Buffer.alloc(65);return transformResult?transformResult(signed.result):signed.result;
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
test('owned bounded-send failures cross the claim RPC and SDK boundary without inspecting messages',async()=>{
 for(const code of ['ATTESTOR_MESSAGE_LIMIT','ATTESTOR_SEND_FAILED']){
  const d=createSourceDiagnostics({persist(){}}),socket=installBoundedSender({readyState:1,bufferedAmount:0,terminate(){},send(_b,cb){cb(Error(PRIVATE));}},{proofMode:true});
  const x=await setup({diagnostics:d,rpc:()=>socket.sendPromise(Buffer.alloc(code==='ATTESTOR_MESSAGE_LIMIT'?PROOF_SEND_LIMIT+1:1)),afterHook:async i=>{i.onStep({name:'waiting-for-verification'});await i.client.rpc('claimTunnel',{});}});
  await assert.rejects(x.collector.collect(x.options),/WORKER_COLLECTION_FAILED/);
  const v=d.snapshot();assert.equal(v.firstFailure.stage,'ACCOUNT_SDK_RPC_SEND');assert.equal(v.firstFailure.code,code);
  assert.equal(v.firstFailure.codeNamespace,'CLEAR_TRANSPORT');assert.equal(v.firstFailure.codeBasis,'OWNED_BOUNDED_SEND');
  assert.equal(v.firstFailure.errorKind,'OWNED_BOUNDED_SEND');assert.equal(v.firstFailure.ownCodeKind,'ABSENT');
  assert.equal(v.stages.ACCOUNT_SDK_CLAIM_RPC_OBSERVER.state,'OBSERVED');assert.equal(v.stages.ACCOUNT_SDK_RETURN.state,'NOT_OBSERVED');
  assert.equal(v.events.find(e=>e.stage==='ACCOUNT_SDK_CALL'&&e.state==='FAILED').code,code);
  assert.equal(JSON.stringify(v).includes(PRIVATE),false);assert.deepEqual(x.calls,['account']);assert.equal(x.lease,undefined);
 }
});
test('unknown rejections retain fixed native and own-code shapes while message and cause stay private',async()=>{
 let getters=0;
 const accessor=Error(PRIVATE);Object.defineProperty(accessor,'code',{get(){getters++;throw Error(PRIVATE);}});
 for(const [error,kind,codeKind] of [[Error('ATTESTOR_SEND_FAILED'),'NATIVE_ERROR','ABSENT'],[new TypeError(PRIVATE),'NATIVE_TYPE_ERROR','ABSENT'],[new RangeError(PRIVATE),'NATIVE_RANGE_ERROR','ABSENT'],[accessor,'NATIVE_ERROR','ACCESSOR'],[{name:'AttestorError',code:'ERROR_TIMEOUT',cause:PRIVATE},'NON_ERROR','STRING'],[new sdk.AttestorError('UNKNOWN_FUTURE_CODE',PRIVATE),'HR_ATTESTOR_ERROR','STRING']]){
  const d=createSourceDiagnostics({persist(){}}),x=await setup({diagnostics:d,rpc:async()=>{},afterHook(i){i.onStep({name:'waiting-for-verification'});throw error;}});
  await assert.rejects(x.collector.collect(x.options),/WORKER_COLLECTION_FAILED/);
  const v=d.snapshot();assert.equal(v.firstFailure.stage,'ACCOUNT_SDK_CALL');assert.equal(v.firstFailure.code,'UNKNOWN_ERROR');
  assert.equal(v.firstFailure.errorKind,kind);assert.equal(v.firstFailure.ownCodeKind,codeKind);
  assert.equal(v.stages.ACCOUNT_SDK_CLAIM_RPC_OBSERVER.state,'OBSERVED');assert.equal(v.stages.ACCOUNT_SDK_CLAIM_RPC.state,'NOT_OBSERVED');
  assert.equal(JSON.stringify(v).includes(PRIVATE),false);assert.equal(JSON.stringify(v).includes('UNKNOWN_FUTURE_CODE'),false);
 }assert.equal(getters,0);
});

test('SDK rejection after a valid hook retains both pinned AttestorError types and relative duration',async()=>{
 assert.notEqual(sdk.AttestorError,transportSdk.AttestorError);
 for(const SdkError of [sdk.AttestorError,transportSdk.AttestorError])for(const code of Object.keys(sdk.proto.ErrorCode).filter(k=>k.startsWith('ERROR_')&&k!=='ERROR_NO_ERROR')){
  let mono=1000;
  const diagnostics=createSourceDiagnostics({persist(){},monotonicNow:()=>mono});
  const x=await setup({diagnostics,afterHook(input){assert.equal(input.maxRetries,1);mono+=250;throw new SdkError(code,PRIVATE,{secret:COOKIE});}});
  await assert.rejects(x.collector.collect(x.options),/WORKER_COLLECTION_FAILED/);
  const d=diagnostics.snapshot();assert.equal(d.stages.ACCOUNT_RESPONSE_INSPECTION.state,'COMPLETED');
  assert.equal(d.firstFailure.stage,'ACCOUNT_SDK_CALL');assert.equal(d.firstFailure.code,code);
  assert.equal(d.firstFailure.codeNamespace,'ATTESTOR_SDK');assert.equal(d.firstFailure.codeBasis,'ATTESTOR_ERROR_OWN_CODE');
  assert.equal(d.firstFailure.offsetMs,250);assert.equal(d.firstFailure.durationMs,250);assert.equal(d.firstFailure.aborted,false);
  assert.equal(d.stages.ACCOUNT_SDK_RETURN.state,'NOT_OBSERVED');assert.equal(d.stages.ACCOUNT_OFFICIAL_VERIFY.state,'NOT_OBSERVED');
  assert.deepEqual(x.calls,['account']);assert.equal(x.inputs.length,1);assert.equal(x.lease,undefined);
  for(const value of [PRIVATE,COOKIE,USERNAME])assert.equal(JSON.stringify(d).includes(value),false);
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

test('SDK boundary keeps untyped failures unknown even when a system code is present',async()=>{
 for(const error of [Object.assign(Error(PRIVATE),{code:'ECONNRESET'}),Error(PRIVATE)]){
  const diagnostics=createSourceDiagnostics({persist(){}}),x=await setup({diagnostics,claimFailure:error});
  await assert.rejects(x.collector.collect(x.options),/WORKER_COLLECTION_FAILED/);
  const d=diagnostics.snapshot();assert.equal(d.firstFailure.stage,'ACCOUNT_SDK_CALL');
  assert.equal(d.firstFailure.code,'UNKNOWN_ERROR');
  assert.equal(d.stages.ACCOUNT_RESPONSE_INSPECTION.state,'NOT_OBSERVED');assert.equal(d.stages.PAIR_OFFICIAL_VERIFY.state,'NOT_OBSERVED');
  assert.equal(x.lease,undefined);for(const privateValue of [PRIVATE,COOKIE,USERNAME])assert.equal(JSON.stringify(d).includes(privateValue),false);
 }
});
test('response hook failure remains the first failure after the outer layers normalize it',async()=>{
 const diagnostics=createSourceDiagnostics({persist(){}}),x=await setup({diagnostics,hook:async input=>input.updateProviderParams([],'TLS1_3')});
 await assert.rejects(x.collector.collect(x.options),/WORKER_TRANSCRIPT/);
 const d=diagnostics.snapshot();assert.equal(d.firstFailure.stage,'ACCOUNT_RESPONSE_INSPECTION');assert.equal(d.firstFailure.code,'WORKER_TRANSCRIPT');
 assert.equal(d.stages.ACCOUNT_PROOF_RETURN.completedObserved,false);assert.equal(d.stages.ACCOUNT_OFFICIAL_VERIFY.state,'NOT_OBSERVED');
});
test('proof-return success is separate from official account signature verification',async()=>{
 const diagnostics=createSourceDiagnostics({persist(){}}),x=await setup({diagnostics,changeClaim:c=>{c.epoch=2;}});
 await assert.rejects(x.collector.collect(x.options),/UNTRUSTED_SIGNER/);
 const d=diagnostics.snapshot();assert.equal(d.stages.ACCOUNT_RESPONSE_INSPECTION.state,'COMPLETED');assert.equal(d.stages.ACCOUNT_PROOF_RETURN.state,'COMPLETED');
 assert.equal(d.firstFailure.stage,'ACCOUNT_OFFICIAL_VERIFY');assert.equal(d.firstFailure.code,'UNTRUSTED_SIGNER');
 assert.equal(d.stages.CERTIFICATE_CLAIM_CALL.state,'NOT_OBSERVED');
});
test('official pair rejection code survives COLLECTOR_PAIR_REJECTED',async()=>{
 const diagnostics=createSourceDiagnostics({persist(){}}),x=await setup({diagnostics,corruptCertificate:true});
 await assert.rejects(x.collector.collect(x.options),/COLLECTOR_PAIR_REJECTED/);
 const d=diagnostics.snapshot();assert.equal(d.firstFailure.stage,'PAIR_OFFICIAL_VERIFY');assert.equal(d.firstFailure.code,'CLAIM_SIGNATURE');
 assert.equal(d.stages.CERTIFICATE_PROOF_RETURN.state,'COMPLETED');assert.equal(d.stages.CANDIDATE_LEASE.state,'NOT_OBSERVED');assert.equal(x.lease,undefined);
});
test('successful synthetic pair has observed boundaries but no invented HTTP signature acceptance',async()=>{
 const diagnostics=createSourceDiagnostics({persist(){}}),x=await setup({diagnostics});await x.collector.collect(x.options);
 const d=diagnostics.snapshot();for(const stage of ['PARTICIPANT_ENVELOPE_VERIFY','ACCOUNT_RESPONSE_INSPECTION','ACCOUNT_PROOF_RETURN','ACCOUNT_OFFICIAL_VERIFY','CERTIFICATE_RESPONSE_INSPECTION','CERTIFICATE_PROOF_RETURN','PAIR_OFFICIAL_VERIFY','CANDIDATE_LEASE'])assert.equal(d.stages[stage].state,'COMPLETED');
 assert.equal(d.signatureAcceptance,'UNKNOWN');assert.equal(d.firstFailure,null);x.lease.dispose();
});

test('SDK diagnostics reject spoofed and unknown codes without reading error payloads or getters',async()=>{
 let reads=0;
 const getterError=new sdk.AttestorError('ERROR_TIMEOUT',PRIVATE);
 Object.defineProperty(getterError,'code',{get(){reads++;throw Error(PRIVATE);}});
 const inheritedError=new transportSdk.AttestorError('ERROR_TIMEOUT',PRIVATE);delete inheritedError.code;
 const errors=[Error('ERROR_TIMEOUT'),new TypeError(PRIVATE),Object.assign(Error('CLAIM_SIGNATURE'),{code:'ERROR_NETWORK_ERROR',name:'AttestorError'}),
  new sdk.AttestorError('ERROR_FUTURE',PRIVATE),new sdk.AttestorError('ERROR_NO_ERROR',PRIVATE),new sdk.AttestorError(10,PRIVATE),getterError,inheritedError];
 for(const error of errors){
  Object.defineProperty(error,'data',{get(){reads++;throw Error(PRIVATE);}});
  const diagnostics=createSourceDiagnostics({persist(){}}),x=await setup({diagnostics,afterHook(){throw error;}});
  await assert.rejects(x.collector.collect(x.options),/WORKER_COLLECTION_FAILED/);
  const d=diagnostics.snapshot();assert.equal(d.firstFailure.stage,'ACCOUNT_SDK_CALL');assert.equal(d.firstFailure.code,'UNKNOWN_ERROR');
  assert.equal(d.firstFailure.codeNamespace,'UNKNOWN');assert.equal(d.stages.ACCOUNT_RESPONSE_INSPECTION.state,'COMPLETED');
  assert.equal(d.stages.ACCOUNT_RETURN_VALIDATION.state,'NOT_OBSERVED');assert.equal(x.inputs.length,1);assert.equal(x.lease,undefined);
  assert.equal(JSON.stringify(d).includes(PRIVATE),false);
 }
 assert.equal(reads,0);
});

test('resolved protobuf errors have their own namespace and do not imply a rejected SDK await',async()=>{
 let reads=0;
 for(const code of [...Array.from({length:12},(_,i)=>i+1),0,-1,13,'10',null]){
  const diagnostics=createSourceDiagnostics({persist(){}}),error={code,get message(){reads++;throw Error(PRIVATE);},get data(){reads++;throw Error(COOKIE);}};
  const x=await setup({diagnostics,transformResult:()=>({error})});
  await assert.rejects(x.collector.collect(x.options),/COLLECTOR_SIGNED_CLAIM/);
  const d=diagnostics.snapshot(),returned=d.events.find(e=>e.stage==='ACCOUNT_SDK_RETURN');
  assert.equal(d.stages.ACCOUNT_SDK_CALL.state,'COMPLETED');assert.equal(returned.state,'OBSERVED');assert.equal(returned.resultKind,'ERROR');
  const known=Number.isInteger(code)&&code>=1&&code<=12;
  assert.equal(returned.code,known?Object.entries(sdk.proto.ErrorCode).find(([,value])=>value===code)[0]:'UNKNOWN_ERROR');
  assert.equal(returned.codeNamespace,known?'ATTESTOR_SDK':'UNKNOWN');assert.equal(returned.codeBasis,known?'PROTO_ERROR_CODE':'UNKNOWN');
  assert.equal(d.firstFailure.stage,'ACCOUNT_RETURN_VALIDATION');assert.equal(d.firstFailure.code,'COLLECTOR_SIGNED_CLAIM');
  assert.equal(d.stages.ACCOUNT_OFFICIAL_VERIFY.state,'NOT_OBSERVED');assert.deepEqual(x.calls,['account']);assert.equal(x.lease,undefined);
  for(const secret of [PRIVATE,COOKIE])assert.equal(JSON.stringify(d).includes(secret),false);
 }
 assert.equal(reads,0);
});

test('malformed, missing-signature, and post-return failures remain distinct from SDK rejection',async()=>{
 const cases=[
  [()=>null,'MALFORMED','COLLECTOR_SIGNED_CLAIM'],
  [()=>({}),'MALFORMED','COLLECTOR_SIGNED_CLAIM'],
  [r=>({claim:r.claim}),'MISSING_SIGNATURE','COLLECTOR_SIGNED_CLAIM'],
  [r=>({...r,signatures:{...r.signatures,claimSignature:Buffer.alloc(64)}}),'MALFORMED','COLLECTOR_SIGNED_CLAIM'],
  [r=>({...r,claim:{...r.claim,parameters:'{bad'}}),'SIGNED_CLAIM','SIGNED_JSON'],
  [r=>({...r,claim:{...r.claim,owner:actors.other.address.toLowerCase()}}),'SIGNED_CLAIM','WORKER_SIGNED_CLAIM'],
  [r=>({...r,get claim(){throw new TypeError(PRIVATE);}}),'MALFORMED','UNKNOWN_ERROR'],
 ];
 for(const [transformResult,resultKind,code]of cases){
  const diagnostics=createSourceDiagnostics({persist(){}}),x=await setup({diagnostics,transformResult});
  await assert.rejects(x.collector.collect(x.options));const d=diagnostics.snapshot();
  assert.equal(d.stages.ACCOUNT_SDK_CALL.state,'COMPLETED');assert.equal(d.events.find(e=>e.stage==='ACCOUNT_SDK_RETURN').resultKind,resultKind);
  assert.equal(d.firstFailure.stage,'ACCOUNT_RETURN_VALIDATION');assert.equal(d.firstFailure.code,code);
  assert.equal(d.stages.ACCOUNT_OFFICIAL_VERIFY.state,'NOT_OBSERVED');assert.deepEqual(x.calls,['account']);assert.equal(x.lease,undefined);
  assert.equal(JSON.stringify(d).includes(PRIVATE),false);
 }
});

test('supported SDK steps are first observations only, with ordered relative offsets and no inferred completion',async()=>{
 let mono=500,reads=0;
 const diagnostics=createSourceDiagnostics({persist(){},monotonicNow:()=>mono});
 const x=await setup({diagnostics,hook:async(input,wire)=>{
  assert.equal(input.maxRetries,1);assert.equal(input.zkEngine,'stwo');assert.equal(input.zkProofConcurrency,1);
  for(const name of ['connecting','sending-request-data','waiting-for-response']){mono+=10;input.onStep({name,get private(){reads++;return PRIVATE;}});}
  await input.updateProviderParams(wire.transcript,wire.tlsVersion);
  mono+=20;for(let i=0;i<200;i++)input.onStep({name:'generating-zk-proofs',proofsDone:0,proofsTotal:0,approxTimeLeftS:Infinity,private:COOKIE});
  input.onStep({name:'unknown',private:PRIVATE});input.onStep({get name(){reads++;throw Error(PRIVATE);}});
  input.onStep({name:{toString(){reads++;throw Error(PRIVATE);}}});
  mono+=40;input.onStep({name:'waiting-for-verification'});
 }});
 await x.collector.collect(x.options);const d=diagnostics.snapshot();
 const observed=d.events.filter(e=>e.stage.startsWith('ACCOUNT_SDK_')&&e.state==='OBSERVED');
 assert.deepEqual(observed.map(e=>e.stage),['ACCOUNT_SDK_CONNECTING','ACCOUNT_SDK_SENDING_REQUEST','ACCOUNT_SDK_WAITING_RESPONSE','ACCOUNT_SDK_ZK_PROGRESS_OBSERVED','ACCOUNT_SDK_VERIFICATION_PHASE_OBSERVED','ACCOUNT_SDK_RETURN']);
 assert.deepEqual(observed.map(e=>e.offsetMs),[10,20,30,50,90,90]);assert.equal(d.events.find(e=>e.stage==='ACCOUNT_SDK_CALL'&&e.state==='COMPLETED').durationMs,90);
 assert.equal(d.stages.ACCOUNT_SDK_ZK_PROGRESS_OBSERVED.completedObserved,false);assert.equal(d.truncated,false);assert.equal(reads,0);
 const before=JSON.stringify(d);x.inputs[0].onStep({name:'connecting'});await assert.rejects(x.inputs[0].updateProviderParams([],'TLS1_3'),/WORKER_HOOK_REUSED/);
 assert.equal(JSON.stringify(diagnostics.snapshot()),before);assert.equal(before.includes('approxTimeLeftS'),false);
 for(const secret of [PRIVATE,COOKIE,USERNAME])assert.equal(before.includes(secret),false);x.lease.dispose();
});

test('abort observation is explicit during await, separate from SDK timeout, and removed at terminal exit',async()=>{
 for(const reject of [true,false]){
  const controller=new AbortController(),diagnostics=createSourceDiagnostics({persist(){}});
  const x=await setup({diagnostics,afterHook(input){controller.abort(PRIVATE);input.onStep({name:'generating-zk-proofs'});if(reject)throw new transportSdk.AttestorError('ERROR_TIMEOUT',PRIVATE);}});
  x.options.signal=controller.signal;await assert.rejects(x.collector.collect(x.options),/COLLECTOR_CANCELLED/);
  const d=diagnostics.snapshot(),abort=d.events.find(e=>e.stage==='ACCOUNT_SDK_ABORT_OBSERVED');assert.equal(abort.aborted,true);
  const terminal=d.events.find(e=>e.stage==='ACCOUNT_SDK_CALL'&&e.state!=='STARTED');assert.equal(terminal.aborted,true);
  assert.equal(terminal.code,reject?'ERROR_TIMEOUT':null);assert.equal(d.firstFailure.stage,reject?'ACCOUNT_SDK_CALL':'ACCOUNT_RETURN_VALIDATION');
  assert.equal(d.stages.ACCOUNT_OFFICIAL_VERIFY.state,'NOT_OBSERVED');assert.equal(x.lease,undefined);assert.equal(JSON.stringify(d).includes(PRIVATE),false);
  const before=JSON.stringify(d);x.inputs[0].onStep({name:'waiting-for-verification'});assert.equal(JSON.stringify(diagnostics.snapshot()),before);
 }
 const controller=new AbortController(),diagnostics=createSourceDiagnostics({persist(){}}),x=await setup({diagnostics});x.options.signal=controller.signal;
 await x.collector.collect(x.options);const before=JSON.stringify(diagnostics.snapshot());controller.abort(PRIVATE);assert.equal(JSON.stringify(diagnostics.snapshot()),before);x.lease.dispose();
 const stopped=new AbortController();stopped.abort();const early=createSourceDiagnostics({persist(){}}),y=await setup({diagnostics:early});y.options.signal=stopped.signal;
 await assert.rejects(y.collector.collect(y.options),/COLLECTOR_CANCELLED/);assert.equal(y.inputs.length,0);assert.equal(early.snapshot().stages.ACCOUNT_SDK_CALL.state,'NOT_OBSERVED');
});

test('failed persistence and unavailable timing preserve collection success and original failure',async()=>{
 for(const fail of [true,false]){
  const diagnostics=createSourceDiagnostics({persist(){throw Error(PRIVATE);},monotonicNow(){throw Error(COOKIE);}});
  const x=await setup({diagnostics,afterHook:fail?()=>{throw new sdk.AttestorError('ERROR_TIMEOUT',PRIVATE);}:undefined});
  if(fail)await assert.rejects(x.collector.collect(x.options),/WORKER_COLLECTION_FAILED/);else{await x.collector.collect(x.options);x.lease.dispose();}
  const d=diagnostics.snapshot();assert.equal(d.persistence,'INCOMPLETE');assert.equal(d.timing,'INCOMPLETE');assert.equal(d.firstFailure?.code,fail?'ERROR_TIMEOUT':undefined);
  assert.ok(d.events.every(e=>e.offsetMs===null&&e.durationMs===null));for(const secret of [PRIVATE,COOKIE])assert.equal(JSON.stringify(d).includes(secret),false);
 }
});

test('certificate SDK rejection follows account verification and blocks pair/lease after one call per role',async()=>{
 const diagnostics=createSourceDiagnostics({persist(){}}),x=await setup({diagnostics,afterHook(input){if(input.context.clearSourceRole==='certificate')throw new transportSdk.AttestorError('ERROR_NETWORK_ERROR',PRIVATE);}});
 await assert.rejects(x.collector.collect(x.options),/WORKER_COLLECTION_FAILED/);
 const d=diagnostics.snapshot();assert.equal(d.stages.ACCOUNT_OFFICIAL_VERIFY.state,'COMPLETED');assert.equal(d.stages.CERTIFICATE_RESPONSE_INSPECTION.state,'COMPLETED');
 assert.equal(d.firstFailure.stage,'CERTIFICATE_SDK_CALL');assert.equal(d.firstFailure.code,'ERROR_NETWORK_ERROR');
 assert.equal(d.stages.PAIR_OFFICIAL_VERIFY.state,'NOT_OBSERVED');assert.equal(d.stages.CANDIDATE_LEASE.state,'NOT_OBSERVED');
 assert.deepEqual(x.calls,['account','certificate']);assert.equal(x.inputs.length,2);assert.equal(x.lease,undefined);
});
