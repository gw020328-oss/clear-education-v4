// Public metadata only: no wallet, proof material or transaction method.
import { Interface, keccak256, toUtf8Bytes } from 'ethers';
import { writeFile } from 'node:fs/promises';
const rpcUrl='https://polygon-amoy.drpc.org';
const address='0xcd94A4f7F85dFF1523269C52D0Ab6b85e9B22866';
const iface=new Interface(['function currentEpoch() view returns(uint32)','function fetchEpoch(uint32) view returns(tuple(uint32 id,uint32 timestampStart,uint32 timestampEnd,tuple(address addr,string host)[] witnesses,uint8 minimumWitnessesForClaimCreation))']);
const report={scope:'PUBLIC_READ_ONLY',checkedAt:new Date().toISOString(),rpcUrl,address,chainId:80002,checks:[],freshOfficialProofCompatibility:'NOT_RUN',liveClaimAllowed:false};
async function rpc(method,params){
 if(!['eth_chainId','eth_blockNumber','eth_getCode','eth_getStorageAt','eth_call'].includes(method))throw Error('METHOD_BLOCKED');
 const response=await fetch(rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('RPC_UNAVAILABLE');const body=await response.json();if(body.error||typeof body.result!=='string')throw Error('RPC_RESPONSE');return body.result;
}
try{
 if(BigInt(await rpc('eth_chainId',[]))!==80002n)throw Error('CHAIN_MISMATCH');
 const block='0x'+(BigInt(await rpc('eth_blockNumber',[]))-32n).toString(16);report.block=Number(BigInt(block));
 const code=await rpc('eth_getCode',[address,block]);if(code==='0x')throw Error('NO_CODE');report.proxyCodeHash=keccak256(code);
 const slot='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
 const implementation=await rpc('eth_getStorageAt',[address,slot,block]);
 report.eip1967Implementation='0x'+implementation.slice(-40);
 if(BigInt(implementation)!==0n)report.implementationCodeHash=keccak256(await rpc('eth_getCode',[report.eip1967Implementation,block]));
 const [epoch]=iface.decodeFunctionResult('currentEpoch',await rpc('eth_call',[{to:address,data:iface.encodeFunctionData('currentEpoch')},block]));
 const [details]=iface.decodeFunctionResult('fetchEpoch',await rpc('eth_call',[{to:address,data:iface.encodeFunctionData('fetchEpoch',[epoch])},block]));
 report.epoch={id:Number(epoch),timestampStart:Number(details.timestampStart),timestampEnd:Number(details.timestampEnd),minimumWitnesses:Number(details.minimumWitnessesForClaimCreation),witnesses:details.witnesses.map(w=>w.addr.toLowerCase())};
 report.checks.push({id:'deployed-code-and-epoch-read',status:'PASS'});
 try{
  const url='https://sourcify.dev/server/v2/contract/80002/'+report.eip1967Implementation+'?fields=abi,sources,runtimeBytecode';
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('SOURCE_UNAVAILABLE');const source=await response.json();
  const matched=source.runtimeMatch==='exact_match'&&keccak256(source.runtimeBytecode.onchainBytecode)===report.implementationCodeHash;
  report.verifiedSource={url,runtimeMatch:source.runtimeMatch,matchesObservedCode:matched,verifyProofOutputs:source.abi.find(a=>a.name==='verifyProof')?.outputs.map(a=>a.type),verifyProofMutability:source.abi.find(a=>a.name==='verifyProof')?.stateMutability,reclaimSourceKeccak256:keccak256(toUtf8Bytes(source.sources['contracts/Reclaim.sol'].content))};
  report.checks.push({id:'verified-source-matches-observed-code',status:matched?'PASS':'FAIL'});
 }catch{report.checks.push({id:'verified-source-matches-observed-code',status:'NOT_RUN',reason:'PUBLIC_SOURCE_UNAVAILABLE'});}
 try{
  const response=await fetch('https://api.reclaimprotocol.org/api/attestors',{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw Error('REGISTRY_UNAVAILABLE');const body=await response.json();
  const registry=body.data?.map(w=>w.address?.toLowerCase());if(!registry?.length||!registry.every(a=>/^0x[0-9a-f]{40}$/.test(a)))throw Error('REGISTRY_SCHEMA');
  report.registryWitnesses=registry;report.epochWitnessesInRegistry=report.epoch.witnesses.every(a=>registry.includes(a));
  report.checks.push({id:'epoch-witness-registry-overlap',status:report.epochWitnessesInRegistry?'PASS':'FAIL'});
 }catch{report.checks.push({id:'epoch-witness-registry-overlap',status:'NOT_RUN',reason:'PUBLIC_REGISTRY_UNAVAILABLE'});}
}catch{report.checks.push({id:'deployed-code-and-epoch-read',status:'NOT_RUN',reason:'PUBLIC_RPC_OR_ABI_UNAVAILABLE'});}
report.notes=['Metadata overlap does not validate any actual proof, source policy, epoch semantics or ABI return behavior.','Block/code fingerprints are observations, not an approved release manifest.'];
await writeFile(new URL('verifier-readonly-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
