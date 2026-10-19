import {Wallet} from 'ethers';
import {randomUUID} from 'node:crypto';
import {executionFixture,database,H,ZERO} from './fixture.mjs';
import {e4Hash} from '../../src/bootcamp/execution-e4-ports.mjs';
import {hashTestUnsignedPayload} from '../../src/bootcamp-authorization/test-encoding-v3.mjs';

// No real E4 runtime/keys/network. The E3 records/source guards are the actual
// store implementation, while this public reader/service is explicitly offline.
export async function currentFixture(t,{kind='PREPARE',issuer=true,seal=true,route='MUTUAL'}={}){
 const f=await executionFixture(t);if(route==='MUTUAL'){f.consent(f.a);f.consent(f.a,f.operatorContext);}else f.setTime(f.time+120);
 const preparationId=f.prepare(f.a).record.target.preparationId;
 const prepared=database(f,db=>JSON.parse(db.prepare('SELECT record FROM e3_prepared WHERE id=?').get(preparationId).record));
 const m=prepared.payload.message,digest=hashTestUnsignedPayload({domain:prepared.payload.domain,message:m}).digest;
 const certificateWallet=Wallet.createRandom(),runtime={runtimeHash:f.ports.runtimePinHash,domain:prepared.payload.domain,tokenAddress:m.token,signerKeyId:m.signerKeyId,
  controllerAddress:certificateWallet.address.toLowerCase(),roles:{registrar:'0x'+'44'.repeat(20),relayer:'0x'+'55'.repeat(20)}};
 let observation={version:'clear-e5-canonical-observation.1',runtimeHash:runtime.runtimeHash,checkpoint:{number:'100',hash:H('e4-block-100'),time:String(f.time)},finality:'INCLUDED',
  business:{applicationId:m.applicationId,application:{recipient:m.recipient,state:'3',target:{decisionId:m.decisionId,revision:m.decisionRevision,decisionHash:m.decisionHash,sourceValidUntilExclusive:m.sourceValidUntilExclusive,acceptanceSequence:'5',sourceReceiptHash:prepared.sourceCommitment},
   version:'4',epoch:m.authorizationEpoch,allocationId:m.allocationId,allocatedAt:m.decisionPublishedAt,targetRecordedAt:m.decisionPublishedAt,procedureId:m.procedureId,
   firstStartedAt:m.firstReviewStartedAt,publishedAt:m.decisionPublishedAt,revalidationCount:m.revalidationCount,currentMet:true,validObjection:false,unassessedObjection:false,newValidError:false,terminalError:false,
   consentSetHash:m.consentSetHash,mutualConsent:route==='MUTUAL',observationReceiptHash:prepared.sourceCommitment,observedAt:m.decisionPublishedAt,
   preparedDigest:kind==='ACCEPT'?digest:ZERO,preparedNonce:kind==='ACCEPT'?m.nonce:ZERO,deadlinePolicyHash:kind==='ACCEPT'?m.deadlinePolicyHash:ZERO,terminationReason:'0',terminationReceiptHash:ZERO},
  right:{recipient:'0x'+'00'.repeat(20),token:'0x'+'00'.repeat(20),amountAtoms:'0',allocationId:ZERO,authorizationDigest:ZERO,nonce:ZERO,signerKeyId:ZERO,authorizationEpoch:'0',acceptedAt:'0',settledAt:'0'},
  accounting:{B:'150000000',R:'100000000',O:'200000000',A:'50000000',U:'100000000',S:'50000000',surplus:'0'},queue:[],nextAllocatable:ZERO,paused:false,nonce:m.nonce,nonceUsed:false,keyRevoked:false},businessHash:''};
 const metrics={reads:0,compares:0,certificates:0,seals:0,dispatches:0,recoveries:0};let readHook=async()=>{},sealHook=async()=>{},certifyHook=()=>{},compareHook=null,connection;
 const snapshot=()=>{const o=structuredClone(observation);o.businessHash=e4Hash(o.business);return o;};
 const configuration={version:'clear-bootcamp-e4-current-connection.1',sourceMode:'SYNTHETIC_TEST_SOURCE',runtime,
  reader:{async observe(request){metrics.reads++;await readHook();const o=snapshot();o.business.nonce=request.nonce;if(request.nonce!==m.nonce)o.business.nonceUsed=false;o.businessHash=e4Hash(o.business);return o;},async compare(from,to){metrics.compares++;return compareHook?compareHook(from,to):{status:'CANONICAL_ANCESTOR',previous:from.hash,current:to.hash};}},
  certificateIssuer:issuer?{certifySync(payload){metrics.certificates++;certifyHook(payload);return {payload,signature:certificateWallet.signingKey.sign(e4Hash(payload)).serialized};}}:null,
  service:seal?{observe:async()=>snapshot(),async seal(request){metrics.seals++;await sealHook(request);return {ref:'env-'+randomUUID(),manifestHash:H('sealed-exact-original-bytes-hash-only')};},
   async dispatch(){metrics.dispatches++;throw Error('OFFLINE_MUST_NOT_DISPATCH');},async recover(){metrics.recoveries++;throw Error('OFFLINE_RECOVERY_NOT_CONNECTED');}}:null};
 f.configuration.executionConnection=configuration;f.restart();
 const command={method:kind==='ACCEPT'?'accept':'prepareUnsigned',args:[f.chain.operation.operationId,m,'4'],applicationId:m.applicationId};
 const i=f.enqueue({kind,preparationId,authorizationDigest:digest,caller:kind==='ACCEPT'?runtime.roles.relayer:runtime.roles.registrar,payloadHash:e4Hash(command)}).receipt.intentId;
 const h=f.acquire(i);connection=f.store.execution.connectCurrentController(f.context);
 const prepare=()=>connection.worker.prepare(h,f.inspect(h));
 const currentRequest=binding=>{const o={...snapshot(),executionBusinessHash:binding.businessHash,operationMethod:command.method};return {binding,observation:o,
  payload:{version:'clear-e5-current-witness.1',challenge:randomUUID(),phase:'BEFORE_KEY_FINAL_SYNC',bindingHash:e4Hash(binding),observationHash:e4Hash(o),runtimeHash:runtime.runtimeHash}};};
 const commitRequest=(binding,result)=>({binding,payload:{version:'clear-e5-api-commit.1',challenge:randomUUID(),ref:result.ref,manifestHash:result.manifestHash,bindingHash:e4Hash(binding),runtimeHash:runtime.runtimeHash}});
 return {...f,get store(){return f.store;},get time(){return f.time;},get connection(){return connection;},i,h,m,prepared,digest,configuration,runtime,command,metrics,prepare,snapshot,currentRequest,commitRequest,
  observation,readHook:fn=>{readHook=fn;},sealHook:fn=>{sealHook=fn;},certifyHook:fn=>{certifyHook=fn;},compareHook:fn=>{compareHook=fn;},
  setOperators(bindings){f.configuration.operatorBindings=bindings;},
  setFault(callback){f.configuration.fault=callback;},
  reconnect(){f.restart();connection=f.store.execution.connectCurrentController(f.context);return connection;}};
}
