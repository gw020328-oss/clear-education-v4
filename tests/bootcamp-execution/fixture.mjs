import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {procedureFixture} from '../bootcamp-store/procedure-fixture.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {TEST_PORT_VERSION} from '../../src/bootcamp/execution-ports.mjs';
export const H=label=>p0Hash('E5-OFFLINE-FIXTURE',label);
export const ZERO='0x'+'00'.repeat(32);
export function bindObservation(observation,request){const o=structuredClone(observation);
 if(o.ancestry.relation==='INITIAL')o.ancestry={fromBlockHash:request.previousCheckpoint?.blockHash??null,
  relation:!request.previousCheckpoint?'INITIAL':request.previousCheckpoint.blockHash===o.checkpoint.blockHash?'SAME':'DESCENDANT',evidenceHash:H('offline-ancestry-only'),
  finalizedBlockHash:request.finalizedCheckpoint?.blockHash??null,finalizedRelation:!request.finalizedCheckpoint?'NONE':request.finalizedCheckpoint.blockHash===o.checkpoint.blockHash?'SAME':'DESCENDANT'};
 return o;}
export function database(f,fn){const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'));try{return fn(db);}finally{db.close();}}
export function dump(f,tables=['e5_intents','e5_receipts','e5_attempts','e5_events','e5_observations','e5_envelopes']){
 return database(f,db=>Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()])));
}
export async function executionFixture(t,{configured=true,publish=true}={}){
 const f=await procedureFixture(t),a=f.create();await f.complete(a);if(publish)f.publish(a);
 else f.store.registerCurrentMetForE4(f.aliceContext,a,f.body(a),f.key());
 const credentials=new WeakMap(),context=Object.freeze({}),other=Object.freeze({});
 credentials.set(context,'worker-one');credentials.set(other,'worker-two');
 const metrics={authorizations:0,reads:0,lookups:0,signatures:0,broadcasts:0};let revoked=false,readHook=async()=>{},lookupHook=async()=>{},manifest=null;
 const ports={version:TEST_PORT_VERSION,runtimeId:'e5-offline-runtime',runtimePinHash:H('runtime-pin'),
  authorizeService(credential){metrics.authorizations++;const serviceId=credentials.get(credential);if(revoked||!serviceId)throw Error('SERVICE_FORBIDDEN');
   return {serviceId,runtimeId:this.runtimeId,expiresAt:f.time+120};},
  reader:{async snapshot(request){metrics.reads++;await readHook(request);return bindObservation(chain,request);}},
  envelope:{async lookup(request){metrics.lookups++;await lookupHook(request);return structuredClone(manifest);}},
 };
 f.configuration.executionServices=configured?ports:null;f.restart();
 const v=f.view(a),ids=database(f,db=>db.prepare('SELECT * FROM e3_ids').all());
 const opaque=(kind,logical)=>ids.find(r=>r.kind===kind&&r.logical_id===logical)?.opaque_id??ZERO;
 let chain={version:'clear-bootcamp-test-chain-observation.1',runtimeId:ports.runtimeId,runtimePinHash:ports.runtimePinHash,
  applicationId:a,chainApplicationId:opaque('APPLICATION',a),checkpoint:{blockNumber:'100',blockHash:H('block-100'),parentHash:H('block-99'),finality:{kind:'INCLUDED',evidenceHash:null}},
  ancestry:{fromBlockHash:null,relation:'INITIAL',evidenceHash:H('initial-offline-observation'),finalizedBlockHash:null,finalizedRelation:'NONE'},
  application:{state:publish?'REVIEW':'QUEUED',version:'4',epoch:'2',decisionId:opaque('DECISION',v.decisionId),decisionRevision:String(v.decisionRevision),decisionHash:v.decisionHash,
   recipient:f.alice.address.toLowerCase(),token:'0x'+'33'.repeat(20),allocationId:opaque('ALLOCATION',v.funding.allocationId),procedureId:opaque('PROCEDURE',v.procedure.id),
   allocatedAt:String(f.time),targetRecordedAt:String(f.time),firstStartedAt:String(v.procedure.firstStartedAt??0),publishedAt:String(v.procedure.publishedAt??0),revalidationCount:0,
   sourceValidUntilExclusive:String(f.time+300),currentMet:true,objectionBlocked:false,consentSetHash:H('consents'),preparedDigest:ZERO},
  authorization:{signerKeyId:H('key'),signerActive:true,nonce:H('auth-nonce'),nonceAvailable:true},
  accounting:{B:'150000000',R:'100000000',O:'200000000',A:'50000000',U:'100000000',S:'50000000'},
  queue:[{applicationId:H('second-app'),acceptanceSequence:'2'}],right:null,operation:{operationId:H('operation-one'),digest:ZERO}};
 const body=(extra={})=>{const view=f.view(a);return {expectedRevision:view.applicationRevision,expectedLedgerSequence:view.ledgerSequence,
  targetDecisionId:view.decisionId,targetDecisionRevision:view.decisionRevision,targetDecisionHash:view.decisionHash,kind:'ALLOCATE',operationId:chain.operation.operationId,
  caller:'0x'+'44'.repeat(20),expectedChainVersion:'4',payloadHash:H('payload'),preparationId:null,authorizationDigest:null,...extra};};
 const enqueue=(extra={},key=f.key(),user=f.aliceContext)=>f.store.execution.enqueue(user,a,body(extra),key);
 const acquire=(i,extra={})=>f.store.execution.acquire(context,i,{owner:'worker-one',generation:1,...extra});
 const inspect=h=>f.store.execution.inspect(context,h);
 const observe=async h=>f.store.execution.observe(context,h,inspect(h));
 const setManifest=(i,h,attempt,extra={})=>{
  const {intent}=f.store.execution.get(f.aliceContext,a,i);
  const m={version:'clear-bootcamp-test-envelope-manifest.1',envelopeRef:'envelope-fixture',runtimeId:ports.runtimeId,runtimePinHash:ports.runtimePinHash,
   intentId:i,attemptId:attempt.attemptId,generation:1,workerFence:h.workerFence,operationId:intent.operationId,caller:intent.caller,expectedVersion:intent.expectedChainVersion,
   payloadHash:intent.payloadHash,authorizationDigest:intent.authorizationDigest,calldataHash:H('calldata-with-signature-digest-only'),commandDigest:H('caller-and-calldata'),
   transactionHash:H('transaction-hash-only-no-transaction'),senderNonce:'7',chainId:'431709',to:'0x'+'22'.repeat(20),value:'0',dispatchNotAfter:f.time+20,retainUntil:f.time+3600,...extra};
  manifest={...m,manifestHash:p0Hash('E5-ENVELOPE-MANIFEST',m)};return manifest;
 };
 return {...f,get store(){return f.store;},get time(){return f.time;},a,ports,metrics,context,other,body,enqueue,acquire,inspect,observe,setManifest,
  get chain(){return chain;},setChain:value=>{chain=value;},setReadHook:fn=>{readHook=fn;},setLookupHook:fn=>{lookupHook=fn;},revoke:()=>{revoked=true;}};
}
