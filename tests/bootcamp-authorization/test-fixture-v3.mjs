import {fixture as oldFixture,b32} from './fixture.mjs';
import {PROFILE_ID,PROFILE_COMMIT,PROFILE_HASH,DOMAIN_NAME,DOMAIN_VERSION} from '../../src/bootcamp-authorization/test-schema-v3.mjs';
import {testDeadlineRecord,testDeadlineHash} from '../../src/bootcamp-authorization/test-encoding-v3.mjs';
export {b32};
// Fictional offline seconds, IDs and addresses, never live defaults.
export function fixtureV3({route='1'}={}){
 const old=oldFixture(),domain={...old.input.domain,name:DOMAIN_NAME,version:DOMAIN_VERSION};
 const message={...old.input.message,eligibilityRoute:route,issuedAt:'2000000150',expiresAt:'2000000250',operationsPolicyHash:PROFILE_HASH,procedureId:b32('13'),firstReviewStartedAt:'2000000000',decisionPublishedAt:'2000000020',sourceValidUntilExclusive:'2000000300',revalidationCount:'0'};
 message.deadlinePolicyHash=testDeadlineHash(message);
 const logicalTarget={...old.input.logicalTarget,procedureId:'procedure-orchid'};
 const registrations=[...old.snapshot.registrations,{kind:'PROCEDURE',logicalId:logicalTarget.procedureId,opaqueId:message.procedureId}];
 const snapshot={version:'clear-bootcamp-test-unsigned-snapshot.1',provenance:'SYNTHETIC_EXAMPLE',profilePin:{profileId:PROFILE_ID,sourceCommit:PROFILE_COMMIT,profileHash:PROFILE_HASH},registrations,logicalTarget,tokenDecimals:'6',domain,message,deadlineRecord:structuredClone(testDeadlineRecord(message))};
 const state={status:'RESERVED',...Object.fromEntries(['policyHash','operationsPolicyHash','consentSetHash','deadlinePolicyHash','nonce','applicationId','procedureId','firstReviewStartedAt','decisionPublishedAt','decisionId','decisionRevision','decisionHash','runtimeMappingHash','allocationId','recipient','token','amountAtoms','authorizationEpoch','signerKeyId','revalidationCount'].map(k=>[k,message[k]])),domain:structuredClone(domain),signerActive:true,nonceAvailable:true,reservedBalanceAtoms:'100000000',currentDecision:true,currentDecisionStatus:'MET',fullAllocation:true,bothPartiesConsent:true,unresolvedValidObjection:false,unassessedSubstantiveObjection:false,newValidError:false,
 sourceWindow:{verifiedValidUntilExclusive:'2000000900',moodleObservedAt:['2000000000','2000000000','2000000000'],reclaimIssuedAt:['1999999900','1999999900'],rawAcquiredAt:'2000000000',authLeaseExpiresAt:'2000000900',rawLeaseExpiresAt:'2000000900',queryLeaseExpiresAt:'2000000900'}};
 return {snapshot,input:structuredClone({logicalTarget,domain,message}),state,now:2000000160};
}
export function rebind(f){
 f.snapshot.message.deadlinePolicyHash=testDeadlineHash(f.snapshot.message);
 f.snapshot.deadlineRecord=structuredClone(testDeadlineRecord(f.snapshot.message));
 f.input.message=structuredClone(f.snapshot.message);
 for(const k of Object.keys(f.state))if(k in f.snapshot.message)f.state[k]=f.snapshot.message[k];
 return f;
}
export function mutationsV3(){
 const f=fixtureV3(),rows=[];
 for(const field of Object.keys(f.input.domain)){
  const p=structuredClone(f.input);p.domain[field]={name:'OtherPayment',version:'4',chainId:'31339',verifyingContract:'0x'+'55'.repeat(20),salt:b32('ff')}[field];rows.push({label:'domain.'+field,input:p});
 }
 for(const [field,value] of Object.entries(f.input.message)){
  const p=structuredClone(f.input);p.message[field]=field==='eligibilityRoute'?'2':value.startsWith('0x')?(value.length===42?'0x'+'55'.repeat(20):b32('ff')):(BigInt(value)+1n).toString();rows.push({label:'message.'+field,input:p});
 }
 return rows;
}
