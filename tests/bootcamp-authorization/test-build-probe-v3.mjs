import {readFileSync} from 'node:fs';
import solc from 'solc';
export function buildProbe(){
 const source=readFileSync(new URL('../../src/bootcamp-authorization/TestUnsignedHashProbeV3.sol',import.meta.url),'utf8');
 const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'TestUnsignedHashProbeV3.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
 if(out.errors?.some(e=>e.severity==='error'))throw new Error('UNSIGNED_PROBE_COMPILE_FAILED');
 const c=out.contracts['TestUnsignedHashProbeV3.sol'].TestUnsignedHashProbeV3;return {abi:c.abi,bytecode:'0x'+c.evm.bytecode.object};
}
