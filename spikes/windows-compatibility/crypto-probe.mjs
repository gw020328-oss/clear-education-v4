import './network-guard.mjs';
import {createRequire} from 'node:module';
import {createCipheriv} from 'node:crypto';
import {writeFile, readFile, readdir} from 'node:fs/promises';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
const require = createRequire(new URL('../../src/ybm-collector/package.json', import.meta.url));
export async function cryptoProbe() {
  const checks=[];
  const record=(id,status,code)=>checks.push({id,status,...(code?{code}:{})});
  record('pinned-node',process.versions.node==='24.21.0'?'PASS':'FAIL');
  const entry=require.resolve('@reclaimprotocol/zk-symmetric-crypto/stwo');
  const base=dirname(dirname(dirname(entry)));
  const pkg=JSON.parse(await readFile(join(base,'package.json'),'utf8'));
  record('locked-zk-package',pkg.version==='5.1.7'?'PASS':'FAIL');
  const {makeStwoZkOperator}=await import(pathToFileURL(entry).href);
  for(const algorithm of ['aes-128-ctr','aes-256-ctr','chacha20']) {
    const op=makeStwoZkOperator({algorithm});
    try {
      const key=Buffer.alloc(algorithm==='aes-128-ctr'?16:32,1),nonce=Buffer.alloc(12,2),counter=2;
      const ctr=Buffer.alloc(4);algorithm==='chacha20'?ctr.writeUInt32LE(counter):ctr.writeUInt32BE(counter);
      const iv=algorithm==='chacha20'?Buffer.concat([ctr,nonce]):Buffer.concat([nonce,ctr]);
      const plaintext=Buffer.alloc(algorithm==='chacha20'?64:16,3),cipher=createCipheriv(algorithm,key,iv);
      const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
      const input={key,in:ciphertext,out:plaintext,noncesAndCounters:[{nonce,counter}]};
      const witness=await op.generateWitness(input),{proof}=await op.groth16Prove(witness);
      record(`${algorithm}-prove-verify`,proof.length>0&&await op.groth16Verify(input,proof)?'PASS':'FAIL');
      for(const field of ['plaintext','ciphertext','nonce','counter']) {
        const changed={...input,...(field==='plaintext'?{out:Buffer.alloc(plaintext.length,4)}:{}),...(field==='ciphertext'?{in:Buffer.alloc(ciphertext.length,4)}:{}),...(field==='nonce'?{noncesAndCounters:[{nonce:Buffer.alloc(12,4),counter}]}:{}),...(field==='counter'?{noncesAndCounters:[{nonce,counter:counter+1}]}:{})};
        record(`${algorithm}-reject-${field}`,await op.groth16Verify(changed,proof)===false?'PASS':'FAIL');
      }
      const corrupt=Uint8Array.from(proof);corrupt[Math.floor(corrupt.length/2)]^=1;
      let rejected=false;try{rejected=await op.groth16Verify(input,corrupt)===false;}catch{rejected=true;}
      record(`${algorithm}-reject-corrupt-proof`,rejected?'PASS':'FAIL');
    } catch { record(`${algorithm}-execution`,'FAIL','SYNTHETIC_ENGINE_FAILURE'); }
    finally { op.release(); }
  }
  const binaries=await readdir(join(base,'bin','gnark')).catch(()=>[]);
  record('gnark-windows-native-binary',['prove','verify'].every(x=>binaries.includes(`win32-x86_64-lib${x}.so`))?'NOT_RUN':'BLOCKED','SEPARATE_OPRF_GATE');
  return {schemaVersion:1,scope:'SYNTHETIC_ONLY',platform:process.platform,arch:process.arch,node:process.versions.node,zkPackage:pkg.version,checks,realYbm:false,windowsCryptoSuccess:process.platform==='win32'&&checks.filter(x=>x.id!=='gnark-windows-native-binary').every(x=>x.status==='PASS')};
}
if (process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  try {
    const result=await cryptoProbe();
    if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    else console.log(JSON.stringify(result,null,2));
    if(result.checks.some(x=>x.status==='FAIL'))process.exitCode=1;
  } catch {console.error('CRYPTO_PROBE_FAILED');process.exitCode=1;}
}
