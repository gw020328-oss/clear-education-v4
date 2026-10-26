// Fresh owned TEST environment only. Docker lifecycle is independent of the API/service.
import {createServer} from 'node:net';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {Interface,Wallet,ContractFactory,JsonRpcProvider,keccak256,hexlify,TypedDataEncoder} from 'ethers';
import {atomicPrivate,readPrivate,privateDirectory,ensure,sha} from './private-storage.mjs';
import {loopbackRpc,blockHashCapability} from './rpc.mjs';
import {waitSetupReceipt} from './setup-receipt.mjs';
import {buildExecutionV2} from '../../../tests/hackathon-test-vault/execution-v2-build.mjs';
import {buildExecution} from '../../../tests/hackathon-test-vault/execution-build.mjs';
import {buildPreparation} from '../../../tests/hackathon-test-vault/build.mjs';
import {P0_POLICY,p0PolicyHash} from '../../../specs/bootcamp/p0-contract.mjs';
import {DEFAULT_MAPPING_HASH} from '../../bootcamp/store.mjs';
export const GETH_IMAGE='ethereum/client-go@sha256:abf3605177f8bdcfce436985a8054cca4ae59256323a4ffb72c56c04f3d1fadd';
export const ENV_ROOT=fileURLToPath(new URL('../../../private/hackathon-e5/',import.meta.url));
const docker=(args,timeout=120000)=>execFileSync('docker',args,{timeout,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:4*1024*1024});
const roleNames=['registrar','initialSigner','keyAdmin','relayer','depositor','terminator','recipient','anycaller','controller'];
async function availablePort(){const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));return port;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const own=id=>{ensure(/^e5-[0-9a-f-]{36}$/.test(id),'E5_ENVIRONMENT_ID');return privateDirectory(join(ENV_ROOT,id));};
export function environmentRecord(id){const dir=own(id),r=JSON.parse(readPrivate(join(dir,'environment.json')));ensure(r.environmentId===id&&r.version==='clear-e5-owned-environment.1'&&r.image===GETH_IMAGE&&[0,1].includes(Object.hasOwn(r,'blockPeriodSeconds')?r.blockPeriodSeconds:0),'E5_ENVIRONMENT_OWNER');return {dir,record:r};}
export function ownedTestWallet(id,role){const {dir,record}=environmentRecord(id);ensure(roleNames.includes(role),'E5_ROLE');const keys=JSON.parse(readPrivate(join(dir,'roles.json')));ensure(keys.environmentId===id,'E5_KEY_OWNER');const wallet=new Wallet(keys.keys[role]);ensure(wallet.address.toLowerCase()===record.addresses[role],'E5_KEY_PIN');return wallet;}
function checkedContainer(record){const value=JSON.parse(docker(['inspect',record.container]))[0];ensure(value.Config.Labels?.['clear.e5.owner']===record.environmentId&&value.Config.Image===GETH_IMAGE,'E5_CONTAINER_OWNER');const args=value.Config.Cmd,index=args.indexOf('--dev.period');ensure((index<0?0:Number(args[index+1]))===(record.blockPeriodSeconds??0),'E5_BLOCK_PERIOD_OWNER');return value;}
async function waitRpc(rpc){const deadline=Date.now()+30000;while(Date.now()<deadline){try{return await rpc('eth_chainId');}catch{await sleep(100);}}throw Error('E5_NODE_START_FAILED');}
export async function createEnvironment({runtimeMappingHash=DEFAULT_MAPPING_HASH,blockPeriodSeconds=0,executionVersion=1,testAfterStarted=()=>{}}={}){
 // Validate the caller-approved mapping before creating keys, directories or a chain.
 ensure(typeof runtimeMappingHash==='string'&&/^0x[0-9a-f]{64}$/.test(runtimeMappingHash)&&runtimeMappingHash!=='0x'+'0'.repeat(64),'E5_RUNTIME_MAPPING_HASH');
 ensure([0,1].includes(blockPeriodSeconds),'E5_BLOCK_PERIOD');ensure([1,2].includes(executionVersion),'E5_EXECUTION_VERSION');
 privateDirectory(dirname(ENV_ROOT),{create:true});privateDirectory(ENV_ROOT,{create:true});
 const id='e5-'+randomUUID(),dir=join(ENV_ROOT,id);mkdirSync(dir,{mode:0o700});const chainDir=join(dir,'chain');mkdirSync(chainDir,{mode:0o700});
 const wallets=Object.fromEntries(roleNames.map(k=>[k,Wallet.createRandom()])),addresses=Object.fromEntries(roleNames.map(k=>[k,wallets[k].address.toLowerCase()]));
 const chainId=BigInt('0x'+randomBytes(6).toString('hex')).toString(),container='clear-'+id,network=container+'-net';
 const hostPort=await availablePort();
 const record={hostPort,blockPeriodSeconds,version:'clear-e5-owned-environment.1',environmentId:id,image:GETH_IMAGE,chainId,networkId:(BigInt(chainId)+1n).toString(),addresses,container,network,createdAt:Date.now(),networkIsolation:'BRIDGE_WITH_GETH_DEV_NO_P2P',endpoint:null};
 atomicPrivate(join(dir,'environment.json'),record,{exclusive:true});atomicPrivate(join(dir,'roles.json'),{environmentId:id,keys:Object.fromEntries(roleNames.map(k=>[k,wallets[k].privateKey]))},{exclusive:true});
 const genesis={config:{chainId:Number(chainId),homesteadBlock:0,eip150Block:0,eip155Block:0,eip158Block:0,byzantiumBlock:0,constantinopleBlock:0,petersburgBlock:0,istanbulBlock:0,berlinBlock:0,londonBlock:0,terminalTotalDifficulty:0,shanghaiTime:0},difficulty:'0x0',gasLimit:'0x1c9c380',timestamp:'0x'+Math.floor(Date.now()/1000).toString(16),extraData:hexlify(randomBytes(32)),alloc:Object.fromEntries(Object.values(addresses).map(a=>[a,{balance:'0x3635c9adc5dea00000'}]))};
 atomicPrivate(join(dir,'genesis.json'),genesis,{exclusive:true});
 try{
  docker(['run','--rm','--network','none','--user',`${process.getuid()}:${process.getgid()}`,'--cap-drop=ALL','--security-opt','no-new-privileges','--mount',`type=bind,src=${chainDir},dst=/state`,'--mount',`type=bind,src=${join(dir,'genesis.json')},dst=/genesis.json,readonly`,GETH_IMAGE,'--datadir','/state','--state.scheme','hash','init','/genesis.json']);
  docker(['network','create','--label','clear.e5.owner='+id,network]);
  docker(['run','-d','--name',container,'--label','clear.e5.owner='+id,'--network',network,'--user',`${process.getuid()}:${process.getgid()}`,'--cap-drop=ALL','--security-opt','no-new-privileges','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=16m','--memory','1g','-p',`127.0.0.1:${hostPort}:8545`,'--mount',`type=bind,src=${chainDir},dst=/state`,GETH_IMAGE,'--dev','--dev.period',String(blockPeriodSeconds),'--datadir','/state','--state.scheme','hash','--gcmode','archive','--cache','128','--networkid',record.networkId,'--http','--http.addr','0.0.0.0','--http.port','8545','--http.vhosts','127.0.0.1,localhost','--http.api','eth,net,web3','--ipcpath','/state/geth.ipc','--maxpeers','0','--nodiscover']);
  const c=checkedContainer(record),port=c.NetworkSettings.Ports['8545/tcp'][0];ensure(port?.HostIp==='127.0.0.1','E5_LOOPBACK_BIND');record.endpoint='http://127.0.0.1:'+port.HostPort+'/';
  atomicPrivate(join(dir,'environment.json'),record);const rpc=loopbackRpc(record.endpoint);await waitRpc(rpc);const cut=testAfterStarted({environmentId:id,endpoint:record.endpoint});ensure(!cut?.then,'E5_SETUP_CUT_SYNC_ONLY');
  ensure(BigInt(await rpc('eth_chainId')).toString()===chainId,'E5_CHAIN_ID');ensure(await rpc('net_version')===record.networkId,'E5_NETWORK_ID');ensure(await rpc('net_peerCount')==='0x0','E5_EXTERNAL_PEER');
  const capability=await blockHashCapability(rpc);const clientVersion=await rpc('web3_clientVersion');ensure(clientVersion.startsWith('Geth/v1.17.8-'),'E5_CLIENT_VERSION');
  const provider=new JsonRpcProvider(record.endpoint,undefined,{cacheTimeout:-1,batchMaxCount:1});provider.pollingInterval=50;
  try{
   const build=executionVersion===2?buildExecutionV2():buildExecution();
   const tokenBuild=executionVersion===2?{abi:build.tokenContract.abi,bytecode:'0x'+build.tokenContract.evm.bytecode.object}:buildPreparation().ClearTestToken;
   const token=await new ContractFactory(tokenBuild.abi,tokenBuild.bytecode,wallets.depositor.connect(provider)).deploy(10000000000n);const tokenReceipt=await waitSetupReceipt(provider,token.deploymentTransaction().hash);ensure(tokenReceipt.contractAddress?.toLowerCase()===(await token.getAddress()).toLowerCase(),'E5_SETUP_DEPLOYMENT_ADDRESS');
   const roles=Object.fromEntries(roleNames.slice(0,6).map(k=>[k,addresses[k]])),instanceId=hexlify(randomBytes(32));
   const vault=await new ContractFactory(build.contract.abi,'0x'+build.contract.evm.bytecode.object,wallets.registrar.connect(provider)).deploy(await token.getAddress(),instanceId,p0PolicyHash(P0_POLICY),runtimeMappingHash,roles);const vaultReceipt=await waitSetupReceipt(provider,vault.deploymentTransaction().hash);ensure(vaultReceipt.contractAddress?.toLowerCase()===(await vault.getAddress()).toLowerCase(),'E5_SETUP_DEPLOYMENT_ADDRESS');
   const tokenAddress=(await token.getAddress()).toLowerCase(),vaultAddress=(await vault.getAddress()).toLowerCase(),keyId=hexlify(randomBytes(32));
   const registration=await vault.connect(wallets.keyAdmin.connect(provider)).registerKey(hexlify(randomBytes(32)),keyId,addresses.initialSigner);await waitSetupReceipt(provider,registration.hash);
   const domain={name:'ClearBootcampTestPayment',version:'3',chainId,verifyingContract:vaultAddress,salt:instanceId},actualRoles=await vault.roles();
   ensure(roleNames.slice(0,6).every((k,i)=>actualRoles[i].toLowerCase()===roles[k]),'E5_ROLE_READBACK');
   ensure(await vault.runtimeMappingHash()===runtimeMappingHash,'E5_MAPPING_READBACK');
   const block=await rpc('eth_getBlockByNumber',['latest',false]);
   const manifest={blockPeriodSeconds,imageId:c.Image,platform:c.Platform,networkIsolation:record.networkIsolation,version:executionVersion===2?'clear-e5-test-runtime.2':'clear-e5-test-runtime.1',environmentId:id,image:GETH_IMAGE,clientVersion,chainId,networkId:await rpc('net_version'),genesisHash:(await rpc('eth_getBlockByNumber',['0x0',false])).hash,endpoint:record.endpoint,
    tokenAddress,tokenCodeHash:keccak256(await provider.getCode(tokenAddress)),vaultAddress,vaultCodeHash:keccak256(await provider.getCode(vaultAddress)),instanceId,policyHash:p0PolicyHash(P0_POLICY),runtimeMappingHash,operationsPolicyHash:await vault.PROFILE(),domain,typeHash:await vault.TYPE_HASH(),domainSeparator:await vault.domainSeparator(),roles,signerKeyId:keyId,signerAddress:addresses.initialSigner,controllerAddress:addresses.controller,
    deploymentTransactions:{token:token.deploymentTransaction().hash,vault:vault.deploymentTransaction().hash},checkpoint:{number:BigInt(block.number).toString(),hash:block.hash},blockHashCapability:capability,finalityPolicy:'LOCAL_DEV_INCLUSION_ONLY',production:false};
   ensure(manifest.tokenCodeHash===build.tokenCodeHash&&manifest.domainSeparator===TypedDataEncoder.hashDomain(domain),'E5_DEPLOYMENT_PIN');
   atomicPrivate(join(dir,'runtime.json'),manifest,{exclusive:true});record.setupStatus='READY';atomicPrivate(join(dir,'environment.json'),record);return {environmentId:id,manifest,manifestHash:sha(manifest)};
  }finally{provider.destroy();}
 }catch(error){record.setupStatus='FAILED';record.setupErrorCode=/^E5_[A-Z0-9_]+$/.test(error.message)?error.message:(typeof error.code==='string'?error.code:'E5_SETUP');record.cleanup=cleanupFailedSetup(record);if(record.cleanup.bridge==='REMOVED')record.networkParked=true;try{atomicPrivate(join(dir,'environment.json'),record);}catch{}throw Error('E5_ENVIRONMENT_SETUP_FAILED');}
}
export function loadRuntime(id){const {dir,record}=environmentRecord(id);const m=JSON.parse(readPrivate(join(dir,'runtime.json')));ensure(m.environmentId===id&&[0,1].includes(Object.hasOwn(m,'blockPeriodSeconds')?m.blockPeriodSeconds:0)&&(m.blockPeriodSeconds??0)===(record.blockPeriodSeconds??0),'E5_RUNTIME_OWNER');return m;}
export function stopEnvironment(id){const {record}=environmentRecord(id);checkedContainer(record);docker(['stop','--time','10',record.container]);}
export async function startEnvironment(id){const {record}=environmentRecord(id);checkedContainer(record);if(record.networkParked){docker(['network','create','--label','clear.e5.owner='+id,record.network]);docker(['network','connect',record.network,record.container]);record.networkParked=false;atomicPrivate(join(environmentRecord(id).dir,'environment.json'),record);}docker(['start',record.container]);const port=checkedContainer(record).NetworkSettings.Ports['8545/tcp']?.[0];ensure(port?.HostIp==='127.0.0.1'&&record.endpoint==='http://127.0.0.1:'+port.HostPort+'/','E5_RPC_ENDPOINT_CHANGED');await waitRpc(loopbackRpc(record.endpoint));const m=loadRuntime(id);const rpc=loopbackRpc(record.endpoint);ensure((await rpc('eth_getBlockByNumber',['0x0',false])).hash===m.genesisHash,'E5_RESTART_GENESIS');return m;}
export function environmentStatus(id){const {record}=environmentRecord(id),c=checkedContainer(record);return {environmentId:id,running:c.State.Running,imageId:c.Image,platform:c.Platform,endpoint:record.endpoint};}
export async function rewindOwnedTestChain(id,height){ensure(Number.isSafeInteger(height)&&height>=0,'E5_REWIND_HEIGHT');const {record}=environmentRecord(id);checkedContainer(record);const m=loadRuntime(id),rpc=loopbackRpc(record.endpoint),abi=new Interface(buildExecution().contract.abi),block=await rpc('eth_getBlockByNumber',['latest',false]);const encoded=await rpc('eth_call',[{to:m.vaultAddress,data:abi.encodeFunctionData('applicationIds',[])},{blockHash:block.hash,requireCanonical:true}]);ensure(abi.decodeFunctionResult('applicationIds',encoded)[0].length===0,'E5_REWIND_REQUIRES_EMPTY_TEST_ENVIRONMENT');try{const result=docker(['exec',record.container,'geth','--datadir','/state','attach','--exec',`debug.setHead("0x${height.toString(16)}")`,'/state/geth.ipc']);ensure(result.trim()==='null','E5_REWIND_CONSOLE_REJECTED');ensure(BigInt(await rpc('eth_blockNumber'))===BigInt(height),'E5_REWIND_NOT_APPLIED');}catch{throw Error('E5_TEST_REWIND_FAILED');}}
// Release only this stopped TEST environment's bridge; persistent chain/keys/container remain.
export function parkEnvironment(id){const {dir,record}=environmentRecord(id),c=checkedContainer(record);ensure(!c.State.Running,'E5_PARK_REQUIRES_STOP');if(record.networkParked)return;const net=JSON.parse(docker(['network','inspect',record.network]))[0];ensure(net.Labels?.['clear.e5.owner']===id,'E5_NETWORK_OWNER');ensure(Object.keys(net.Containers??{}).every(key=>key===c.Id),'E5_NETWORK_OTHER_MEMBER');if(c.NetworkSettings.Networks?.[record.network])docker(['network','disconnect','--force',record.network,record.container]);docker(['network','rm',record.network]);record.networkParked=true;atomicPrivate(join(dir,'environment.json'),record);}

// Cleanup is bounded and uses only the just-created record, exact image and owner labels.
// Errors are summarized, never allowed to replace the original setup failure.
function cleanupFailedSetup(record){
 const result={container:'ABSENT_OR_UNVERIFIED',bridge:'ABSENT_OR_UNVERIFIED',chainAndKeysPreserved:true};let container;
 try{container=JSON.parse(docker(['inspect',record.container],5000))[0];ensure(container.Config.Image===GETH_IMAGE&&container.Config.Labels?.['clear.e5.owner']===record.environmentId,'E5_CLEANUP_OWNER');if(container.State.Running)docker(['stop','--time','10',record.container],15000);result.container='STOPPED';}catch{container=null;}
 try{const net=JSON.parse(docker(['network','inspect',record.network],5000))[0];ensure(net.Labels?.['clear.e5.owner']===record.environmentId,'E5_CLEANUP_NETWORK_OWNER');ensure(Object.keys(net.Containers??{}).every(key=>container&&key===container.Id),'E5_CLEANUP_OTHER_MEMBER');if(container?.NetworkSettings.Networks?.[record.network])docker(['network','disconnect','--force',record.network,record.container],5000);docker(['network','rm',record.network],5000);result.bridge='REMOVED';}catch{}
 return result;
}
