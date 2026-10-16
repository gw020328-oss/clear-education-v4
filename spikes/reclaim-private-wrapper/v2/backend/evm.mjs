// New in-memory chain; no RPC, user wallet or product contract.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,hexlify} from 'ethers';
import {base,digest,checkVerificationInputs,pins} from './native.mjs';
const {work,report}=JSON.parse(await readFile(base+'/latest-run.json'));
assert.equal(report.programBytecodeSha256,pins.program);
const source=await readFile(work+'/Verifier.sol','utf8');assert.equal(digest(source),report.soliditySha256);
const proof=await readFile(work+'/proofs/proof'),vk=await readFile(work+'/proofs/vk');
const canonical=checkVerificationInputs(proof,vk);assert.equal(digest(proof),report.proofSha256);assert.equal(digest(source),pins.solidity);
const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Verifier.sol':{content:source}},
 settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode','evm.deployedBytecode']}}}})));
assert.equal((compiled.errors??[]).filter(x=>x.severity==='error').length,0,JSON.stringify(compiled.errors));
const chain=ganache.provider({logging:{quiet:true},chain:{chainId:431799,hardfork:'shanghai'},wallet:{totalAccounts:1},miner:{blockGasLimit:30000000}});
try{
 const provider=new BrowserProvider(chain),signer=await provider.getSigner(),c=compiled.contracts['Verifier.sol'].UltraVerifier;
 const verifier=await new ContractFactory(c.abi,c.evm.bytecode.object,signer).deploy();await verifier.waitForDeployment();
 assert.equal(await verifier.verify(hexlify(proof),[]),true);
 const gas=await verifier.verify.estimateGas(hexlify(proof),[]);
 const bad=Buffer.from(proof);bad[0]^=1;await assert.rejects(verifier.verify(hexlify(bad),[]));
 await assert.rejects(verifier.verify(hexlify(proof.subarray(0,-1)),[]));
 await assert.rejects(verifier.verify(hexlify(proof),['0x'+'00'.repeat(32)]));
 const result={scope:'FRESH_LOCAL_IN_MEMORY_EVM_PRIVATE_PARSER_COMPONENT',chainId:431799,solc:solc.version(),
  validProof:true,tamperedProofRejected:true,truncatedProofRejected:true,unexpectedPublicInputRejected:true,
  publicInputCount:0,verificationGas:gas.toString(),verifierRuntimeBytes:c.evm.deployedBytecode.object.length/2,
  soliditySha256:digest(source),vkSha256:digest(canonical),programBytecodeSha256:pins.program,
  officialSignatureIntegrated:false,realYbm:false,publicChainExecuted:false,independentClaim:'NO_GO',paymentAllowed:false};
 await writeFile(work+'/evm-report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await chain.disconnect();}
