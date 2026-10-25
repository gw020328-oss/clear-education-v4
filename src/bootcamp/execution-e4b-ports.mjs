import {isDevelopmentConnection,recordDevelopmentFailure} from './execution-development.mjs';
import {recoverAddress,Signature,TypedDataEncoder,id as ethersId} from 'ethers';
import {canonical,exactKeys,freeze,requireRule as check} from '../policy/values.mjs';
import {hash,id} from './model.mjs';
import {address,uint,u64,sync} from './execution-ports.mjs';
import {e4Hash,validateE4Observation} from './execution-e4-ports.mjs';
import {PROFILE_HASH,TYPES,PRIMARY_TYPE} from '../bootcamp-authorization/test-schema-v3.mjs';

const copy=value=>freeze(structuredClone(value));
const ZERO='0x'+'00'.repeat(32);
export const commandNonce=command=>['prepareUnsigned','accept'].includes(command.method)?command.args[1].nonce:ZERO;
export const bridgeBusinessHash=(command,observation)=>command.method==='claim'?e4Hash({applicationId:observation.business.applicationId,state:observation.business.application.state,right:observation.business.right}):observation.businessHash;
export function validateBusinessWindow(window){
 exactKeys(window,['createdAt','sourceUntil','reviewUntil','messageUntil','businessValidUntil'],'BC_E5B_WINDOW');
 for(const [key,n]of Object.entries(window))check(n===null&&['sourceUntil','reviewUntil','messageUntil'].includes(key)||Number.isSafeInteger(n)&&n>0,'BC_E5B_WINDOW');
 check(window.businessValidUntil===Math.min(window.createdAt+120,...['sourceUntil','reviewUntil','messageUntil'].map(k=>window[k]??Infinity)),'BC_E5B_WINDOW');
 return copy(window);
}
const methods=['registerCurrentMet','allocate','startReview','observeCurrent','replaceTarget','bindConsents','prepareUnsigned','accept','terminate','claim'];
export function validateBridgeCommand(command){
 exactKeys(command,['method','args','applicationId'],'BC_E5B_COMMAND');check(methods.includes(command.method)&&Array.isArray(command.args),'BC_E5B_COMMAND');hash(command.applicationId);
 if(command.method==='claim'){check(command.args.length===1&&command.args[0]===command.applicationId,'BC_E5B_COMMAND');}
 else{hash(command.args[0]);check((['prepareUnsigned','accept'].includes(command.method)?command.args[1]?.applicationId:command.args[1])===command.applicationId,'BC_E5B_COMMAND');}
 return copy(command);
}
export function createE4BridgePorts(configuration=null){
 if(configuration===null)return Object.freeze({configured:false});
 exactKeys(configuration,['version','sourceMode','runtime','reader','worker','bindController','fenceReader'],'BC_E5B_CONFIGURATION');
 check(configuration.version==='clear-bootcamp-e4b-connection.1'&&(configuration.sourceMode==='SYNTHETIC_TEST_SOURCE'||configuration.sourceMode==='REGISTERED_TEST_SOURCE'&&isDevelopmentConnection(configuration)),'BC_E5B_CONFIGURATION');
 const projection=copy(configuration.runtime);exactKeys(projection,['runtimeHash','manifest','vaultScope','authorityScope'],'BC_E5B_RUNTIME');
 const m=projection.manifest;
 exactKeys(m,['version','environmentId','production','finalityPolicy','imageId','platform','image','clientVersion','networkIsolation','chainId','networkId','genesisHash','endpoint','tokenAddress','tokenCodeHash','vaultAddress','vaultCodeHash','instanceId','policyHash','runtimeMappingHash','operationsPolicyHash','domain','typeHash','domainSeparator','roles','signerKeyId','signerAddress','controllerAddress','deploymentTransactions','checkpoint','blockHashCapability'],'BC_E5B_MANIFEST');
 check(m.version==='clear-e5-test-runtime.1'&&m.production===false&&m.finalityPolicy==='LOCAL_DEV_INCLUSION_ONLY'&&m.operationsPolicyHash===PROFILE_HASH,'BC_E5B_RUNTIME');
 id(m.environmentId);uint(m.chainId);check(m.chainId!=='0','BC_E5B_RUNTIME');
 for(const key of ['tokenAddress','vaultAddress','signerAddress','controllerAddress'])address(m[key]);
 for(const key of ['genesisHash','tokenCodeHash','vaultCodeHash','instanceId','policyHash','runtimeMappingHash','operationsPolicyHash','typeHash','domainSeparator','signerKeyId'])hash(m[key]);
 exactKeys(m.domain,['name','version','chainId','verifyingContract','salt'],'BC_E5B_DOMAIN');
 check(m.domain.name==='ClearBootcampTestPayment'&&m.domain.version==='3'&&m.domain.chainId===m.chainId&&m.domain.verifyingContract===m.vaultAddress&&m.domain.salt===m.instanceId,'BC_E5B_DOMAIN');
 check(m.typeHash===ethersId(TypedDataEncoder.from(TYPES).encodeType(PRIMARY_TYPE))&&m.domainSeparator===TypedDataEncoder.hashDomain(m.domain),'BC_E5B_TYPED_DOMAIN');
 exactKeys(m.roles,['registrar','initialSigner','keyAdmin','relayer','depositor','terminator'],'BC_E5B_ROLES');Object.values(m.roles).forEach(address);
 check(m.signerAddress===m.roles.initialSigner&&new Set([...Object.values(m.roles),m.controllerAddress,m.tokenAddress,m.vaultAddress]).size===9,'BC_E5B_ROLE_SEPARATION');
 check(projection.runtimeHash===e4Hash(m),'BC_E5B_RUNTIME_HASH');
 const scope={runtimeId:m.environmentId,runtimePinHash:projection.runtimeHash,scopeKey:e4Hash({chainId:m.chainId,vaultAddress:m.vaultAddress,instanceId:m.instanceId})};
 check(canonical(projection.authorityScope)===canonical(scope)&&canonical(projection.vaultScope)===canonical({chainId:m.chainId,vaultAddress:m.vaultAddress,instanceId:m.instanceId}),'BC_E5B_SCOPE');
 exactKeys(configuration.reader,['observe','compare','claimReceipt'],'BC_E5B_READER');
 const workerKeys=['authorize','lookup','envelope','seal','adopt','dispatch','recover'];exactKeys(configuration.worker,workerKeys,'BC_E5B_WORKER');
 check(['observe','compare'].every(k=>typeof configuration.reader[k]==='function')&&(configuration.reader.claimReceipt===null||typeof configuration.reader.claimReceipt==='function')
  &&workerKeys.every(k=>typeof configuration.worker[k]==='function')&&typeof configuration.bindController==='function','BC_E5B_FACADE');
 exactKeys(configuration.fenceReader,['version','read'],'BC_E5B_FENCE_READER');
 check(configuration.fenceReader.version==='clear-bootcamp-runtime-fence-reader.1'&&typeof configuration.fenceReader.read==='function','BC_E5B_FENCE_READER');
 const read=configuration.reader.observe.bind(configuration.reader),compare=configuration.reader.compare.bind(configuration.reader),bind=configuration.bindController;
 const claimReceipt=configuration.reader.claimReceipt?.bind(configuration.reader);
 const worker=Object.fromEntries(workerKeys.map(k=>[k,configuration.worker[k].bind(configuration.worker)]));
 const floor=configuration.fenceReader.read.bind(configuration.fenceReader),tickets=new WeakMap();let bound=false;
 const runtime=copy({runtimeHash:projection.runtimeHash,domain:m.domain,tokenAddress:m.tokenAddress,signerKeyId:m.signerKeyId,controllerAddress:m.controllerAddress,roles:{registrar:m.roles.registrar,relayer:m.roles.relayer}});
 function observation(input,command){
  const {executionBusinessHash,operationMethod,...raw}=input;
  const o=validateE4Observation(raw,runtime);check(o.business.applicationId===command.applicationId&&o.business.nonce===commandNonce(command),'BC_E5B_OBSERVATION_TARGET');
  if(executionBusinessHash!==undefined||operationMethod!==undefined)check(executionBusinessHash===bridgeBusinessHash(command,o)&&operationMethod===command.method,'BC_E5B_OBSERVATION_COMMAND');
  return o;
 }
 function ticket(kind,value){const t=Object.freeze({});tickets.set(t,{kind,value:copy(value)});return t;}
 function certificate(value,payload){
  exactKeys(value,['payload','signature'],'BC_E5B_CERTIFICATE');check(canonical(value.payload)===canonical(payload),'BC_E5B_CERTIFICATE');let signer;
  try{signer=recoverAddress(e4Hash(payload),Signature.from(value.signature)).toLowerCase();}catch{throw Error('BC_E5B_CERTIFICATE');}
  check(signer===runtime.controllerAddress,'BC_E5B_CONTROLLER_SIGNER');return copy(value);
 }
 return Object.freeze({configured:true,sourceMode:configuration.sourceMode,scope:copy(scope),runtime,projection,executionEnabled:isDevelopmentConnection(configuration),
  diagnose:(phase,error)=>recordDevelopmentFailure(configuration,phase,error),
  fenceReader:Object.freeze({version:'clear-bootcamp-runtime-fence-reader.1',read:query=>floor(copy(query))}),
  bind(factory){check(!bound,'BC_E5B_ALREADY_BOUND');bound=true;
   sync(bind(owner=>{
    exactKeys(owner,['witnesses','issuer'],'BC_E5B_OWNER_PORT');exactKeys(owner.witnesses,['consume'],'BC_E5B_OWNER_PORT');exactKeys(owner.issuer,['capability','current','commit'],'BC_E5B_OWNER_PORT');
    check(typeof owner.witnesses.consume==='function'&&Object.values(owner.issuer).every(v=>typeof v==='function'),'BC_E5B_OWNER_PORT');
    const consume=owner.witnesses.consume.bind(owner.witnesses),issue=Object.fromEntries(Object.entries(owner.issuer).map(([k,v])=>[k,v.bind(owner.issuer)]));
    return factory(Object.freeze({consume(t){const value=sync(consume(t));exactKeys(value,['version','runtimeHash','phase','binding','command','observation','proof','reference','payload'],'BC_E5B_PRIVATE_EVIDENCE');
     check(value.version==='clear-e5b-controller-evidence.1'&&value.runtimeHash===runtime.runtimeHash,'BC_E5B_PRIVATE_EVIDENCE');return copy(value);},
     issue(kind,t,payload){check(Object.hasOwn(issue,kind),'BC_E5B_ISSUER_KIND');return certificate(sync(issue[kind](t)),payload);}}));
   }));
  },
  consume(t,kind){const r=tickets.get(t);check(r&&r.kind===kind,'BC_E5B_UNTRUSTED_RESULT');return r.value;},
  observation,
  async read(command,anchor=null){command=validateBridgeCommand(command);const result=await read(command);exactKeys(result,['observation','businessHash'],'BC_E5B_READ');
   const o=observation(result.observation,command);check(result.businessHash===bridgeBusinessHash(command,o),'BC_E5B_BUSINESS_HASH');let comparison=null;
   if(anchor){comparison=await compare(copy({previous:anchor,current:o.checkpoint}));
    if(comparison.status==='CANONICAL_ANCESTOR')check(comparison.previous===anchor.hash&&comparison.current===o.checkpoint.hash,'BC_E5B_ANCESTRY');
    else check(comparison.status==='REORG_PROVEN_RECOVERY_BLOCKED'&&comparison.oldHash===anchor.hash&&comparison.currentHash===o.checkpoint.hash&&comparison.replacementHash!==anchor.hash&&comparison.automaticRebase===false,'BC_E5B_ANCESTRY');}
   return ticket('OBSERVATION',{observation:o,businessHash:result.businessHash,comparison});
  },
  async authorize(request){return certificate(await worker.authorize(copy(request)),request.binding);},
  lookup(request){return ticket('LOOKUP',sync(worker.lookup(copy(request))));},
  envelope(request){return ticket('ENVELOPE',sync(worker.envelope(copy(request))));},
  async adopt(request){return ticket('ADOPTION',await worker.adopt(copy(request)));},
  async recover(request){const r=await worker.recover(copy(request));
   const allowed=['ref','lineage','automaticResign','status','txHash','checkpoint','observation','currentObservation','blockHash','finalized','code','historicalObservation','automaticPromotion'];
   check(Object.keys(r).every(k=>allowed.includes(k))&&r.ref===request.ref&&typeof r.status==='string','BC_E5B_RECEIPT_SHAPE');
   return ticket('RECEIPT',r);},
  async seal(request){check(isDevelopmentConnection(configuration),'BC_E5B_FINAL_PACKET_ACTIVATION_PENDING');const r=await worker.seal(copy(request));exactKeys(r,['ref','manifestHash'],'BC_E5B_REFERENCE');check(typeof r.ref==='string'&&r.ref.length<=128,'BC_E5B_REFERENCE');hash(r.manifestHash);return ticket('REFERENCE',r);},
  async dispatch(request){check(isDevelopmentConnection(configuration),'BC_E5B_FINAL_PACKET_ACTIVATION_PENDING');return worker.dispatch(copy(request));},
  async directClaimReceipt(query){check(claimReceipt,'BC_E5B_DIRECT_CLAIM_READER_UNCONFIGURED');exactKeys(query,['applicationId','txHash'],'BC_E5B_CLAIM_QUERY');Object.values(query).forEach(hash);
   const r=await claimReceipt(copy(query));
   check(r.version==='clear-e5b-direct-claim-receipt.1'&&r.runtimeHash===runtime.runtimeHash&&r.applicationId===query.applicationId&&r.txHash===query.txHash,'BC_E5B_CLAIM_RECEIPT');
   const common=['version','runtimeHash','applicationId','txHash','status'];
   if(r.status==='UNKNOWN'){exactKeys(r,[...common,'code','automaticPromotion'],'BC_E5B_CLAIM_RECEIPT');check(r.code==='E5B_CLAIM_READBACK_UNAVAILABLE'&&r.automaticPromotion===false,'BC_E5B_CLAIM_RECEIPT');}
   else{
    exactKeys(r,[...common,'checkpoint','observation','allocationId','authorizationDigest','recipient','token','amountAtoms','finalized'],'BC_E5B_CLAIM_RECEIPT');
    const o=validateE4Observation(r.observation,runtime),right=o.business.right;
    check(r.status==='INCLUDED'&&r.finalized===false&&o.business.applicationId===query.applicationId&&o.business.application.state==='6'
     &&canonical(r.checkpoint)===canonical(o.checkpoint)&&o.business.nonce===right.nonce&&o.business.nonceUsed,'BC_E5B_CLAIM_RECEIPT');
    for(const key of ['allocationId','authorizationDigest','recipient','token','amountAtoms'])check(r[key]===right[key],'BC_E5B_CLAIM_RECEIPT');
    check(right.token===runtime.tokenAddress&&right.amountAtoms==='100000000'&&right.allocationId!==ZERO&&right.authorizationDigest!==ZERO&&right.nonce!==ZERO,'BC_E5B_CLAIM_RECEIPT');
   }
   return ticket('DIRECT_CLAIM',r);
  },
 });
}
