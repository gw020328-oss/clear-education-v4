// Deliberate public-source compiler reproducer. No private inputs are accepted.
import {compile,createFileManager} from '@noir-lang/noir_wasm';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const capacity=Number(process.argv[2]);if(![64,1024,2048].includes(capacity))throw Error('USE_CAPACITY_64_1024_OR_2048');
const root=new URL('../artifacts/v2/',import.meta.url);await mkdir(root,{recursive:true});
const work=await mkdtemp(fileURLToPath(new URL('wasm-repro-',root)));
const original=await readFile(new URL('./compiler-repro/original.nr',import.meta.url),'utf8');
const source=original.replace('global N:u32=2048;','global N:u32='+capacity+';');
const start=performance.now();
try{
 await mkdir(work+'/src');await writeFile(work+'/src/main.nr',source);
 await writeFile(work+'/Nargo.toml','[package]\nname="parser_repro"\ntype="bin"\nauthors=[]\n[dependencies]\n');
 await compile(createFileManager(work));
 console.log(JSON.stringify({scope:'COMPILER_ONLY_NO_WITNESS',capacity,compiled:true,elapsedMs:Math.round(performance.now()-start),sourceSha256:createHash('sha256').update(source).digest('hex')}));
}catch(e){console.log(JSON.stringify({scope:'COMPILER_ONLY_NO_WITNESS',capacity,compiled:false,errorKind:e instanceof WebAssembly.RuntimeError?'WASM_RUNTIME_ERROR':'COMPILER_ERROR',elapsedMs:Math.round(performance.now()-start)}));process.exitCode=1;}
finally{await rm(work,{recursive:true,force:true});}
