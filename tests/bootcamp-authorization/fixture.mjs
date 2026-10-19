// Invented opaque IDs/addresses and explicit fictional times, never live defaults.
import {p0PolicyHash,P0_POLICY} from '../../specs/bootcamp/p0-contract.mjs';
export const b32=n=>'0x'+n.repeat(32);
export function fixture({route='1',deadline=true}={}){
 const domain={name:'ClearBootcampPayment',version:'2',chainId:'31338',verifyingContract:'0x'+'33'.repeat(20),salt:b32('10')};
 const message={applicationId:b32('01'),policyHash:p0PolicyHash(P0_POLICY),runtimeMappingHash:b32('02'),decisionId:b32('03'),decisionRevision:'1',decisionHash:b32('04'),recipient:'0x'+'11'.repeat(20),token:'0x'+'22'.repeat(20),amountAtoms:'100000000',allocationId:b32('05'),consentSetHash:b32('06'),deadlinePolicyHash:b32('07'),eligibilityRoute:route,nonce:b32('08'),issuedAt:'2000000100',expiresAt:'2000000160',signerKeyId:b32('09'),authorizationEpoch:'1'};
 const logicalTarget={applicationId:'application-orchid',decisionId:'decision-orchid',allocationId:'allocation-orchid'};
 const registrations=Object.entries(logicalTarget).map(([field,logicalId])=>({kind:{applicationId:'APPLICATION',decisionId:'DECISION',allocationId:'ALLOCATION'}[field],logicalId,opaqueId:message[field]}));
 const deadlineRecord=deadline?{version:'clear-bootcamp-unsigned-deadline-record.1',provenance:'SYNTHETIC_EXAMPLE',recordId:b32('12'),...Object.fromEntries(['applicationId','decisionId','decisionRevision','decisionHash','allocationId','deadlinePolicyHash'].map(k=>[k,message[k]])),eligibleAfter:'2000000050',authorizeUntil:'2000000300',claimUntil:'2000000500',maximumAuthorizationTtlSeconds:'75'}:null;
 const snapshot={version:'clear-bootcamp-unsigned-server-snapshot.1',provenance:'SYNTHETIC_EXAMPLE',registryVersion:'synthetic-registry.1',registrations,logicalTarget,tokenDecimals:'6',domain,message,deadlineRecord};
 return {snapshot,input:structuredClone({logicalTarget,domain,message})};
}
export function mutations(){
 const f=fixture(),rows=[];
 for(const field of Object.keys(f.input.domain)){
  const p=structuredClone(f.input);
  p.domain[field]={name:'OtherPayment',version:'3',chainId:'31339',verifyingContract:'0x'+'55'.repeat(20),salt:b32('ff')}[field];rows.push({label:'domain.'+field,input:p});
 }
 for(const [field,value] of Object.entries(f.input.message)){
  const p=structuredClone(f.input);
  p.message[field]=field==='eligibilityRoute'?'2':value.startsWith('0x')?(value.length===42?'0x'+'55'.repeat(20):b32('ff')):(BigInt(value)+1n).toString();
  rows.push({label:'message.'+field,input:p});
 }
 return rows;
}
