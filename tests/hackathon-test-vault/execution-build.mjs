import {readFileSync} from 'node:fs';
import solc from 'solc';
import {keccak256} from 'ethers';
export const EXECUTION_SOURCES=['contracts/ClearTestToken.sol','src/hackathon-test-vault/StrictECDSA.sol','src/hackathon-test-vault/HackathonTestVaultExecution.sol'];
export const EXECUTION_COMPILER=Object.freeze({solc:'0.8.30',optimizer:{enabled:true,runs:200},evmVersion:'shanghai'});
let cached;
// Compilation only. No EVM/provider/signer is imported or constructed here.
export function buildExecution(){
 if(cached)return cached;
 if(!solc.version().startsWith(EXECUTION_COMPILER.solc+'+'))throw new Error('COMPILER_PIN');
 const sources=Object.fromEntries(EXECUTION_SOURCES.map(name=>[name,{content:readFileSync(new URL('../../'+name,import.meta.url),'utf8')}]));
 const {solc:version,...settings}=EXECUTION_COMPILER;
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{...settings,outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences'],'':['ast']}}}})));
 const errors=output.errors?.filter(e=>e.severity==='error')??[];
 if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
 const contract=output.contracts[EXECUTION_SOURCES[2]].HackathonTestVaultExecution;
 const creationBytes=contract.evm.bytecode.object.length/2,runtimeBytes=contract.evm.deployedBytecode.object.length/2;
 // Ten ABI words: asset/instance/policy/mapping and the six fixed role addresses.
 const constructorArgumentBytes=320;
 if(runtimeBytes>24576)throw new Error('EIP170_RUNTIME_LIMIT');
 if(creationBytes+constructorArgumentBytes>49152)throw new Error('EIP3860_INITCODE_LIMIT');
 cached={contract,creationBytes,runtimeBytes,constructorArgumentBytes,immutableReferences:contract.evm.deployedBytecode.immutableReferences,
  runtimeTemplateHash:keccak256('0x'+contract.evm.deployedBytecode.object),tokenCodeHash:keccak256('0x'+output.contracts[EXECUTION_SOURCES[0]].ClearTestToken.evm.deployedBytecode.object),
  ast:output.sources[EXECUTION_SOURCES[2]].ast,warnings:(output.errors??[]).filter(e=>e.severity!=='error').map(e=>({code:e.errorCode,message:e.message}))};
 return cached;
}
