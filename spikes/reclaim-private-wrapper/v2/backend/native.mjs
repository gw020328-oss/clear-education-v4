// Public synthetic research only. No caller-provided witness/claim/input path.
import {readFile,writeFile,mkdir,mkdtemp,symlink,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {Noir} from '@noir-lang/noir_js';
import {parserProgram,parserWitness} from '../parser-circuit.mjs';

const exec=promisify(execFile);
export const digest=b=>createHash('sha256').update(b).digest('hex');
export const base=resolve(fileURLToPath(new URL('../../artifacts/native-v2/',import.meta.url)));
const binary=fileURLToPath(new URL('../../../../.toolchain/wrapper-v2-bb/bb',import.meta.url));
export const pins={
 binary:'512c6d8f6f36ba877368f5503dcfffa6e218520ff25c90923638f9155cb90a0a',
 archive:'7b73c9caae4468aabcb005f52bc02bdc6d91420b8fbfd8d48643c6225fb7e5ee',
 archiveBytes:10955252,
 program:'d14d2b988911d67b9a7275053c98375831b603fe956864a115f679a2c77b740d',
 source:'675e82018c97c7c5ba8acd9cb31caa6c10bae86d445cc08628be5822a6d40605',
 vk:'38797e984dda5db1bf889ad71e434635c73a0cd542a2ce0536858b82c6a0efb3',
 solidity:'3776cc5effb967fb531796789c86ff7553d83c24b3dcc5e2e6ee7cd50f17cbd9',
 crs:[
  ['bn254_g1.dat','g1.dat',134217792,'ea6069e3563ad79f186d1c0088499309cbdaeb54254346760ffec7fe15ae49cd'],
  ['bn254_g2.dat','g2.dat',128,'01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f'],
 ],
};
export function checkBytes(bytes,hash,length){
 if((length!==undefined&&bytes.length!==length)||digest(bytes)!==hash)throw Error('PUBLIC_ARTIFACT_PIN_MISMATCH');
}
export function minimalEnv(){return {PATH:'/usr/bin:/bin',HARDWARE_CONCURRENCY:'2'};}
export function canonicalKey(vk){
 // Exact v0.82.2 nonrecursive key layout: final fields are bool, 16*u32, bool.
 // Native leaves unused accumulator indices nondeterministic. Never normalize
 // an active accumulator/recursive key; the entire remaining key stays pinned.
 if(vk.length!==1779||vk[1713]!==0||vk[1778]!==0)throw Error('VK_LAYOUT_OR_RECURSION');
 const canonical=Buffer.from(vk);canonical.fill(0,1714,1778);return canonical;
}
export function checkVerificationInputs(proof,vk){
 if(proof.length!==2144)throw Error('PROOF_LENGTH');
 const canonical=canonicalKey(vk);checkBytes(canonical,pins.vk,1779);return canonical;
}
export function sandboxProfile(work){
 // OLD_API get_bytecode builds a double-quoted shell command internally.
 if(!work.startsWith('/')||/["\\$`\n\r\0]/.test(work))throw Error('SANDBOX_PATH');
 if(resolve(work)!==work)throw Error('SANDBOX_PATH_NOT_NORMALIZED');
 return `(version 1)(allow default)(deny network*)(deny file-write*)(allow file-write* (subpath "${work}") (literal "/dev/null"))`;
}
export async function checkSetup(){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('NATIVE_RESEARCH_PLATFORM');
 checkBytes(await readFile(binary),pins.binary);
 for(const [name,,length,hash] of pins.crs)checkBytes(await readFile(base+'/.bb-crs/'+name),hash,length);
}
// Separate explicit PUBLIC download command. Prove/verify never download.
export async function prepare(){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('NATIVE_RESEARCH_PLATFORM');
 const dir=fileURLToPath(new URL('../../../../.toolchain/wrapper-v2-bb/',import.meta.url));
 await mkdir(dir,{recursive:true});await mkdir(base+'/.bb-crs',{recursive:true});
 async function download(url,hash,length,range=false){
  const r=await fetch(url,{headers:range?{Range:`bytes=0-${length-1}`}:{},credentials:'omit',signal:AbortSignal.timeout(120000)});
  if(!r.ok)throw Error('PUBLIC_DOWNLOAD_FAILED');const bytes=Buffer.from(await r.arrayBuffer());checkBytes(bytes,hash,length);return bytes;
 }
 const bytes=await download('https://github.com/AztecProtocol/aztec-packages/releases/download/v0.82.2/barretenberg-arm64-darwin.tar.gz',pins.archive,pins.archiveBytes);
 await writeFile(dir+'/bb.tar.gz',bytes);
 await exec('/usr/bin/tar',['-xzf',dir+'/bb.tar.gz','-C',dir,'bb'],{timeout:30000});
 for(const [name,path,length,hash] of pins.crs){
  await writeFile(base+'/.bb-crs/'+name,await download('https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/flat/'+path,hash,length,true));
 }
 await checkSetup();
}
// The pinned OLD_API ignores -c and reads getenv(HOME), falling back to cwd.
// Omit HOME rather than redefining it. Network denial prevents implicit curl.
export async function runNative(work,args,{timeoutMs=600000,maxRssKiB=9*1024*1024}={}){
 const start=performance.now();let peakRssKiB=0,stopReason=null,output='';
 const child=spawn('/usr/bin/sandbox-exec',['-p',sandboxProfile(work),binary,'OLD_API',...args],{cwd:work,env:minimalEnv(),stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{if(output.length<16384)output+=b.toString().slice(0,16384-output.length);});
 const stop=reason=>{stopReason??=reason;child.kill('SIGKILL');};
 const timer=setTimeout(()=>stop('TIME_LIMIT'),timeoutMs);
 let polling=false;
 const monitor=setInterval(async()=>{
  if(polling||!child.pid)return;polling=true;
  try{const {stdout}=await exec('/bin/ps',['-o','rss=','-p',String(child.pid)],{timeout:2000});
   const rss=Number(stdout.trim());if(Number.isFinite(rss)){peakRssKiB=Math.max(peakRssKiB,rss);if(rss>maxRssKiB)stop('RSS_LIMIT');}
  }catch{}finally{polling=false;}
 },250);
 try{
  const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(exitCode,signal)=>resolve({exitCode,signal}));});
  return {...result,elapsedMs:Math.round(performance.now()-start),peakRssKiB,stopReason,output};
 }finally{clearTimeout(timer);clearInterval(monitor);}
}
export async function prove(){
 await checkSetup();
 checkBytes(await readFile(new URL('../circuit/src/main.nr',import.meta.url)),pins.source);
 const program=await parserProgram({cache:true});checkBytes(Buffer.from(program.bytecode,'base64'),pins.program);
 assert.equal(program.abi.parameters.filter(p=>p.visibility==='public').length,0);
 const work=await mkdtemp(base+'/run-');
 await symlink(base+'/.bb-crs',work+'/.bb-crs','dir');
 await mkdir(work+'/target');await mkdir(work+'/proofs');
 // Fail before expensive proving if the exact OS output boundary is unusable.
 await exec('/usr/bin/sandbox-exec',['-p',sandboxProfile(work),'/usr/bin/touch',work+'/proofs/.write-probe'],{cwd:work,env:minimalEnv(),timeout:10000});
 await rm(work+'/proofs/.write-probe');
 await writeFile(work+'/program.json',JSON.stringify(program));
 const {witness}=await new Noir(program).execute(parserWitness());
 // This older command has no -w option. Its fixed file is SYNTHETIC ONLY.
 await writeFile(work+'/target/witness.gz',witness);
 let generation;
 try{generation=await runNative(work,['prove_output_all','-b',work+'/program.json','-o',work+'/proofs']);}
 finally{await rm(work+'/target/witness.gz',{force:true});}
 await writeFile(work+'/generation.json',JSON.stringify(generation,null,2)+'\n');
 assert.equal(generation.exitCode,0,'NATIVE_GENERATION_FAILED');assert.equal(generation.stopReason,null);
 return finish(work,generation);
}
export async function finish(work,generation){
 checkBytes(Buffer.from(JSON.parse(await readFile(work+'/program.json')).bytecode,'base64'),pins.program);
 assert.equal(generation.exitCode,0);assert.equal(generation.stopReason,null);
 const verification=await validate(work);
 const report={schemaVersion:1,scope:'PUBLIC_SYNTHETIC_PRIVATE_PARSER_COMPONENT',backend:'UltraPlonk 0.82.2 OLD_API',
  sourceSha256:pins.source,programBytecodeSha256:pins.program,generation,verification,
  proofBytes:(await readFile(work+'/proofs/proof')).length,publicInputCount:0,
  proofSha256:digest(await readFile(work+'/proofs/proof')),vkSha256:digest(await readFile(work+'/proofs/vk-pinned')),
  rawVkSha256:digest(await readFile(work+'/proofs/vk')),
  soliditySha256:digest(await readFile(work+'/Verifier.sol')),
  osNetworkDenied:true,childWritesRestrictedToRunDirectory:true,syntheticWitnessFileRemoved:true,
  realYbm:false,officialSignatureIntegrated:false,policyIntegrated:false,independentClaim:'NO_GO',paymentAllowed:false};
 await writeFile(work+'/report.json',JSON.stringify(report,null,2)+'\n');
 await writeFile(base+'/latest-run.json',JSON.stringify({work,report},null,2)+'\n');
 console.log(JSON.stringify({work,...report}));return {work,report};
}
export async function validate(work){
 await checkSetup();
 const proof=await readFile(work+'/proofs/proof'),vk=await readFile(work+'/proofs/vk');
 const canonical=checkVerificationInputs(proof,vk);await writeFile(work+'/proofs/vk-pinned',canonical);
 const verify=async(p,k)=>runNative(work,['verify','-p',p,'-k',k],{timeoutMs:30000});
 const valid=await verify(work+'/proofs/proof',work+'/proofs/vk-pinned');assert.equal(valid.exitCode,0);assert.equal(valid.stopReason,null);
 const mutations=[['proof-first',proof.map((x,i)=>i===0?x^1:x),canonical],['proof-last',proof.map((x,i)=>i===proof.length-1?x^1:x),canonical]];
 const rejected=[];
 for(const [name,p,k] of mutations){
  await writeFile(work+'/bad-proof',p);await writeFile(work+'/bad-vk',k);
  const result=await verify(work+'/bad-proof',work+'/bad-vk');
  // Crashes/timeouts are not a successful negative verification.
  assert.equal(result.exitCode,1,name);assert.equal(result.stopReason,null,name);assert.equal(result.signal,null,name);rejected.push(name);
 }
 assert.throws(()=>checkVerificationInputs(proof.subarray(0,-1),vk),/PROOF_LENGTH/);
 assert.throws(()=>checkVerificationInputs(Buffer.concat([proof,Buffer.from([0])]),vk),/PROOF_LENGTH/);
 assert.throws(()=>checkVerificationInputs(proof,vk.map((x,i)=>i===100?x^1:x)),/PIN_MISMATCH/);
 const contract=await runNative(work,['contract','-k',work+'/proofs/vk-pinned','-o',work+'/Verifier.sol'],{timeoutMs:30000});
 assert.equal(contract.exitCode,0);assert.equal(contract.stopReason,null);
 checkBytes(await readFile(work+'/Verifier.sol'),pins.solidity);
 return {nativeValidProof:true,rejected,preflightRejected:['proof-truncated','proof-extended','changed-key'],
  rawTruncatedNativeVerification:'ABORT_OBSERVED_NOT_COUNTED_AS_SUCCESS',verifyMs:valid.elapsedMs,publicInputSubstitution:'NOT_APPLICABLE_ZERO_PUBLIC_INPUTS'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const command=process.argv[2];
 if(command==='prepare'){await prepare();console.log('PUBLIC_NATIVE_BACKEND_AND_CRS_PINNED');}
 else if(command==='prove')await prove();else throw Error('USE_PREPARE_OR_PROVE');
}
