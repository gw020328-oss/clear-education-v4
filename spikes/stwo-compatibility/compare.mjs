import '../../tests/ybm-collector/network-guard.mjs';
import {createCipheriv,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const expected={'5.1.6':'b9e99ceca550fee65829424a9efcae26785fa03407ed90f71ef4da39e6d0167d','5.1.7':'8c4baf48a68956a87ccd6e7f737cbf549a2cdc722b80776068d9ee33f9347df1'};
if(process.argv.length!==4)throw Error('TWO_VERIFIED_PACKAGE_DIRECTORIES_REQUIRED');
const runtimes={};
for(const [i,version] of Object.keys(expected).entries()){
 const base=resolve(process.argv[i+2]);
 const pkg=JSON.parse(await readFile(resolve(base,'package.json'),'utf8'));
 if(pkg.name!=='@reclaimprotocol/zk-symmetric-crypto'||pkg.version!==version)throw Error('PACKAGE_VERSION_MISMATCH');
 const wasm=await readFile(resolve(base,'lib/stwo/s2circuits_bg.wasm'));
 if(createHash('sha256').update(wasm).digest('hex')!==expected[version])throw Error('WASM_FINGERPRINT_MISMATCH');
 runtimes[version]=await import(pathToFileURL(resolve(base,'lib/stwo/s2circuits-wrapper.js')).href);
}
const cases=[];
for(const algorithm of ['aes-128-ctr','aes-256-ctr','chacha20']){
 const key=Buffer.alloc(algorithm==='aes-128-ctr'?16:32,1),nonce=Buffer.alloc(12,2),counter=2;
 const ctr=Buffer.alloc(4);algorithm==='chacha20'?ctr.writeUInt32LE(counter):ctr.writeUInt32BE(counter);
 const iv=algorithm==='chacha20'?Buffer.concat([ctr,nonce]):Buffer.concat([nonce,ctr]);
 const plaintext=Buffer.alloc(algorithm==='chacha20'?128:80,3),cipher=createCipheriv(algorithm,key,iv);
 const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
 const generate=algorithm==='chacha20'?'generate_chacha20_proof':algorithm==='aes-128-ctr'?'generate_aes128_ctr_proof':'generate_aes256_ctr_proof';
 const verify=algorithm==='chacha20'?'verify_chacha20_proof':'verify_aes_ctr_proof';
 for(const [from,runtime] of Object.entries(runtimes)){
  const result=JSON.parse(runtime[generate](key,nonce,counter,plaintext,ciphertext));
  if(typeof result.proof!=='string')throw Error('SYNTHETIC_GENERATION_FAILED');
  for(const [to,target] of Object.entries(runtimes)){
   let valid=false,errorPresent=false;
   try{const checked=JSON.parse(target[verify](result.proof,nonce,counter,plaintext,ciphertext));valid=checked.valid===true;errorPresent=typeof checked.error==='string';}catch{errorPresent=true;}
   cases.push({algorithm,generator:from,verifier:to,valid,errorPresent,proofBytes:Buffer.from(result.proof,'base64').length});
  }
 }
}
console.log(JSON.stringify({scope:'PUBLIC_SYNTHETIC_OFFLINE',cases},null,2));
if(cases.some(c=>c.valid!==(c.generator===c.verifier)))process.exitCode=1;
