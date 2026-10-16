import {program,witness,out} from './program.mjs';
import {Noir} from '@noir-lang/noir_js';import {Barretenberg} from '@aztec/bb.js';
import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {parserWitness} from '../parser-circuit.mjs';
const variant=process.argv[2]??'compact';
const start=performance.now(),p=await program({variant}),compiled=performance.now();
await new Noir(p).execute(variant==='field'?parserWitness():witness());const executed=performance.now();
const packed=Buffer.from(p.bytecode,'base64'),acir=gunzipSync(packed);
const api=await Barretenberg.new({threads:1,logger:s=>console.error(s)});
try{
 const [gates,subgroupSize]=await api.acirGetCircuitSizes(acir,false,false);
 const report={scope:'PRIVATE_PARSER_VARIANT_COMPONENT',variant,compiledMs:Math.round(compiled-start),witnessMs:Math.round(executed-compiled),
  compressedBytes:packed.length,acirBytes:acir.length,gates,subgroupSize,programSha256:createHash('sha256').update(packed).digest('hex'),
  sourceSigned:false,proofGenerated:false,productionReady:false};
 await writeFile(new URL(variant+'-measurement.json',out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await api.destroy();}
