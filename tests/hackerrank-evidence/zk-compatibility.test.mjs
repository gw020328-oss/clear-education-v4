import '../ybm-collector/network-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const quiet={trace(){},debug(){},info(){},warn(){},error(){},child(){return this;}};
async function installed(prefix){
 const require=createRequire(new URL(`../../src/${prefix}/package.json`,import.meta.url));
 const tls=await import(require.resolve('@reclaimprotocol/tls'));
 const {webcryptoCrypto}=await import(require.resolve('@reclaimprotocol/tls/webcrypto'));
 tls.setCryptoImplementation(webcryptoCrypto);
 return {tls,sdk:await import(require.resolve('@reclaimprotocol/attestor-core'))};
}
const generator=await installed('hackerrank-evidence');
const verifier=await installed('ybm-collector');

test('both installed proof paths match reviewed SDK, TLS, STWO loader and WASM fingerprints',async()=>{
 const fingerprints=JSON.parse(await readFile(new URL('../../docs/current/BOOTCAMP_ZK_EXECUTION_FINGERPRINTS_V1.json',import.meta.url),'utf8'));
 for(const prefix of fingerprints.prefixes){
 const require=createRequire(new URL(`../../src/${prefix}/package.json`,import.meta.url));
 const sdkRequire=createRequire(require.resolve('@reclaimprotocol/attestor-core'));
 assert.equal(sdkRequire.resolve('@reclaimprotocol/zk-symmetric-crypto'),require.resolve('@reclaimprotocol/zk-symmetric-crypto'));
 for(const [name,entry] of Object.entries(fingerprints.packages)){
  const base=new URL(`../../src/${prefix}/node_modules/${name}/`,import.meta.url);
  assert.equal(JSON.parse(await readFile(new URL('package.json',base),'utf8')).version,entry.version);
  for(const [file,expected] of Object.entries(entry.files)){
   const actual=createHash('sha256').update(await readFile(new URL(file,base))).digest('hex');
   assert.equal(actual,expected,`${prefix}/${name}/${file}`);
  }
 }
 }
});

for(const cipherSuite of [
 'TLS_AES_128_GCM_SHA256','TLS_AES_256_GCM_SHA384','TLS_CHACHA20_POLY1305_SHA256',
 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256','TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
 'TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256',
])test(`official STWO packet roundtrip: ${cipherSuite}`,async()=>{
 const {tls,sdk}=generator;
 const {cipher,ivLength}=tls.SUPPORTED_CIPHER_SUITE_MAP[cipherSuite];
 const algorithm=sdk.getZkAlgorithmForCipherSuite(cipherSuite);
 const chunk=algorithm==='chacha20'?128:80;
 const version=sdk.isTls13Suite(cipherSuite)?'TLS1_3':'TLS1_2';
 const fixedIv=new Uint8Array(ivLength).fill(2);
 const encKey=await tls.crypto.importKey(cipher,new Uint8Array(algorithm==='aes-128-ctr'?16:32).fill(1));
 const recordNumber=65537;
 const plaintext=Uint8Array.from({length:chunk*2+7},(_,i)=>65+i%26);
 if(version==='TLS1_3')plaintext[plaintext.length-1]=23;
 const {ciphertext,iv}=await tls.encryptWrappedRecord(plaintext,{key:encKey,iv:fixedIv,recordNumber,cipherSuite,version,recordHeaderOpts:{type:'WRAPPED_RECORD',version:'TLS1_2'}});
 const ciphertextBefore=Uint8Array.from(ciphertext);
 const packet={type:'ciphertext',encKey,fixedIv,iv,recordNumber,ciphertext,plaintext,data:tls.packPacket({type:'WRAPPED_RECORD',version:'TLS1_2',data:ciphertext})};
 const redactedPlaintext=Uint8Array.from(plaintext);
 redactedPlaintext.fill(42,3,19);redactedPlaintext.fill(42,chunk,chunk*2);
 const transcript=await sdk.preparePacketsForReveal([{sender:'server',message:packet}],new Map([[packet,{type:'zk',redactedPlaintext}]]),{cipherSuite,zkEngine:'stwo',zkProofConcurrency:1,logger:quiet});
 assert.ok(ciphertext.every((x,i)=>x===ciphertextBefore[i]),'generation must preserve encrypted transcript');
 const req=sdk.proto.ClaimTunnelRequest.create({zkEngine:sdk.getEngineProto('stwo'),transcript});
 const encoded=sdk.proto.ClaimTunnelRequest.encode(req).finish();
 const decoded=verifier.sdk.proto.ClaimTunnelRequest.decode(encoded);
 assert.equal(decoded.zkEngine,2);assert.equal(verifier.sdk.getEngineString(decoded.zkEngine),'stwo');
 const zkReveal=decoded.transcript[0].reveal.zkReveal;
 assert.deepEqual(zkReveal.proofs.map(p=>p.startIdx),[0,chunk*2]);
 for(const [i,proof] of zkReveal.proofs.entries()){
  assert.equal(proof.decryptedRedactedCiphertext.length,chunk);
  assert.ok(proof.proofData.length>0&&4*Math.ceil(proof.proofData.length/3)<=8*1024*1024,'individual proof fits official WASM base64 cap');
  assert.ok(proof.proofData.every((x,j)=>x===transcript[0].reveal.zkReveal.proofs[i].proofData[j]),'protobuf preserves binary proof');
 }
 const args={cipherSuite,ciphertext:decoded.transcript[0].message.slice(5),zkReveal,iv:fixedIv,recordNumber,zkEngine:'stwo',logger:quiet};
 const result=await verifier.sdk.verifyZkPacket(args);
 assert.equal(result.redactedPlaintext.length,redactedPlaintext.length);
 assert.ok(result.redactedPlaintext.every((x,i)=>x===redactedPlaintext[i]));
 const changedIv=Uint8Array.from(fixedIv);changedIv[0]^=1;
 await assert.rejects(verifier.sdk.verifyZkPacket({...args,iv:changedIv}),/invalid proof/);
 const changedCiphertext=Uint8Array.from(args.ciphertext);changedCiphertext[12-ivLength]^=1;
 await assert.rejects(verifier.sdk.verifyZkPacket({...args,ciphertext:changedCiphertext}),/invalid proof/);
 const changedProof=verifier.sdk.proto.ClaimTunnelRequest.decode(encoded).transcript[0].reveal.zkReveal;
 changedProof.proofs[0].proofData[0]^=1;
 await assert.rejects(verifier.sdk.verifyZkPacket({...args,zkReveal:changedProof}),/invalid proof/);
 const changedPlaintext=verifier.sdk.proto.ClaimTunnelRequest.decode(encoded).transcript[0].reveal.zkReveal;
 changedPlaintext.proofs[0].decryptedRedactedCiphertext[3]^=1;
 await assert.rejects(verifier.sdk.verifyZkPacket({...args,zkReveal:changedPlaintext}),/invalid proof/);
 const changedOffset=verifier.sdk.proto.ClaimTunnelRequest.decode(encoded).transcript[0].reveal.zkReveal;
 changedOffset.proofs[0].startIdx=chunk;
 await assert.rejects(verifier.sdk.verifyZkPacket({...args,zkReveal:changedOffset}));
 // TLS 1.2 AES carries an explicit record IV. TLS 1.3 and ChaCha derive it
 // from the record number, which must therefore be bound to the proof.
 if(ivLength===12)await assert.rejects(verifier.sdk.verifyZkPacket({...args,recordNumber:recordNumber+1}),/invalid proof/);
});
