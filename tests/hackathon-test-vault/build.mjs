import {readFileSync} from 'node:fs';
import solc from 'solc';
export function buildPreparation(){
 const names=['contracts/ClearTestToken.sol','src/hackathon-test-vault/HackathonTestVaultPreparation.sol','src/hackathon-test-vault/StrictECDSA.sol','tests/hackathon-test-vault/PrimitiveProbe.sol'];
 const sources=Object.fromEntries(names.map(name=>[name,{content:readFileSync(new URL('../../'+name,import.meta.url),'utf8')}]));
 const result=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}})));
 if(result.errors?.some(e=>e.severity==='error'))throw new Error(result.errors.filter(e=>e.severity==='error').map(e=>e.formattedMessage).join('\n'));
 return Object.fromEntries(Object.values(result.contracts).flatMap(file=>Object.entries(file)).map(([name,c])=>[name,{abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,runtime:'0x'+c.evm.deployedBytecode.object}]));
}
