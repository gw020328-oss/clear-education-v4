// E5 TEST reader. Every state query is bound to an EIP-1898 canonical block hash.
import {Interface,AbiCoder,TypedDataEncoder,keccak256} from 'ethers';
import {buildExecution} from '../../../tests/hackathon-test-vault/execution-build.mjs';
import {buildPreparation} from '../../../tests/hackathon-test-vault/build.mjs';
import {TYPES} from '../../bootcamp-authorization/test-schema-v3.mjs';
import {loopbackRpc,blockHashCapability} from './rpc.mjs';
import {ensure,sha,json} from './private-storage.mjs';
export const ZERO='0x'+'00'.repeat(32);
export const AMOUNT='100000000';
const roles=['registrar','initialSigner','keyAdmin','relayer','depositor','terminator'];
const plain=v=>JSON.parse(json(v?.toObject?v.toObject(true):v));
const lower=v=>typeof v==='string'?v.toLowerCase():v;
export const checkpoint=b=>({number:BigInt(b.number).toString(),hash:b.hash,time:BigInt(b.timestamp).toString()});
export function businessHashFor(command,observation){return command.method==='claim'?sha({applicationId:observation.business.applicationId,state:observation.business.application.state,right:observation.business.right}):observation.businessHash;}
export class ExecutionReader {
 constructor(manifest,{rpc=loopbackRpc(manifest.endpoint)}={}) {
  ensure(manifest.version==='clear-e5-test-runtime.1'&&manifest.production===false&&manifest.finalityPolicy==='LOCAL_DEV_INCLUSION_ONLY','E5_RUNTIME_KIND');
  this.manifest=structuredClone(manifest);this.runtimeHash=sha(manifest);this.rpc=rpc;
  this.build=buildExecution();this.vault=new Interface(this.build.contract.abi);this.token=new Interface(buildPreparation().ClearTestToken.abi);
 }
 async block(hash){const b=hash?await this.rpc('eth_getBlockByHash',[hash,false]):await this.rpc('eth_getBlockByNumber',['latest',false]);ensure(b?.hash&&b.number&&b.timestamp,'E5_BLOCK_INCOMPLETE');if(hash)ensure(b.hash===hash,'E5_BLOCK_HASH');await this.canonical(b);return b;}
 async canonical(b){const current=await this.rpc('eth_getBlockByNumber',[b.number,false]);ensure(current?.hash,'E5_CANONICAL_INCOMPLETE');ensure(current.hash===b.hash,'E5_NONCANONICAL');}
 async call(name,args,block,{token=false,from}={}){
  const iface=token?this.token:this.vault,to=token?this.manifest.tokenAddress:this.manifest.vaultAddress;
  const result=await this.rpc('eth_call',[{to,data:iface.encodeFunctionData(name,args),...(from?{from}: {})},{blockHash:block.hash,requireCanonical:true}]);
  try{return iface.decodeFunctionResult(name,result);}catch{throw Error('E5_CALL_INCOMPLETE');}
 }
 async validate(block){
  const m=this.manifest,r=this.rpc,selector={blockHash:block.hash,requireCanonical:true};
  ensure(BigInt(await r('eth_chainId')).toString()===m.chainId,'E5_CHAIN_ID');
  ensure((await r('eth_getBlockByNumber',['0x0',false]))?.hash===m.genesisHash,'E5_GENESIS');
  const code=await r('eth_getCode',[m.vaultAddress,selector]);
  ensure(keccak256(code)===m.vaultCodeHash,'E5_VAULT_CODE_PIN');
  // Check the frozen compiled template as well as a manifest-supplied hash.
  const bytes=Buffer.from(code.slice(2),'hex');
  for(const refs of Object.values(this.build.immutableReferences))for(const {start,length}of refs)bytes.fill(0,start,start+length);
  ensure(keccak256(bytes)===this.build.runtimeTemplateHash,'E5_VAULT_TEMPLATE');
  ensure(keccak256(await r('eth_getCode',[m.tokenAddress,selector]))===this.build.tokenCodeHash&&m.tokenCodeHash===this.build.tokenCodeHash,'E5_TOKEN_CODE');
  for(const [method,key]of [['token','tokenAddress'],['instanceId','instanceId'],['policyHash','policyHash'],['runtimeMappingHash','runtimeMappingHash'],['PROFILE','operationsPolicyHash'],['TYPE_HASH','typeHash'],['domainSeparator','domainSeparator']])ensure(lower((await this.call(method,[],block))[0])===m[key],'E5_RUNTIME_'+method);
  ensure(TypedDataEncoder.hashDomain(m.domain)===m.domainSeparator,'E5_DOMAIN');
  const actual=await this.call('roles',[],block);roles.forEach((role,i)=>ensure(lower(actual[i])===m.roles[role],'E5_ROLE_PIN'));
  const key=await this.call('keys',[m.signerKeyId],block);ensure(lower(key[0])===m.signerAddress,'E5_KEY_PIN');
  ensure((await this.call('decimals',[],block,{token:true}))[0]===6n,'E5_TOKEN_DECIMALS');
  return {keyRevoked:key[1]};
 }
 async probe(){return blockHashCapability(this.rpc);}
 async observe({applicationId=ZERO,nonce=ZERO,blockHash}={}){
  const b=await this.block(blockHash),runtime=await this.validate(b),m=this.manifest;
  const application=plain((await this.call('application',[applicationId],b))[0]);
  const right=plain((await this.call('acceptedRight',[applicationId],b))[0]);
  // Canonical wire addresses must be normalized before hashing/private witness issuance.
  application.recipient=lower(application.recipient);
  right.recipient=lower(right.recipient);right.token=lower(right.token);
  const accounting=plain(await this.call('accounting',[],b));
  const ids=(await this.call('applicationIds',[],b))[0],queue=[];
  for(const appId of ids){const a=plain((await this.call('application',[appId],b))[0]);if(a.state==='1'&&a.currentMet&&!a.validObjection&&!a.unassessedObjection&&!a.newValidError&&!a.terminalError&&BigInt(a.target.sourceValidUntilExclusive)>BigInt(b.timestamp))queue.push({applicationId:appId,sequence:a.target.acceptanceSequence});}
  queue.sort((a,b)=>BigInt(a.sequence)<BigInt(b.sequence)?-1:1);
  const next=(await this.call('nextAllocatable',[],b))[0];ensure(next===(queue[0]?.applicationId??ZERO),'E5_QUEUE_MISMATCH');
  const paused=(await this.call('newOperationsPaused',[],b))[0],nonceUsed=(await this.call('usedNonces',[nonce],b))[0];
  const actual=(await this.call('balanceOf',[m.vaultAddress],b,{token:true}))[0];
  ensure(BigInt(accounting.B)>=BigInt(accounting.R)&&BigInt(accounting.O)>=BigInt(accounting.R)&&actual>=BigInt(accounting.B),'E5_ACCOUNTING');
  const A=BigInt(accounting.B)-BigInt(accounting.R),U=BigInt(accounting.O)-BigInt(accounting.R);
  ensure(accounting.A===String(A)&&accounting.U===String(U)&&accounting.S===String(U>A?U-A:0n)&&accounting.surplus===String(actual-BigInt(accounting.B)),'E5_ACCOUNTING_DERIVATION');
  await this.canonical(b);
  const business={applicationId,application,right,accounting,queue,nextAllocatable:next,paused,nonce,nonceUsed,keyRevoked:runtime.keyRevoked};
  return {version:'clear-e5-canonical-observation.1',runtimeHash:this.runtimeHash,checkpoint:checkpoint(b),finality:'INCLUDED',business,businessHash:sha(business)};
 }
 async ancestry(older,newer){
  const start=await this.block(older.hash),end=await this.block(newer.hash);ensure(BigInt(start.number)<=BigInt(end.number),'E5_CHECKPOINT_REGRESSION');
  let b=end;for(let i=0;b.hash!==start.hash;i++){ensure(i<4096&&BigInt(b.number)>BigInt(start.number),'E5_ANCESTRY_UNPROVEN');b=await this.block(b.parentHash);}
  await this.canonical(end);return {ancestor:start.hash,descendant:end.hash};
 }
 async compare(previous,current,{previousFinality='INCLUDED'}={}){
  if(previousFinality==='FINALIZED')throw Error('E5_FINALIZED_UNSUPPORTED_STOP');
  const old=await this.rpc('eth_getBlockByHash',[previous.hash,false]),at=await this.rpc('eth_getBlockByNumber',['0x'+BigInt(previous.number).toString(16),false]);
  ensure(old?.hash&&at?.hash,'E5_REORG_EVIDENCE_INCOMPLETE');
  if(at.hash===previous.hash){await this.ancestry(previous,current);return {status:'CANONICAL_ANCESTOR',previous:previous.hash,current:current.hash};}
  let a=old,b=await this.block(current.hash),steps=0;
  while(a.hash!==b.hash){ensure(++steps<=4096,'E5_REORG_ANCESTRY_LIMIT');if(BigInt(a.number)>=BigInt(b.number))a=await this.rpc('eth_getBlockByHash',[a.parentHash,false]);else b=await this.rpc('eth_getBlockByHash',[b.parentHash,false]);ensure(a?.hash&&b?.hash,'E5_REORG_EVIDENCE_INCOMPLETE');}
  await this.canonical(a);await this.block(current.hash);
  return {status:'REORG_PROVEN_RECOVERY_BLOCKED',oldHash:previous.hash,replacementHash:at.hash,currentHash:current.hash,commonAncestor:checkpoint(a),automaticRebase:false};
 }
 async checkCommand(command,observation){
  const b=await this.block(observation.checkpoint.hash),m=this.manifest;
  if(command.method==='accept'){
   const msg=command.args[1],result=await this.call('checkPrepared',[msg],b);
   ensure(result[0]===TypedDataEncoder.hash(m.domain,TYPES,msg)&&result[1]===false,'E5_PREPARED_DIGEST');
   ensure(observation.business.application.version===command.args[2],'E5_APP_VERSION');
  }
  if(command.method==='claim')ensure(observation.business.application.state==='5','E5_ACCEPTED_RIGHT');
  await this.canonical(b);
 }
 // Expected calldata digest and actor come from the durable envelope, never a body flag.
 async receipt(expected){
  const r=await this.rpc('eth_getTransactionReceipt',[expected.txHash]);if(!r)return {status:'UNKNOWN',txHash:expected.txHash};
  ensure(r.transactionHash===expected.txHash&&r.blockHash&&r.blockNumber,'E5_RECEIPT_INCOMPLETE');
  const block=await this.rpc('eth_getBlockByHash',[r.blockHash,true]);ensure(block?.hash===r.blockHash&&block.number===r.blockNumber,'E5_RECEIPT_BLOCK');
  const canonical=await this.rpc('eth_getBlockByNumber',[r.blockNumber,false]);ensure(canonical?.hash,'E5_CANONICAL_INCOMPLETE');
  if(canonical.hash!==r.blockHash)return {status:'REORGED',txHash:expected.txHash,blockHash:r.blockHash};
  const tx=await this.rpc('eth_getTransactionByHash',[expected.txHash]);
  ensure(tx&&tx.blockHash===r.blockHash&&tx.blockNumber===r.blockNumber&&tx.transactionIndex===r.transactionIndex,'E5_TX_MEMBERSHIP');
  ensure(block.transactions?.[Number(BigInt(r.transactionIndex))]?.hash===expected.txHash,'E5_BLOCK_MEMBERSHIP');
  ensure(lower(tx.from)===expected.sender&&lower(tx.to)===expected.to&&BigInt(tx.value)===0n&&BigInt(tx.nonce).toString()===expected.nonce&&BigInt(tx.chainId).toString()===this.manifest.chainId&&keccak256(tx.input)===expected.dataHash,'E5_TX_BINDING');
  ensure(lower(r.from)===expected.sender&&lower(r.to)===expected.to,'E5_RECEIPT_ACTOR');
  const observation=await this.observe({applicationId:expected.applicationId,nonce:expected.authorizationNonce??ZERO,blockHash:r.blockHash});
  if(r.status==='0x0')return {status:'REVERTED',txHash:expected.txHash,checkpoint:checkpoint(block),observation};
  ensure(r.status==='0x1'&&Array.isArray(r.logs),'E5_RECEIPT_STATUS');
  const seen=new Set(),events=[];
  for(const log of r.logs){ensure(log.blockHash===r.blockHash&&log.blockNumber===r.blockNumber&&log.transactionHash===expected.txHash&&log.transactionIndex===r.transactionIndex&&log.removed!==true&&!seen.has(log.logIndex),'E5_LOG_MEMBERSHIP');seen.add(log.logIndex);
   const iface=lower(log.address)===this.manifest.vaultAddress?this.vault:lower(log.address)===this.manifest.tokenAddress?this.token:null;
   if(iface){try{const event=iface.parseLog(log);if(event)events.push({address:lower(log.address),name:event.name,args:event.args});}catch{throw Error('E5_EVENT_DECODE');}}
  }
  const decoded=(expected.method==='approve'?this.token:this.vault).parseTransaction({data:tx.input});ensure(decoded?.name===expected.method,'E5_METHOD_BINDING');
  if(expected.method!=='claim'&&expected.method!=='approve'){
   const digest=keccak256(AbiCoder.defaultAbiCoder().encode(['address','bytes'],[tx.from,tx.input]));
   ensure((await this.call('operations',[decoded.args[0]],block))[0]===digest,'E5_OPERATION_MAPPING');
   const hits=events.filter(e=>e.name==='OperationApplied'&&e.args[0]===decoded.args[0]&&e.args[1]===digest&&lower(e.args[2])===expected.sender);
   ensure(hits.length===1,'E5_OPERATION_EVENT_REQUIRED');
  }
  const right=observation.business.right,a=observation.business.application;
  if(expected.applicationId!==ZERO){const changed=events.filter(e=>e.name==='AppChanged'&&e.args[0]===expected.applicationId);ensure(changed.length===1&&String(changed[0].args[1])===a.state&&String(changed[0].args[2])===a.version&&String(changed[0].args[3])===a.epoch,'E5_APPLICATION_EVENT_READBACK');}
  if(expected.method==='approve'){const approvals=events.filter(e=>e.name==='Approval'&&lower(e.args[0])===expected.sender&&lower(e.args[1])===this.manifest.vaultAddress&&e.args[2]===decoded.args[1]);ensure(approvals.length===1&&(await this.call('allowance',[expected.sender,this.manifest.vaultAddress],block,{token:true}))[0]===decoded.args[1],'E5_APPROVAL_READBACK');}
  if(expected.method==='fund')ensure(events.filter(e=>e.name==='Funded'&&e.args[0]===decoded.args[0]&&e.args[1]===decoded.args[1]).length===1,'E5_FUND_EVENT');
  if(expected.method==='accept'){
   const digest=TypedDataEncoder.hash(this.manifest.domain,TYPES,decoded.args[1].toObject(true));
   const hits=events.filter(e=>e.name==='RightAccepted'&&e.args[0]===expected.applicationId&&e.args[1]===right.allocationId&&e.args[2]===digest&&e.args[3]===right.nonce&&String(e.args[4])===right.acceptedAt);
   ensure(hits.length===1&&['5','6'].includes(a.state)&&right.authorizationDigest===digest&&right.amountAtoms===AMOUNT&&lower(right.recipient)===lower(a.recipient)&&lower(right.token)===this.manifest.tokenAddress&&observation.business.nonceUsed,'E5_ACCEPT_READBACK');
  }
  if(expected.method==='claim'){
   const hits=events.filter(e=>e.name==='RightSettled'&&e.args[0]===expected.applicationId&&e.args[1]===right.allocationId&&lower(e.args[2])===lower(right.recipient)&&String(e.args[3])===AMOUNT&&String(e.args[4])===right.settledAt);
   const transfers=events.filter(e=>e.address===this.manifest.tokenAddress&&e.name==='Transfer'&&lower(e.args[0])===this.manifest.vaultAddress&&lower(e.args[1])===lower(right.recipient)&&String(e.args[2])===AMOUNT);
   ensure(hits.length===1&&transfers.length===1&&a.state==='6'&&right.amountAtoms===AMOUNT&&BigInt(right.settledAt)>0n,'E5_CLAIM_READBACK');
  }
  await this.canonical(block);return {status:'INCLUDED',txHash:expected.txHash,checkpoint:checkpoint(block),observation,finalized:false};
 }
}
