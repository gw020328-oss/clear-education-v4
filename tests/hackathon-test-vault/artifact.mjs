import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {keccak256} from 'ethers';
import {buildPreparation} from './build.mjs';
export function preparationArtifact(){
 const sources=['contracts/ClearTestToken.sol','src/hackathon-test-vault/HackathonTestVaultPreparation.sol','src/hackathon-test-vault/StrictECDSA.sol','src/hackathon-test-vault/reader.mjs'];
 const builds=buildPreparation(),vault=builds.HackathonTestVaultPreparation;
 return {version:'clear-hackathon-test-vault-preparation-artifact.1',stage:'E4_NON_PAYOUT_COMPONENTS_E3_INTAKE_PENDING',consumerPinsCommit:'67c7bc8450484fb4d5545c6e36a672e497467174',e2Commit:'d9407b06b8a13122a489193119c1899929f83fe4',compiler:{solc:'0.8.30',optimizer:{enabled:true,runs:200},evmVersion:'shanghai'},
  contract:'HackathonTestVaultPreparation',abi:vault.abi,creationBytes:(vault.bytecode.length-2)/2,runtimeTemplateBytes:(vault.runtime.length-2)/2,runtimeTemplateHash:keccak256(vault.runtime),runtimeTemplateIsDeployedCodePin:false,
  fixedToken:{contract:'ClearTestToken',decimals:6,amountAtoms:'100000000',runtimeCodeHash:keccak256(builds.ClearTestToken.runtime)},
  sourceSha256:Object.fromEntries(sources.map(path=>[path,createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex')])),
  supported:['REGISTER_CURRENT_MET','FULL_RESERVATION','REVIEW_STATE','UNSIGNED_PREPARATION','ATOMIC_UNACCEPTED_TERMINATION','CANONICAL_REPLACEMENT_OBSERVATION'],
  unavailable:['PAYOUT_ACTIVATION','ACCEPT','CLAIM','WITHDRAW','UPGRADE','PRODUCTION','REAL_SOURCE_AUTHENTICATION','FINALIZED_PUBLIC_CHAIN_READER'],authorizationSignatures:0,payoutEnabled:false};
}
if(process.argv.includes('--write'))writeFileSync(new URL('../../docs/hackathon-test-vault/preparation-artifact.json',import.meta.url),JSON.stringify(preparationArtifact(),null,2)+'\n');
