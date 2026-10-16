// Public compiled program only. No proof, witness, source input or SRS download.
import {Barretenberg} from '@aztec/bb.js';
import {gunzipSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parserProgram} from './parser-circuit.mjs';
const p=await parserProgram({cache:true}),api=await Barretenberg.new({threads:1});
try{
 const [gates,subgroupSize]=await api.acirGetCircuitSizes(gunzipSync(Buffer.from(p.bytecode,'base64')),false,false);
 const result={scope:'PRIVATE_PARSER_COMPONENT_COST_ONLY',programSha256:createHash('sha256').update(Buffer.from(p.bytecode,'base64')).digest('hex'),
  gates,subgroupSize,cachedSrsCapacity:262144,fitsExistingSrs:subgroupSize<=262144,proofGenerated:false,officialSignatureIntegrated:false,productionReady:false};
 await writeFile(new URL('../artifacts/v2/cost.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch{
 const result={scope:'PRIVATE_PARSER_COMPONENT_COST_ONLY',programSha256:createHash('sha256').update(Buffer.from(p.bytecode,'base64')).digest('hex'),
  status:'BLOCKED',code:'BACKEND_GATE_COUNT_FAILED',gates:null,proofGenerated:false,officialSignatureIntegrated:false,productionReady:false};
 await writeFile(new URL('../artifacts/v2/cost.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exitCode=1;
}finally{await api.destroy();}
