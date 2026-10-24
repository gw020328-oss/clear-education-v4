// Fresh isolated TEST chain, invented actors/source/model only. Never opens a retained actual run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {JsonRpcProvider} from 'ethers';
import {createEnvironment,environmentRecord,ownedTestWallet,stopEnvironment,parkEnvironment} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {ExecutionReader} from '../../../src/hackathon-test-vault/e5/reader.mjs';
import {createApplicationService} from '../../../src/application/service.mjs';
import {createBootcampStore} from '../../../src/bootcamp/store.mjs';
import {openDevelopmentConnection} from '../../../src/bootcamp/execution-development.mjs';
import {syntheticAuthority} from '../../bootcamp-store/fixture.mjs';
import {P0_POLICY} from '../../../specs/bootcamp/p0-contract.mjs';
import {normalSourceTarget} from '../../../tools/bootcamp/normal-current-view.mjs';
import {executeNormalPayment} from '../../../tools/bootcamp/normal-chain.mjs';
import {assertExplicitConsents} from '../../../tools/bootcamp/explicit-consents.mjs';

async function fixture(t,{crossing=false}={}){
 const e=await createEnvironment(),id=e.environmentId,m=e.manifest,{dir}=environmentRecord(id);
 let auth,store,connection,metadata,serial=0,ticks=0,crossed=false,floor=0,sampled=false;
 const report={startedAt:Math.floor(Date.now()/1000),stages:[],completed:false};
 const state=()=>metadata?.prepare("SELECT state FROM envelopes WHERE json_extract(record,'$.method')='bindConsents'").get()?.state??null;
 // Freeze each synchronous turn; inject only the intended recovery boundary.
 const now=()=>{if(!sampled){floor=Math.max(floor,Math.floor(Date.now()/1000));sampled=true;queueMicrotask(()=>{sampled=false;});}
  if(crossing&&!crossed&&report.stage==='BIND_CONSENTS'&&state()==='SEND_STARTED'&&++ticks===3){floor++;crossed=true;}
  return floor;
 };
 const provider=new JsonRpcProvider(m.endpoint,undefined,{cacheTimeout:-1,batchMaxCount:1});provider.pollingInterval=50;
 t.after(()=>{metadata?.close();store?.close();auth?.close();connection?.close();provider.destroy();stopEnvironment(id);parkEnvironment(id);});
 const participant=ownedTestWallet(id,'recipient'),operator=ownedTestWallet(id,'terminator');
 auth=createApplicationService({directory:join(dir,'offline-bind-auth'),origin:'https://offline-bind.example.invalid',chainId:Number(m.chainId),instanceId:m.instanceId,
  participants:[participant.address],operators:[operator.address],now});
 const login=async wallet=>{const c=auth.challenge({wallet:wallet.address,chainId:Number(m.chainId)}),r=auth.login({nonce:c.nonce,signature:await wallet.signMessage(c.message)},c.browserToken);
  return {token:r.token,wallet:r.wallet,chainId:Number(m.chainId),csrf:r.csrf};};
 const user=await login(participant),op=await login(operator),serviceContext=Object.freeze({});
 connection=openDevelopmentConnection({environmentId:id,now});metadata=new DatabaseSync(join(dir,'envelopes/metadata.sqlite'),{readOnly:true});
 const source=syntheticAuthority({now}),seen=new WeakSet();
 const resolveSource=r=>{const v=source.resolveSource(r);if(!seen.has(v)){v.authExpiresAt=now()+600;v.rawExpiresAt=now()+300;v.queryExpiresAt=now()+600;seen.add(v);}return v;};
 const executionServices={version:'clear-bootcamp-test-execution-port.1',runtimeId:id,runtimePinHash:connection.runtime.runtimeHash,
  authorizeService(c){assert.equal(c,serviceContext);return {serviceId:'normal-worker',runtimeId:id,expiresAt:report.startedAt+600};},
  reader:{async snapshot(){throw Error('OFFLINE_LEGACY_DISABLED');}},envelope:{async lookup(){throw Error('OFFLINE_LEGACY_DISABLED');}}};
 store=createBootcampStore({directory:join(dir,'offline-bind-store'),authentication:auth,instanceId:'offline-'+id,demoStartedAt:report.startedAt,mode:'SYNTHETIC_FIXTURE',runtimeMappingHash:m.runtimeMappingHash,now,
  producers:source.producers,resolveSource,operatorBindings:[{wallet:operator.address,courseOperatorRef:'course-operator-demo'}],procedurePorts:connection.procedurePorts,executionServices,executionBridge:connection.configuration});
 const key=()=> 'offline-bind-'+(++serial),app=store.createApplication(user,{},key()).record.applicationId;
 for(const criterion of P0_POLICY.criteria){const req=store.issueRequest(user,app,{criterionId:criterion.criterionId,expectedRevision:store.getApplication(user,app).revision},key());await store.collect(user,app,{requestId:req.record.target.requestId,expectedRevision:req.record.applicationRevision},key());}
 const sourceTarget=normalSourceTarget(store.getApplication(user,app));
 const directConsent=context=>{const v=store.getProcedure(context,app);store.recordReviewConsent(context,app,{expectedRevision:v.applicationRevision,expectedLedgerSequence:v.ledgerSequence,
  targetDecisionId:v.decisionId,targetDecisionRevision:v.decisionRevision,targetDecisionHash:v.decisionHash,value:'AGREE'},key());};
 const run=()=>executeNormalPayment({store,connection,serviceContext,user,op,app,recipient:participant.address.toLowerCase(),provider,key,report,sourceTarget,write(){},stage:name=>{report.stage=name;},
  waitForConsents:async({target,read})=>{await read();directConsent(user);directConsent(op);assertExplicitConsents(await read(),target);}});
 return {run,report,metadata,store,user,app,get crossed(){return crossed;},nativeState:state,environmentId:id,runtimeHash:connection.runtime.runtimeHash,diagnostics:()=>connection.diagnostics(),metrics:()=>connection.metrics()};
}

test('dual direct consents complete BIND and payment when post-send authority recovery crosses one second',async t=>{
 const f=await fixture(t,{crossing:true});
 try{await f.run();}catch(e){t.diagnostic(JSON.stringify({stage:f.report.stage,crossed:f.crossed,nativeBindState:f.nativeState(),completed:f.report.completed,
  callbackDiagnostics:f.diagnostics(),safeError:/^[A-Z][A-Z0-9_]+$/.test(e.message)?e.message:'UNCLASSIFIED'}));throw e;}
 assert.equal(f.crossed,true);assert.equal(f.report.completed,true);
 assert.deepEqual(f.report.stages.map(x=>x.kind),['REGISTER','ALLOCATE','START_REVIEW','BIND_CONSENTS','PREPARE','ACCEPT']);
 assert.equal(f.report.claim.amountAtoms,'100000000');assert.equal(f.report.claim.duplicateRejected,true);
 assert.equal(f.store.getProcedure(f.user,f.app).consent.bothCurrent,true);
 assert.equal(f.metadata.prepare("SELECT count(*) n FROM envelopes WHERE json_extract(record,'$.method')='bindConsents'").get().n,1);
 assert.equal(f.metrics().broadcasts,6);assert.equal(f.metrics().transactionSignatures,6);assert.equal(f.metrics().paymentSignatures,1);
 assert.deepEqual(f.diagnostics().filter(d=>d.code==='BC_E5_CLOCK_CHANGED').map(d=>d.phase),[]);
});

