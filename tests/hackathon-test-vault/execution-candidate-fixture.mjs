import {readFileSync} from 'node:fs';
import {TypedDataEncoder} from 'ethers';
import {hashTestUnsignedPayload} from '../../src/bootcamp-authorization/test-encoding-v3.mjs';
import {REQUIRED_INTAKE} from '../../src/hackathon-test-vault/execution-signer.mjs';
// Pure fictional object fixture. No VM/provider/wallet, registry writer, RPC or DB.
export const h=n=>'0x'+n.toString(16).padStart(64,'0');
export const addr=n=>'0x'+n.toString(16).padStart(40,'0');
export function candidate(){
 const e3=JSON.parse(readFileSync(new URL('../../docs/bootcamp-procedure/synthetic-intake-example.json',import.meta.url),'utf8'));
 const target=e3.target,registration=e3.bootstrap,consentScope=e3.consentScope;
 const m=target.payload.message,domain=target.payload.domain,now=Number(m.issuedAt);
 const roles=Object.fromEntries(['registrar','initialSigner','keyAdmin','relayer','depositor','terminator'].map((r,i)=>[r,addr(i+10)]));
 const runtime={chainId:domain.chainId,genesisHash:h(30),vaultAddress:domain.verifyingContract,vaultCodeHash:h(31),tokenAddress:m.token,tokenCodeHash:h(32),instanceId:domain.salt,
  policyHash:m.policyHash,runtimeMappingHash:m.runtimeMappingHash,operationsPolicyHash:m.operationsPolicyHash,domainSeparator:TypedDataEncoder.hashDomain(domain),
  typeHash:'0x0420a07c2295bca1fc66f0033f2afa0c6e430c7d7cccb48fa23a98c84d97fa8f',roles,signerKeyId:m.signerKeyId,signerAddress:roles.initialSigner};
 const application={...Object.fromEntries(['applicationId','recipient','allocationId','decisionId','decisionRevision','decisionHash','procedureId','firstReviewStartedAt','decisionPublishedAt','sourceValidUntilExclusive','revalidationCount','authorizationEpoch','consentSetHash'].map(k=>[k,m[k]])),
  version:'5',state:'REVIEW',currentMet:true,validObjection:false,unassessedObjection:false,newValidError:false,terminalError:false,
  acceptanceSequence:String(registration.record.decisionAcceptanceSequence),sourceReceiptHash:target.sourceCurrentCommitment,
  reservationAtoms:'100000000',obligationAtoms:'100000000',preparedDigest:hashTestUnsignedPayload({domain,message:m}).digest,preparedNonce:m.nonce,deadlinePolicyHash:m.deadlinePolicyHash,
  mutualConsent:true,allocatedAt:m.decisionPublishedAt,targetRecordedAt:m.decisionPublishedAt,observedAt:m.issuedAt};
 const chain={version:'clear-hackathon-test-execution-observation.1',provenance:'SYNTHETIC_COMPILE_FIXTURE',runtime,
  checkpoint:{blockNumber:'42',blockHash:h(33),canonical:true,observedAt:now},application,signer:{keyId:m.signerKeyId,address:roles.initialSigner,active:true},nonce:{value:m.nonce,available:true},
  accounting:{balance:'150000000',reserved:'100000000',obligations:'200000000',actualTokenBalance:'150000000'},newOperationsPaused:false};
 const cas=v=>({expectedRevision:v.applicationRevision,expectedLedgerSequence:v.ledgerSequence,expectedSnapshotHash:v.currentSnapshotHash});
 return {target,registration,consentScope,chain,runtimePin:{version:'clear-hackathon-test-execution-runtime.1',provenance:'SYNTHETIC_COMPILE_FIXTURE',...structuredClone(runtime)},
  expected:{prepared:cas(target),registration:cas(registration),chain:{blockNumber:'42',blockHash:h(33),applicationVersion:'5'}},intake:structuredClone(REQUIRED_INTAKE),now};
}
