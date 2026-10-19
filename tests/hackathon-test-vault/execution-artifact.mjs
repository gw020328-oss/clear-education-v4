import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildExecution,EXECUTION_SOURCES,EXECUTION_COMPILER} from './execution-build.mjs';
import {REQUIRED_INTAKE,EXECUTION_STAGE} from '../../src/hackathon-test-vault/execution-signer.mjs';
export function executionArtifact(){
 const b=buildExecution();const paths=[...EXECUTION_SOURCES,'src/hackathon-test-vault/execution-signer.mjs'];
 return {version:'clear-hackathon-test-vault-execution-compile-artifact.1',stage:EXECUTION_STAGE,contract:'HackathonTestVaultExecution',compiler:EXECUTION_COMPILER,intake:REQUIRED_INTAKE,
  abi:b.contract.abi,creationBytes:b.creationBytes,constructorArgumentBytes:b.constructorArgumentBytes,initcodeBytes:b.creationBytes+b.constructorArgumentBytes,runtimeTemplateBytes:b.runtimeBytes,
  limits:{runtimeBytes:24576,initcodeBytes:49152,unlimitedContractSize:false},runtimeTemplateHash:b.runtimeTemplateHash,runtimeTemplateIsDeployedCodePin:false,immutableReferences:b.immutableReferences,
  fixedToken:{contract:'ClearTestToken',amountAtoms:'100000000',decimals:6,runtimeCodeHash:b.tokenCodeHash},
  sourceSha256:Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex')])),
  compilationWarnings:b.warnings,implementedInSource:['REGISTER_RESERVE_REVIEW_PREPARE','EXACT_DIGEST_STRICT_ECDSA_FIRST_ACCEPT','ATOMIC_SINGLE_NONCE_ACCEPTED_RIGHT','ANYCALLER_FIXED_RECIPIENT_SINGLE_CLAIM','CONDITIONED_UNACCEPTED_TERMINATE'],
  operationalSignerImplemented:false,signerAdapterState:'HARD_BLOCKED_NO_KEY_PROVIDER_ACCESS',e5CanonicalCheckpointAdapterImplemented:false,
  executionContractDeployments:0,authorizationSignatures:0,validSignerPositiveControls:0,accepts:0,claims:0,persistentChains:0,externalRpc:0,actualSources:0,
  runtimePin:null,productionEnabled:false,positiveExecutionAuthorized:false};
}
if(process.argv.includes('--write'))writeFileSync(new URL('../../docs/hackathon-test-vault/execution-artifact.json',import.meta.url),JSON.stringify(executionArtifact(),null,2)+'\n');
