import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createCipheriv} from 'node:crypto';
const require=createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url));
test('installed STWO runtime proves synthetic AES and rejects changed public plaintext offline',async()=>{
 const {makeStwoZkOperator}=await import(require.resolve('@reclaimprotocol/zk-symmetric-crypto/stwo'));
 const op=makeStwoZkOperator({algorithm:'aes-128-ctr'}),key=Buffer.alloc(16,1),nonce=Buffer.alloc(12,2),counter=2;
 const iv=Buffer.concat([nonce,Buffer.from([0,0,0,counter])]),plaintext=Buffer.alloc(16,3),cipher=createCipheriv('aes-128-ctr',key,iv);
 const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
 const input={key,in:ciphertext,out:plaintext,noncesAndCounters:[{nonce,counter}]};
 const witness=await op.generateWitness(input),{proof}=await op.groth16Prove(witness);
 assert.ok(proof.length>0);assert.equal(await op.groth16Verify(input,proof),true);
 const changed={...input,out:Buffer.alloc(16,4)};assert.equal(await op.groth16Verify(changed,proof),false);
});
