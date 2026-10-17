import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,AbiCoder,keccak256,getBytes,hexlify,toBeHex,zeroPadValue} from 'ethers';
import {REGISTRATION,NOW,registrationDigest} from './model.mjs';
import {build} from './build-circuit.mjs';
const out=new URL('./artifacts/',import.meta.url);
const source=await readFile(new URL('Verifier.sol',out),'utf8');
const harness=await readFile(new URL('PinnedPredicateHarness.sol',import.meta.url),'utf8');
const p=JSON.parse(await readFile(new URL('proof.json',out),'utf8'));
const proofReport=JSON.parse(await readFile(new URL('proof-report.json',out),'utf8'));
const currentProgram=await build({check:true});
assert.equal(proofReport.programBytecodeSha256,createHash('sha256').update(Buffer.from(currentProgram.bytecode,'base64')).digest('hex'),'STALE_PROOF_PROGRAM');
assert.equal(proofReport.soliditySha256,createHash('sha256').update(source).digest('hex'),'STALE_SOLIDITY');
const expected=[...getBytes(registrationDigest(REGISTRATION)),...getBytes(REGISTRATION.owner),
  REGISTRATION.threshold,REGISTRATION.periodFrom,REGISTRATION.periodUntil,NOW].map(x=>zeroPadValue(toBeHex(x),32));
assert.deepEqual(p.publicInputs,expected); // independent verifier-owned input derivation, not arbitrary proof inputs
const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Verifier.sol':{content:source},'Harness.sol':{content:harness}},
  settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode','evm.deployedBytecode']}}}})));
assert.equal((compiled.errors??[]).filter(x=>x.severity==='error').length,0,JSON.stringify(compiled.errors));
const chain=ganache.provider({logging:{quiet:true},chain:{chainId:431798,hardfork:'shanghai'},wallet:{totalAccounts:2},miner:{blockGasLimit:30000000}});
try{
  const provider=new BrowserProvider(chain),signer=await provider.getSigner();
  async function deploy(file,name,args=[]){const c=compiled.contracts[file][name];const deployed=await new ContractFactory(c.abi,c.evm.bytecode.object,signer).deploy(...args);await deployed.waitForDeployment();return deployed;}
  const verifier=await deploy('Verifier.sol','UltraVerifier');
  const wrapper=await deploy('Harness.sol','PinnedPredicateHarness',[await verifier.getAddress(),keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32[]'],[expected]))]);
  const proof=hexlify(Uint8Array.from(p.proof));
  assert.equal(await wrapper.verify(proof,expected),true);
  const gas=await wrapper.verify.estimateGas(proof,expected);
  const bad=Uint8Array.from(p.proof);bad[0]^=1;await assert.rejects(wrapper.verify(hexlify(bad),expected));
  for(const idx of [0,32,52,53,54,55]){const changed=[...expected];changed[idx]=zeroPadValue(toBeHex(BigInt(changed[idx])+1n),32);await assert.rejects(wrapper.verify(proof,changed));}
  await assert.rejects(wrapper.verify(proof,expected.slice(1)));
  // Generic verifier alone cannot define authority. Constructor pins generated program + expected registry record.
  const alternative=[...expected];alternative[52]=zeroPadValue(toBeHex(500),32);
  await assert.rejects(wrapper.verify(proof,alternative));
  await chain.request({method:'evm_setAccountCode',params:[await verifier.getAddress(),'0x60006000f3']});
  await assert.rejects(wrapper.verify(proof,expected));
  const deployedBytes=compiled.contracts['Verifier.sol'].UltraVerifier.evm.deployedBytecode.object.length/2;
  const report={scope:'FRESH_IN_MEMORY_EVM_NO_PUBLIC_RPC',chainId:431798,hardfork:'shanghai',solc:solc.version(),
    validProof:true,tamperedProofRejected:true,registrationPolicyOwnerTimeSubstitutionsRejected:true,truncatedInputsRejected:true,
    verifierCodeReplacementRejected:true,verifierRuntimeBytes:deployedBytes,verificationGas:gas.toString(),
    soliditySha256:createHash('sha256').update(source).digest('hex'),
    amoyDeployed:false,amoyCompatibility:'NOT_RUN',sourceNullifier:'BLOCKED',paymentAllowed:false};
  await writeFile(new URL('evm-report.json',out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await chain.disconnect();}
