import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {cpus,totalmem} from 'node:os';
import {Noir} from '@noir-lang/noir_js';
import {UltraPlonkBackend} from '@aztec/bb.js';
import {build} from './build-circuit.mjs';
import {signedFixture,verifyFixture,witnessFor} from './model.mjs';
import {checkCrs} from './prepare-crs.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const out=new URL('./artifacts/',import.meta.url),crsPath=fileURLToPath(new URL('./artifacts/crs/',import.meta.url));
await mkdir(out,{recursive:true});
await checkCrs(); // Explicit separate download step. No implicit unpinned setup.
const start=performance.now(),program=await build({check:true}),compileMs=performance.now()-start;
const claim=await signedFixture();await verifyFixture(claim);
const noir=new Noir(program),ws=performance.now(),{witness}=await noir.execute(witnessFor(claim)),witnessMs=performance.now()-ws;
console.log('WITNESS_VALID; starting local blinded UltraPlonk proof with pinned cached CRS.');
// UltraPlonk here is intentional: this pinned older UltraHonk API is not a ZK flavor.
const backend=new UltraPlonkBackend(program.bytecode,{threads:1,crsPath});
try {
  const ps=performance.now(),proof=await backend.generateProof(witness),proveMs=performance.now()-ps;
  const vs=performance.now();assert.equal(await backend.verifyProof(proof),true);const verifyMs=performance.now()-vs;
  console.log('REAL_LOCAL_PROOF_VERIFIED');
  const changed=structuredClone(proof);changed.proof[0]^=1;
  let tamperedRejected=false;try{tamperedRejected=!await backend.verifyProof(changed);}catch{tamperedRejected=true;}assert(tamperedRejected);
  const pi=structuredClone(proof);pi.publicInputs[0]='0x'+('00'.repeat(31))+'ff';
  assert.equal(await backend.verifyProof(pi),false);
  const vk=await backend.getVerificationKey(),solidity=await backend.getSolidityVerifier();
  await writeFile(new URL('proof.json',out),JSON.stringify({proof:Array.from(proof.proof),publicInputs:proof.publicInputs}));
  await writeFile(new URL('Verifier.sol',out),solidity);
  await writeFile(new URL('program.json',out),JSON.stringify(program));
  const report={scope:'PUBLIC_SYNTHETIC_SIGNATURE_REAL_LOCAL_ZK',backend:'UltraPlonk 0.82.2',noir:'1.0.0-beta.3',
    compileMs:Math.round(compileMs),witnessMs:Math.round(witnessMs),proveMs:Math.round(proveMs),verifyMs:Math.round(verifyMs),
    proofBytes:proof.proof.length,publicInputCount:proof.publicInputs.length,publicInputBytes:proof.publicInputs.length*32,
    maxRssKiB:process.resourceUsage().maxRSS,hardware:{arch:process.arch,logicalCpuCount:cpus().length,memoryBytes:totalmem()},
    verified:true,tamperedProofRejected:true,changedPublicInputRejected:true,
    programBytecodeSha256:hash(Buffer.from(program.bytecode,'base64')),verifyingKeySha256:hash(vk),soliditySha256:hash(solidity),
    crsG1Sha256:hash(await readFile(crsPath+'/bn254_g1.dat')),crsG2Sha256:hash(await readFile(crsPath+'/bn254_g2.dat')),
    officialAttestorProof:false,realYbm:false,sourceNullifier:'BLOCKED',independentClaim:'NO_GO',paymentAllowed:false};
  await writeFile(new URL('proof-report.json',out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await backend.destroy();}
