import {randomUUID} from 'node:crypto';
import {TypedDataEncoder,id as ethersId} from 'ethers';
import {currentFixture} from './current-fixture.mjs';
import {H,ZERO} from './fixture.mjs';
import {bridgeBusinessHash} from '../../src/bootcamp/execution-e4b-ports.mjs';
import {e4Hash} from '../../src/bootcamp/execution-e4-ports.mjs';
import {TYPES,PRIMARY_TYPE} from '../../src/bootcamp-authorization/test-schema-v3.mjs';

// Offline owner facade only. No E4 environment, payment signature, raw
// transaction, chain connection or sender is created by this fixture.
export async function bridgeFixture(t,{kind='PREPARE',configure=true,challenge='12345678-1234-4123-8123-123456789abc',fault=()=>{}}={}){
 const f=await currentFixture(t,{kind,setupOnly:true}),m=f.m;
 const manifest={version:'clear-e5-test-runtime.1',environmentId:f.ports.runtimeId,production:false,finalityPolicy:'LOCAL_DEV_INCLUSION_ONLY',
  imageId:H('offline-image'),platform:'OFFLINE',image:'OFFLINE_FIXTURE',clientVersion:'OFFLINE',networkIsolation:'NO_NETWORK',chainId:m.domain?.chainId??f.runtime.domain.chainId,
  networkId:'1',genesisHash:H('genesis'),endpoint:'OFFLINE',tokenAddress:m.token,tokenCodeHash:H('token-code'),vaultAddress:f.runtime.domain.verifyingContract,vaultCodeHash:H('vault-code'),instanceId:f.runtime.domain.salt,
  policyHash:m.policyHash,runtimeMappingHash:m.runtimeMappingHash,operationsPolicyHash:m.operationsPolicyHash,domain:f.runtime.domain,typeHash:ethersId(TypedDataEncoder.from(TYPES).encodeType(PRIMARY_TYPE)),
  domainSeparator:TypedDataEncoder.hashDomain(f.runtime.domain),roles:{registrar:f.runtime.roles.registrar,relayer:f.runtime.roles.relayer,initialSigner:'0x'+'66'.repeat(20),keyAdmin:'0x'+'77'.repeat(20),depositor:'0x'+'88'.repeat(20),terminator:'0x'+'99'.repeat(20)},
  signerKeyId:m.signerKeyId,signerAddress:'0x'+'66'.repeat(20),controllerAddress:f.runtime.controllerAddress,deploymentTransactions:{token:H('token-deploy'),vault:H('vault-deploy')},checkpoint:{number:'100',hash:H('checkpoint')},blockHashCapability:{synthetic:true}};
 const runtimeHash=e4Hash(manifest),vaultScope={chainId:manifest.chainId,vaultAddress:manifest.vaultAddress,instanceId:manifest.instanceId};
 const projection={runtimeHash,manifest,vaultScope,authorityScope:{runtimeId:manifest.environmentId,runtimePinHash:runtimeHash,scopeKey:e4Hash(vaultScope)}};
 f.ports.runtimePinHash=runtimeHash;f.runtime.runtimeHash=runtimeHash;f.observation.runtimeHash=runtimeHash;
 let observedCommand=f.command,comparisonHook=null,controller,active=null,floor=0,issueHook=()=>{},readHook=async()=>{},adoption=null,envelope=null,lookupHook=()=>{},afterLookup=()=>{},receipt=null,nativeAdoptions=0,nativeRecoveries=0;
 const tickets=new WeakMap(),counts={reads:0,consumed:0,issued:0,binds:0,seals:0,dispatches:0};
 const snapshot=()=>f.snapshot();
 function invoke(kind,binding,phase,overrides={}){
  const command=observedCommand,o={...snapshot(),executionBusinessHash:binding.businessHash,operationMethod:command.method};
  o.business.nonce=['prepareUnsigned','accept'].includes(command.method)?command.args[1].nonce:'0x'+'00'.repeat(32);o.businessHash=e4Hash(o.business);
  const recovery=['LOOKUP','RECOVER','RECOVER_FINAL_SYNC','RETENTION'].includes(phase)||kind==='capability'&&binding.purpose==='RECOVER';
  const payload=kind==='capability'?binding:kind==='commit'?{version:'clear-e5-api-commit.2',challenge,ref:adoption?.ref??'env-offline',manifestHash:adoption?.manifestHash??H('manifest'),adoptionId:adoption?.adoptionId??'adoption-not-committed',adoptionHash:adoption?.adoptionHash??H('not-committed'),bindingHash:e4Hash(binding),runtimeHash}:
   {version:'clear-e5-current-witness.2',challenge,phase,bindingHash:e4Hash(binding),observationHash:e4Hash(recovery?{lookup:true}:o),runtimeHash};
  const evidence={version:'clear-e5b-controller-evidence.1',runtimeHash,phase,binding,command,observation:recovery?{lookup:true}:o,
   proof:recovery?{kind:'AUTHORITY_ONLY_NO_CHAIN_ASSERTION'}:{kind:'REGISTERED_CANONICAL_READER',runtimeHash,query:{applicationId:command.applicationId,nonce:o.business.nonce},anchor:binding.anchor,current:o.checkpoint,businessHash:binding.businessHash,commandHash:binding.commandHash,bindingHash:e4Hash(binding),ancestry:{ancestor:binding.anchor.hash,descendant:o.checkpoint.hash}},
   reference:kind==='commit'?{ref:adoption?.ref??'env-offline',manifestHash:adoption?.manifestHash??H('manifest'),adoptionId:adoption?.adoptionId??'adoption-not-committed',adoptionHash:adoption?.adoptionHash??H('not-committed')}:null,payload,...overrides};
  const ticket=Object.freeze({}),frame={kind,evidence,read:false,issued:false};tickets.set(ticket,frame);active=frame;
  try{return controller[{capability:'authorizeSync',current:'readCurrentSync',commit:'commitCurrentSync'}[kind]]({ticket});}
  finally{active=null;tickets.delete(ticket);}
 }
 const config={version:'clear-bootcamp-e4b-connection.1',sourceMode:'SYNTHETIC_TEST_SOURCE',runtime:projection,
  reader:{async observe(command){counts.reads++;await readHook();const observation=snapshot();observation.business.nonce=['prepareUnsigned','accept'].includes(command.method)?command.args[1].nonce:'0x'+'00'.repeat(32);observation.businessHash=e4Hash(observation.business);return {observation,businessHash:bridgeBusinessHash(command,observation)};},async compare({previous,current}){if(comparisonHook)return comparisonHook(previous,current);return {status:'CANONICAL_ANCESTOR',previous:previous.hash,current:current.hash};},claimReceipt:null},
  worker:{async authorize({binding,command}){observedCommand=command;const value=invoke('capability',binding,'AUTHORIZE');floor=Math.max(floor,Number(binding.workerFence));return value;},
   lookup({binding}){lookupHook();invoke('current',binding,'LOOKUP');afterLookup();return envelope?{status:'FOUND',automaticSeal:false,envelope}:{status:'NOT_FOUND',automaticSeal:false};},
   envelope(){return envelope;},async seal(){counts.seals++;throw Error('OFFLINE_MUST_NOT_SIGN');},async dispatch(){counts.dispatches++;throw Error('OFFLINE_MUST_NOT_SEND');},
   async adopt({binding,ref,manifestHash}){nativeAdoptions++;invoke('current',binding,'BEFORE_ADOPTION');adoption={version:'clear-e5-envelope-adoption.1',adoptionId:'adoption-offline',ref,manifestHash,originalBindingHash:envelope.originalBindingHash,binding,bindingHash:e4Hash(binding),businessValidUntil:binding.business.businessValidUntil,authorityUntil:Math.min(binding.expiresAt,binding.business.businessValidUntil)};adoption.adoptionHash=e4Hash(adoption);return adoption;},
   async recover({binding}){nativeRecoveries++;invoke('current',binding,'RECOVER');return receipt;},
  },
  bindController(factory){if(controller)throw Error('ALREADY_BOUND');counts.binds++;
   const issue=kind=>ticket=>{const v=tickets.get(ticket);if(!v||active!==v||v.kind!==kind||!v.read||v.issued)throw Error('OFFLINE_ISSUER_SCOPE');v.issued=true;counts.issued++;issueHook();return {payload:v.evidence.payload,signature:f.certificateWallet.signingKey.sign(e4Hash(v.evidence.payload)).serialized};};
   controller=factory({witnesses:{consume(ticket){const v=tickets.get(ticket);if(!v||active!==v||v.read)throw Error('OFFLINE_UNTRUSTED_TICKET');v.read=true;counts.consumed++;return v.evidence;}},issuer:{capability:issue('capability'),current:issue('current'),commit:issue('commit')}});
  },fenceReader:{version:'clear-bootcamp-runtime-fence-reader.1',async read(query){if(e4Hash(query)!==e4Hash(projection.authorityScope))throw Error('OFFLINE_SCOPE');return {version:'clear-bootcamp-runtime-fence-witness.1',...query,highestFence:floor};}},
 };
 let bridge,g,h,i,clockHook=()=>{};const baseNow=f.configuration.now;f.configuration.now=()=>{clockHook();return baseNow();};
 if(configure){f.configuration.fault=fault;f.configuration.executionBridge=config;f.restart();bridge=f.store.execution.connectBridge(f.context);await f.store.execution.observeRuntimeFence(f.context);
  g=f.store.execution.acquireRuntime(f.context,{owner:'worker-one',expectedFence:0,generation:1,leaseSeconds:30});
  if(kind==='OBSERVE'){
   const plan=await f.store.execution.planCorrection(f.aliceContext,f.a,{kind,operationId:H('correction-op')});Object.assign(f.command,plan.command);observedCommand=f.command;
   i=f.store.execution.enqueue(f.aliceContext,f.a,plan.body,f.key()).receipt.intentId;
  }else i=f.enqueue({kind,preparationId:f.prepared.preparationId,authorizationDigest:f.digest,caller:kind==='ACCEPT'?manifest.roles.relayer:manifest.roles.registrar,payloadHash:e4Hash(f.command)}).receipt.intentId;
  h=f.acquire(i);f.store.execution.bindRuntimeIntent(f.context,g,h);
 }
 return {...f,get store(){return f.store;},get time(){return f.time;},config,projection,counts,bridge,g,h,i,invoke,
  prepare:()=>bridge.prepare(g,h,bridge.inspect(g,h)),setIssueHook:fn=>{issueHook=fn;},setClockHook:fn=>{clockHook=fn;},setReadHook:fn=>{readHook=fn;},setLookupHook:fn=>{lookupHook=fn;},
  setComparison:fn=>{comparisonHook=fn;},setAfterLookup:fn=>{afterLookup=fn;},setReceipt:r=>{receipt=r;},setEnvelope:e=>{envelope=e;},get adoption(){return adoption;},get nativeAdoptions(){return nativeAdoptions;},get nativeRecoveries(){return nativeRecoveries;},
  makeEnvelope(binding,extra={}){envelope={version:'clear-e5-public-envelope.2',ref:'env-offline',manifestHash:H('manifest'),state:'SEALED',runtimeHash,intentId:i,requestId:i,attemptId:binding.attemptId,lineage:binding.lineage,commandHash:binding.commandHash,originalBindingHash:e4Hash(binding),sender:kind==='ACCEPT'?manifest.roles.relayer:manifest.roles.registrar,transactionNonce:'0',authorizationNonce:m.nonce,to:manifest.vaultAddress,value:'0',chainId:manifest.chainId,dataHash:H('data'),txHash:H('tx'),businessValidUntil:binding.business.businessValidUntil,originalAuthorityUntil:binding.expiresAt,bytesUntil:f.time+3600,...extra};return envelope;},
 };
}
