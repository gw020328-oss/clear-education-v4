// Offline host tests. All flow ports and addresses below are synthetic; no registry/source/model/realm is opened.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {request} from 'node:https';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createPreparedNormalServer} from '../../tools/bootcamp/normal-host-prepared-server.mjs';
import {composeNormalFlow,waitUntil,safeCode} from '../../tools/bootcamp/normal-host-flow.mjs';
import {validateHostConfig,HOST_CONFIG_VERSION,API_ROOT,KEY_SOURCE,MOODLE_READER,MOODLE_OWNER_HEAD,assetSnapshot} from '../../tools/bootcamp/normal-host-config.mjs';
import {normalHostCli} from '../../tools/bootcamp/normal-host.mjs';
const config=()=>({version:HOST_CONFIG_VERSION,apiRoot:API_ROOT,keySourceId:KEY_SOURCE,moodleReader:MOODLE_READER,moodleOwnerHead:MOODLE_OWNER_HEAD,
 moodleReaderSha256:'a'.repeat(64),privacyKeyId:'hr-run.00000000-0000-0000-0000-000000000000',audience:'clear-python-normal-local',origin:'https://127.0.0.1:9445',
 participantWallet:null,operatorWallet:null,webRoot:null,frontendAccepted:false,frontendAssetSha256:null,selectedCertificateId:null});
test('configuration permits a pending pair but never a partial, same, zero or external identity/origin',()=>{
 assert.equal(validateHostConfig(config()).participantWallet,null);
 const good={...config(),participantWallet:'0x'+'11'.repeat(20),operatorWallet:'0x'+'22'.repeat(20)};assert.equal(validateHostConfig(good),good);
 for(const patch of [{operatorWallet:good.operatorWallet},{...good,operatorWallet:good.participantWallet},{...good,participantWallet:'0x'+'00'.repeat(20)},
  {origin:'http://127.0.0.1:9445'},{origin:'https://example.invalid:9445'},{keySourceId:'fallback'},{moodleOwnerHead:'b'.repeat(40)}])assert.throws(()=>validateHostConfig({...config(),...patch}));
});
test('run requires explicit activation before any host lookup or native worker',async()=>{
 await assert.rejects(normalHostCli(['run','--name','offline-fixture']),/NORMAL_HOST_EXPLICIT_ACTIVATION_REQUIRED/);
 await assert.rejects(normalHostCli(['prepare','--activate','--name','offline-fixture']),/NORMAL_HOST_ARGUMENT/);
});
test('prepared HTTPS exposes bootstrap/module but no auth, app, chain, signature, receipt or raw private files',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'normal-host-offline-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const fingerprint=createCertificates(directory),mounted=createPreparedNormalServer({config:config(),tls:loadTls(directory,fingerprint)});
 mounted.server.listen(0,'127.0.0.1');await once(mounted.server,'listening');
 t.after(async()=>{mounted.server.closeAllConnections();await new Promise(r=>mounted.server.close(r));});
 const raw=(path,headers={})=>new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:mounted.server.address().port,path,
  ca:readFileSync(join(directory,'ca.pem')),headers:{host:'127.0.0.1:9445',...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString(),headers:res.headers}));});req.on('error',reject);req.end();});
 const r=await raw('/__dev/config'),c=JSON.parse(r.body);assert.equal(r.status,200);assert.equal(c.phase,'PREPARED_NOT_ACTIVATED');
 for(const k of ['chainId','network','applicationId','actualSourceVerification'])assert.equal(c[k],null);
 for(const k of ['sourceCollectionConfigured','reviewConsentHttpImplemented','executionReceiptHttpImplemented','sourceSignatureHttpImplemented','signerInstalled'])assert.equal(c[k],false);
 assert.equal((await raw('/bootcamp-normal-client.mjs')).body,readFileSync(new URL('../../src/bootcamp/normal-client.mjs',import.meta.url),'utf8'));
 for(const path of ['/auth/session','/bootcamp/v4/session','/bootcamp/v1/applications'])assert.equal((await raw(path)).status,503);
 assert.equal((await raw('/server.key')).status,404);assert.equal((await raw('/__dev/config',{origin:'https://other.invalid'})).status,403);
 assert.equal((await raw('/__dev/config',{'sec-fetch-site':'cross-site'})).status,403);assert.equal(r.headers['cache-control'],'no-store');
});
test('frontend acceptance digest changes with public bytes',t=>{
 const d=realpathSync(mkdtempSync(join(tmpdir(),'normal-assets-offline-')));t.after(()=>rmSync(d,{recursive:true,force:true}));
 writeFileSync(join(d,'index.html'),'<p>one</p>');const first=assetSnapshot(d);writeFileSync(join(d,'index.html'),'<p>two</p>');assert.notEqual(assetSnapshot(d),first);
 assert.equal(assetSnapshot(null),null);
});
function flowFixture({approvalFailure=false,abortAt=null}={}){
 const events=[],controller=new AbortController();let bound=false,closed=0,resumed=0,paid=0;
 const prepared={packet:{planHash:'offline'},isCurrent:()=>true};
 const context={report:()=>({applicationId:bound?'offline-app':null,startedAt:Date.now()/1000}),close(){closed++;events.push('close');},
  createFrontend(){events.push('frontend');return {server:{},config:{chainId:123,network:{chainId:'0x7b'}},async drain(){events.push('drain');}};},
  async collectSources(options){events.push(options?.prepareReflection?'prepare-reflection':'resume-exact');if(options?.prepareReflection)return prepared;resumed++;},
  async pay(){events.push('pay');paid++;return {completed:true,applicationId:'offline-app'};}};
 const ports={tls:{},async prepare(){events.push('prepare-realm');return {directory:'/offline'};},async open(){events.push('open-context');return context;},
  async listen(){events.push('listen');bound=true;},notify(x){events.push(x.event);if(x.event===abortAt)controller.abort();},
  async awaitApproval(args){events.push('approval');assert.equal(args.prepared,prepared);args.onPrepared();if(approvalFailure)throw Error('OFFLINE_APPROVAL_REJECTED');},
  async finish(){events.push('finish');}};
 return {events,controller,ports,get closed(){return closed;},get resumed(){return resumed;},get paid(){return paid;}};
}
test('normal flow orders exact approval before resume/pay and retains receipt until finish before disposal',async()=>{
 const f=flowFixture(),result=await composeNormalFlow({source:{pins:()=>({dataMode:'RECLAIM_SIGNED_RECORD'})},config:config(),directory:'/offline',signal:f.controller.signal,ports:f.ports});
 assert.equal(result.completed,true);assert.equal(f.resumed,1);assert.equal(f.paid,1);
 const at=e=>f.events.indexOf(e);for(const [a,b]of [['prepare-realm','open-context'],['listen','APPLICATION_BOUND'],['prepare-reflection','approval'],['approval','resume-exact'],['resume-exact','pay'],['finish','close'],['close','drain']])assert.ok(at(a)<at(b),a+' before '+b);
});
test('rejected approval and cancellation cannot resume or pay; owned context and mounted requests are disposed',async()=>{
 for(const options of [{approvalFailure:true},{abortAt:'NORMAL_HOST_ACTIVE'}]){const f=flowFixture(options);
  await assert.rejects(composeNormalFlow({source:{pins:()=>({dataMode:'RECLAIM_SIGNED_RECORD'})},config:config(),directory:'/offline',signal:f.controller.signal,ports:f.ports}));
  assert.equal(f.resumed,0);assert.equal(f.paid,0);assert.ok(f.closed>=1);assert.equal(f.events.at(-1),'drain');
 }
});
test('synthetic source is rejected before realm; bounded waits stop and error text never crosses safe output',async()=>{
 const f=flowFixture();await assert.rejects(composeNormalFlow({source:{pins:()=>({dataMode:'SYNTHETIC_FIXTURE'})},ports:f.ports}),/NORMAL_HOST_REAL_SOURCE_REQUIRED/);assert.deepEqual(f.events,[]);
 await assert.rejects(waitUntil(()=>false,{timeoutMs:5,pollMs:1}),/NORMAL_HOST_WAIT_EXPIRED/);
 assert.equal(safeCode(Error('private text must stay private')),'NORMAL_HOST_STOPPED');
});

test('source failure stops before exact AI preparation/approval, resume or any payment',async()=>{
 const f=flowFixture(),open=f.ports.open;
 f.ports.open=async()=>({...await open(),async collectSources(){throw Error('BC_PRODUCER_FAILED');}});
 await assert.rejects(composeNormalFlow({source:{pins:()=>({dataMode:'RECLAIM_SIGNED_RECORD'})},config:config(),directory:'/offline',signal:f.controller.signal,ports:f.ports}),/BC_PRODUCER_FAILED/);
 assert.equal(f.resumed,0);assert.equal(f.paid,0);assert.equal(f.events.includes('approval'),false);assert.equal(f.events.includes('AWAITING_EXACT_AI_APPROVAL'),false);
 assert.equal(f.events.at(-1),'drain');
});
