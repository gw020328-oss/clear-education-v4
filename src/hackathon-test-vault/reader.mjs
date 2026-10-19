import {Interface,AbiCoder,keccak256,TypedDataEncoder,toUtf8Bytes} from 'ethers';
import {DOMAIN_NAME,DOMAIN_VERSION,PRIMARY_TYPE,TYPES} from '../bootcamp-authorization/test-schema-v3.mjs';
import {freeze,exactKeys} from '../policy/values.mjs';
const check=(v,code)=>{if(!v)throw new Error(code);};
const b32=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x);
const address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&x!=='0x'+'00'.repeat(20);
const decimal=x=>typeof x==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(x);
const low=x=>typeof x==='string'?x.toLowerCase():'';
const decimalHex=x=>{check(typeof x==='string'&&/^0x[0-9a-f]+$/i.test(x),'E4_RPC_VALUE');return BigInt(x).toString();};
const roleNames=['registrar','initialSigner','keyAdmin','relayer','depositor','terminator'];
const bounds=()=>({payoutEnabled:false,sourceAuthenticatedByEvent:false,payoutAccepted:false,distributedAtomicity:false});
export function createPreparationReader({read,abi,pin}={}){
 if(!read)return freeze({snapshot:async()=>freeze({status:'UNCONFIGURED',...bounds()})});
 exactKeys(pin,['version','chainId','genesisHash','instanceId','vaultAddress','vaultCodeHash','tokenAddress','tokenCodeHash','operationsPolicyHash','policyHash','runtimeMappingHash','roles','sourceMode','environment'],'E4_PIN');
 check(pin.version==='clear-hackathon-test-preparation-runtime.1'&&pin.sourceMode==='SYNTHETIC_FIXTURE'&&pin.environment==='MEMORY_COMPONENT_HARNESS_ONLY','E4_PIN');
 check(decimal(pin.chainId)&&BigInt(pin.chainId)>0n&&address(pin.vaultAddress)&&address(pin.tokenAddress),'E4_PIN');
 for(const k of ['genesisHash','instanceId','vaultCodeHash','tokenCodeHash','operationsPolicyHash','policyHash','runtimeMappingHash'])check(b32(pin[k]),'E4_PIN');
 exactKeys(pin.roles,roleNames,'E4_ROLES');check(roleNames.every(k=>address(pin.roles[k]))&&new Set(Object.values(pin.roles)).size===6,'E4_ROLES');
 const p=freeze(structuredClone(pin)),iface=new Interface(abi),abiCoder=AbiCoder.defaultAbiCoder();
 const rpc=async(method,args)=>{try{return await read(method,args);}catch{throw new Error('E4_RPC_UNAVAILABLE');}};
 const call=async(name,args,block)=>{const data=await rpc('eth_call',[{to:p.vaultAddress,data:iface.encodeFunctionData(name,args)},block]);try{return iface.decodeFunctionResult(name,data);}catch{throw new Error('E4_RPC_VALUE');}};
 async function canonicalBlock(number,hash){const block=await rpc('eth_getBlockByNumber',[number,false]);check(block&&low(block.hash)===low(hash)&&decimalHex(block.number)===decimalHex(number),'E4_REORG');return block;}
 async function atCheckpoint(fn){
  check(decimalHex(await rpc('eth_chainId',[]))===p.chainId,'E4_ENVIRONMENT');
  const genesis=await rpc('eth_getBlockByNumber',['0x0',false]);check(genesis&&low(genesis.hash)===p.genesisHash,'E4_ENVIRONMENT');
  const block=await rpc('eth_getBlockByNumber',['latest',false]);check(block&&b32(low(block.hash)),'E4_RPC_VALUE');const tag=block.number;decimalHex(tag);
  for(const [at,hash]of [[p.vaultAddress,p.vaultCodeHash],[p.tokenAddress,p.tokenCodeHash]])check(keccak256(await rpc('eth_getCode',[at,tag]))===hash,'E4_CODE_PIN');
  for(const [name,expected]of [['instanceId',p.instanceId],['PROFILE',p.operationsPolicyHash],['policyHash',p.policyHash],['runtimeMappingHash',p.runtimeMappingHash],['token',p.tokenAddress]])check(low((await call(name,[],tag))[0])===expected,'E4_ENVIRONMENT');
  const roles=await call('roles',[],tag);for(const k of roleNames)check(low(roles[k])===p.roles[k],'E4_ROLES');
  check((await call('payoutEnabled',[],tag))[0]===false,'E4_PREPARATION_ONLY');
  const domain={name:DOMAIN_NAME,version:DOMAIN_VERSION,chainId:p.chainId,verifyingContract:p.vaultAddress,salt:p.instanceId};
  check((await call('domainSeparator',[],tag))[0]===TypedDataEncoder.hashDomain(domain),'E4_DOMAIN');
  check((await call('TYPE_HASH',[],tag))[0]===keccak256(toUtf8Bytes(TypedDataEncoder.from(TYPES).encodeType(PRIMARY_TYPE))),'E4_TYPE_HASH');
  const checkpoint={chainId:p.chainId,blockNumber:decimalHex(tag),blockHash:low(block.hash)};
  const result=await fn(tag,checkpoint);await canonicalBlock(tag,block.hash);return freeze(result);
 }
 const target=t=>Object.fromEntries(['decisionId','revision','decisionHash','acceptanceSequence','epoch','appVersion','sourceReceiptHash'].map(k=>[k,typeof t[k]==='bigint'?t[k].toString():t[k]]));
 return freeze({
  async snapshot(appId){check(b32(appId),'E4_APPLICATION_ID');return atCheckpoint(async(tag,checkpoint)=>{
   const a=(await call('application',[appId],tag))[0],x=await call('accounting',[],tag);
   return {version:'clear-hackathon-test-preparation-observation.1',status:'OBSERVED_AT_CANONICAL_CHECKPOINT',checkpoint,applicationId:appId,
    application:{state:['NONE','QUEUED','RESERVED','REVIEW','TERMINATED','ACCEPTED','SETTLED'][Number(a.state)],version:a.version.toString(),epoch:a.epoch.toString(),recipient:low(a.recipient),allocationId:a.allocationId,procedureId:a.procedureId,firstStartedAt:a.firstStartedAt.toString(),publishedAt:a.publishedAt.toString(),sourceValidUntilExclusive:a.target.sourceValidUntilExclusive.toString(),preparedDigest:a.preparedDigest,decisionId:a.target.decisionId,decisionRevision:a.target.revision.toString(),decisionHash:a.target.decisionHash},
    accounting:Object.fromEntries(['B','R','O','A','U','S','surplus'].map(k=>[k,x[k].toString()])),...bounds()};
  });},
  async operation(operationId,expectedDigest){check(b32(operationId)&&b32(expectedDigest),'E4_OPERATION');return atCheckpoint(async(tag,checkpoint)=>{const digest=(await call('operations',[operationId],tag))[0];check(digest==='0x'+'00'.repeat(32)||digest===expectedDigest,'E4_OPERATION_CONFLICT');return {status:digest===expectedDigest?'APPLIED_AT_CHECKPOINT':'NOT_OBSERVED',operationId,checkpoint,...bounds()};});},
  async replacement(transactionHash,expected){
   check(b32(transactionHash),'E4_TX_HASH');exactKeys(expected,['operationId','applicationId','calldata','commandDigest','allocationId','firstStartedAt','previous'],'E4_COMMAND');
   check(b32(expected.operationId)&&b32(expected.applicationId)&&b32(expected.commandDigest)&&b32(expected.allocationId)&&decimal(expected.firstStartedAt),'E4_COMMAND');
   const e=freeze(structuredClone(expected));
   return atCheckpoint(async(tag)=>{
    const receipt=await rpc('eth_getTransactionReceipt',[transactionHash]);check(receipt,'E4_TX_UNKNOWN');
    check(low(receipt.transactionHash)===transactionHash&&receipt.status==='0x1'&&low(receipt.to)===p.vaultAddress&&low(receipt.from)===p.roles.registrar,'E4_TX_RECEIPT');
    const tx=await rpc('eth_getTransactionByHash',[transactionHash]);check(tx&&low(tx.hash)===transactionHash&&low(tx.to)===p.vaultAddress&&low(tx.from)===p.roles.registrar&&tx.input===e.calldata&&tx.blockHash===receipt.blockHash&&tx.blockNumber===receipt.blockNumber&&tx.transactionIndex===receipt.transactionIndex,'E4_TX_BINDING');
    check(BigInt(receipt.blockNumber)<=BigInt(tag),'E4_FUTURE_RECEIPT');await canonicalBlock(receipt.blockNumber,receipt.blockHash);
    check(keccak256(abiCoder.encode(['address','bytes'],[p.roles.registrar,tx.input]))===e.commandDigest,'E4_COMMAND_DIGEST');
    let command;try{command=iface.parseTransaction({data:tx.input});}catch{throw new Error('E4_COMMAND');}check(command?.name==='replaceTarget'&&command.args.op===e.operationId&&command.args.appId===e.applicationId,'E4_COMMAND');
    const logs=receipt.logs.filter(l=>low(l.address)===p.vaultAddress).map(l=>{try{return {log:l,event:iface.parseLog(l)};}catch{return null;}}).filter(Boolean);
    const replacements=logs.filter(x=>x.event?.name==='TargetReplaced'&&x.event.args.operationId===e.operationId),operations=logs.filter(x=>x.event?.name==='OperationApplied'&&x.event.args.operationId===e.operationId);
    check(replacements.length===1&&operations.length===1,'E4_EVENT_COUNT');const {event,log}=replacements[0],r=event.args,applied=operations[0].event.args;
    for(const l of [log,operations[0].log])check(l.removed!==true&&l.transactionHash===receipt.transactionHash&&l.blockHash===receipt.blockHash&&l.blockNumber===receipt.blockNumber&&l.transactionIndex===receipt.transactionIndex,'E4_LOG_BINDING');
    check(BigInt(log.logIndex)<BigInt(operations[0].log.logIndex),'E4_EVENT_ORDER');
    check(applied.digest===e.commandDigest&&low(applied.actor)===p.roles.registrar,'E4_OPERATION_EVENT');
    check(r.applicationId===e.applicationId&&r.allocationId===e.allocationId&&r.firstStartedAt.toString()===e.firstStartedAt,'E4_REPLACEMENT_TARGET');
    const previous=target(r.previous),current=target(r.current);exactKeys(e.previous,Object.keys(previous),'E4_PREVIOUS');
    check(Object.keys(previous).every(k=>previous[k]===e.previous[k]),'E4_PREVIOUS');
    check(r.current.epoch===r.previous.epoch+1n&&r.current.appVersion===r.previous.appVersion+1n&&r.current.revision>r.previous.revision&&r.current.acceptanceSequence>r.previous.acceptanceSequence&&command.args.expectedVersion===r.previous.appVersion,'E4_REPLACEMENT_ORDER');
    check(command.args.t.decisionId===r.current.decisionId&&command.args.t.revision===r.current.revision&&command.args.t.decisionHash===r.current.decisionHash&&command.args.t.acceptanceSequence===r.current.acceptanceSequence&&command.args.t.sourceReceiptHash===r.current.sourceReceiptHash&&command.args.mode===r.mode,'E4_REPLACEMENT_COMMAND');
    await canonicalBlock(receipt.blockNumber,receipt.blockHash);
    return {version:'clear-hackathon-test-target-replacement.1',status:'INCLUDED',runtime:p,applicationId:e.applicationId,allocationId:r.allocationId,firstStartedAt:e.firstStartedAt,previous,current,mode:r.mode.toString(),operationId:e.operationId,commandDigest:e.commandDigest,
     checkpoint:{chainId:p.chainId,transactionHash,blockNumber:decimalHex(receipt.blockNumber),blockHash:low(receipt.blockHash),transactionIndex:decimalHex(receipt.transactionIndex),logIndex:decimalHex(log.logIndex)},...bounds()};
   });
  },
 });
}
