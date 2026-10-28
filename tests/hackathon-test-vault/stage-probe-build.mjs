import solc from 'solc';
import {readFileSync} from 'node:fs';
let cached;
export function buildStageProbe(){
 if(cached)return cached;
 if(!solc.version().startsWith('0.8.30+'))throw Error('COMPILER_PIN');
 const name='StageClaimBoundaryProbe.sol',content=readFileSync(new URL(name,import.meta.url),'utf8');
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{[name]:{content}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
 if(output.errors?.some(e=>e.severity==='error'))throw Error('STAGE_PROBE_COMPILE_FAILED');
 return cached=output.contracts[name].StageClaimBoundaryProbe;
}
