// Read-only compilation/ABI inspection. No provider, wallet, key, signature or EVM execution.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Interface} from 'ethers';
import {buildVault} from '../../src/vault/build.mjs';
import {buildLab} from '../../spikes/funding-lab/build.mjs';
const root=new URL('../../',import.meta.url);
export function inspectSources(){
 const paths=['contracts/CourseRefundVaultV4.sol','contracts/ClearTestToken.sol','spikes/funding-lab/FundingLab.sol','src/vault/encoding.mjs','src/vault/reader.mjs','spikes/funding-lab/reader.mjs','specs/bootcamp/p0-policy.json','specs/bootcamp/p0-contract.mjs','specs/bootcamp/p0-addendum-r2.json','specs/bootcamp/r2-reference.mjs','tests/product-workflow/bootcamp-r2-existing-relayer.test.mjs'];
 const artifacts={CourseRefundVaultV4:buildVault().CourseRefundVaultV4,FundingLab:buildLab().FundingLab};
 return {scope:'READ_ONLY_EXISTING_SOURCE_COMPILATION_AND_ABI_NO_EVM',reviewBase:'318f296ca424c7bbe4cf1321b9ceea555c8936c0',p0:'03fa64324ef9cc2ce4fb442a612329a7b1285677',r2:'69d6dc80caaf2bde963385e176068e3a0293e6b3',
  sourceSha256:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(new URL(p,root))).digest('hex')])),
  contracts:Object.fromEntries(Object.entries(artifacts).map(([name,a])=>{
   const iface=new Interface(a.abi);
   return [name,{runtimeCodeHash:a.codeHash,functions:a.abi.filter(x=>x.type==='function').map(x=>{const fragment=iface.getFunction(x.name);return {name:x.name,signature:fragment.format('sighash'),selector:fragment.selector,stateMutability:x.stateMutability,inputs:x.inputs};}).sort((a,b)=>a.name.localeCompare(b.name))}];
  }))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.stdout.write(JSON.stringify(inspectSources(),null,2)+'\n');
