// One exact original v2 reproduction with allocator diagnostics, no proof/SRS.
import {Barretenberg} from '@aztec/bb.js';
import {gunzipSync} from 'node:zlib';
import {mkdir,writeFile} from 'node:fs/promises';
import {parserProgram} from '../parser-circuit.mjs';
import {checkBytes,pins,base} from './native.mjs';
const program=await parserProgram({cache:true});
await mkdir(base,{recursive:true});
checkBytes(Buffer.from(program.bytecode,'base64'),pins.program);
let allocationFailure=false;const diagnostics=[];
const api=await Barretenberg.new({threads:1,logger:s=>{
 const line=String(s);if(/bad_alloc/.test(line))allocationFailure=true;
 if(/memory:|bad_alloc|libc\+\+abi|aborted/.test(line))diagnostics.push(line.slice(0,500));
}});
const start=performance.now();let status='UNEXPECTED_SUCCESS';
try{await api.acirGetCircuitSizes(gunzipSync(Buffer.from(program.bytecode,'base64')),false,false);}
catch{status=allocationFailure?'WASM_BAD_ALLOC':'WASM_FAILURE_NOT_CLASSIFIED';}
finally{await api.destroy();}
const result={scope:'PUBLIC_PROGRAM_SIZE_ONLY',programSha256:pins.program,status,diagnostics,elapsedMs:Math.round(performance.now()-start),proofGenerated:false};
await writeFile(base+'/wasm-repro.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
