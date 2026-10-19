import {canonical,exactKeys,freeze,requireRule as check} from '../policy/values.mjs';
import {P0_POLICY,p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {same} from '../policy/mvp/contract.mjs';
import {id,hash,epoch,revision,guardExpiry} from './model.mjs';
import {sourceCutoff} from '../bootcamp-authorization/test-encoding-v3.mjs';

const address=v=>check(typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v)&&!/^0x0+$/.test(v),'BC_E3_ADDRESS');
const atoms=v=>check(typeof v==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(v)&&BigInt(v)<(1n<<256n),'BC_E3_ATOMS');
export const snapshotHash=v=>p0Hash('E3-SERVER-PORT',v);
export function createProcedurePorts(configuration,mode){
 check(configuration===null||configuration?.execution==='SYNTHETIC_PORT_FIXTURE'&&mode==='SYNTHETIC_FIXTURE','BC_E3_PORT_CONFIGURATION');
 // An actual E4 port needs a separate reviewed activation. No browser/body can
 // provide snapshots, provenance labels, source assertions or a verified flag.
 function read(name,context){
  if(!configuration||typeof configuration[name]!=='function')return freeze({implementation:'NOT_IMPLEMENTED',snapshotId:null});
  const value=structuredClone(configuration[name](freeze(structuredClone(context))));
  check(value?.execution==='SYNTHETIC_PORT_FIXTURE'&&!Object.hasOwn(value,'implementation'),'BC_E3_PORT_EXECUTION');return value;
 }
 function funding(a,d,acceptanceSequence){
  const v=read('funding',{applicationId:a.id,decisionId:d.decisionId,decisionRevision:d.decisionRevision,decisionHash:d.decisionHash,acceptanceSequence});
  if(v.implementation==='NOT_IMPLEMENTED')return v;
  exactKeys(v,['version','execution','snapshotId','status','applicationId','decisionId','decisionRevision','decisionHash','allocationId','obligationId',
   'recipient','token','amountAtoms','tokenDecimals','reservedAtoms','acceptanceSequence','allocationVersion','authorizationEpoch','replacement','queue'],'BC_E3_FUNDING_PORT');
  check(v.version==='clear-bootcamp-procedure-funding-port.1'&&['WAITING_FUNDS','FULLY_ALLOCATED'].includes(v.status),'BC_E3_FUNDING_PORT');
  id(v.snapshotId);id(v.obligationId);id(v.decisionId);hash(v.decisionHash);revision(v.decisionRevision);address(v.recipient);address(v.token);atoms(v.reservedAtoms);
  check(v.applicationId===a.id&&v.recipient===a.wallet&&v.amountAtoms==='100000000'&&v.tokenDecimals==='6'&&v.recipient!==v.token,'BC_E3_FUNDING_TARGET');
  for(const key of ['allocationVersion','authorizationEpoch'])check(typeof v[key]==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v[key])&&BigInt(v[key])<(1n<<64n),'BC_E3_FUNDING_PORT');
  if(v.status==='FULLY_ALLOCATED'){
   id(v.allocationId);check(Number.isSafeInteger(v.acceptanceSequence)&&v.acceptanceSequence>0&&v.reservedAtoms==='100000000','BC_E3_FUNDING_TARGET');
  }else check(v.allocationId===null&&v.reservedAtoms==='0','BC_E3_FUNDING_PORT');
  if(v.replacement!==null){const r=v.replacement;
   exactKeys(r,['version','allocationId','fromDecisionId','fromDecisionHash','fromAuthorizationEpoch','toDecisionId','toDecisionHash','toAuthorizationEpoch','fromAllocationVersion','toAllocationVersion','receiptHash'],'BC_E3_REPLACEMENT');
   check(r.version==='clear-bootcamp-allocation-replacement-receipt.1'&&r.allocationId===v.allocationId&&r.toDecisionId===v.decisionId&&r.toDecisionHash===v.decisionHash
    &&r.toAuthorizationEpoch===v.authorizationEpoch&&r.toAllocationVersion===v.allocationVersion,'BC_E3_REPLACEMENT');
   id(r.fromDecisionId);hash(r.fromDecisionHash);hash(r.receiptHash);
   for(const key of ['fromAuthorizationEpoch','toAuthorizationEpoch','fromAllocationVersion','toAllocationVersion'])check(typeof r[key]==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(r[key])&&BigInt(r[key])<(1n<<64n),'BC_E3_REPLACEMENT');
   check(BigInt(r.toAuthorizationEpoch)>BigInt(r.fromAuthorizationEpoch)&&BigInt(r.toAllocationVersion)>BigInt(r.fromAllocationVersion),'BC_E3_REPLACEMENT');
  }
  if(v.queue!==null){exactKeys(v.queue,['position','shortfallAtoms'],'BC_E3_QUEUE');check(Number.isSafeInteger(v.queue.position)&&v.queue.position>=1,'BC_E3_QUEUE');atoms(v.queue.shortfallAtoms);}
  return freeze(v);
 }
 function chain(a){
  const v=read('chain',{applicationId:a.id});if(v.implementation==='NOT_IMPLEMENTED')return v;
  exactKeys(v,['version','execution','snapshotId','applicationId','status','allocationId','decisionId','recipient','token','amountAtoms','claimState','transactionState','transactionHash','blockRef','canonical'],'BC_E3_CHAIN_PORT');
  check(v.version==='clear-bootcamp-procedure-chain-port.1'&&v.applicationId===a.id&&v.canonical===true
   &&['UNACCEPTED','ACCEPTED','TERMINATED'].includes(v.status),'BC_E3_CHAIN_PORT');id(v.snapshotId);
  check([null,'SUBMITTED','INCLUDED','FINALIZED','FAILED','REORGED','UNKNOWN'].includes(v.transactionState),'BC_E3_CHAIN_PORT');
  if(v.transactionHash!==null)hash(v.transactionHash);if(v.blockRef!==null)id(v.blockRef);
  if(v.status==='ACCEPTED'){
   id(v.allocationId);id(v.decisionId);address(v.recipient);address(v.token);
   check(v.recipient===a.wallet&&v.amountAtoms==='100000000'&&['UNCLAIMED','CLAIMED'].includes(v.claimState),'BC_E3_ACCEPTED_RIGHT');
  }else check(v.claimState===null,'BC_E3_CHAIN_PORT');return freeze(v);
 }
 function authorization(a){
  const v=read('authorization',{applicationId:a.id});check(v.implementation!=='NOT_IMPLEMENTED','BC_E3_AUTHORIZATION_PORT_BLOCKED');
  exactKeys(v,['version','execution','snapshotId','domain','signerKeyId','signerActive','authorizationEpoch','nonce','nonceAvailable','expiresAt'],'BC_E3_AUTHORIZATION_PORT');
  check(v.version==='clear-bootcamp-procedure-authorization-port.1'&&typeof v.signerActive==='boolean'&&typeof v.nonceAvailable==='boolean','BC_E3_AUTHORIZATION_PORT');
  id(v.snapshotId);hash(v.signerKeyId);hash(v.nonce);epoch(v.expiresAt);
  check(typeof v.authorizationEpoch==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v.authorizationEpoch)&&BigInt(v.authorizationEpoch)<(1n<<64n),'BC_E3_AUTHORIZATION_PORT');return freeze(v);
 }
 function registration(a,d,acceptanceSequence){
  const v=read('registration',{applicationId:a.id,decisionId:d.decisionId,decisionRevision:d.decisionRevision,decisionHash:d.decisionHash,acceptanceSequence});
  check(v.implementation!=='NOT_IMPLEMENTED','BC_E3_REGISTRATION_PORT_BLOCKED');
  exactKeys(v,['version','execution','registrationId','applicationId','decisionId','decisionRevision','decisionHash','allocationId','obligationId','recipient','token','amountAtoms','tokenDecimals','domain'],'BC_E3_REGISTRATION_PORT');
  check(v.version==='clear-bootcamp-procedure-registration-port.1'&&v.applicationId===a.id&&v.decisionId===d.decisionId&&v.decisionRevision===d.decisionRevision
   &&v.decisionHash===d.decisionHash&&v.recipient===a.wallet&&v.amountAtoms==='100000000'&&v.tokenDecimals==='6','BC_E3_REGISTRATION_TARGET');
  id(v.registrationId);id(v.allocationId);id(v.obligationId);address(v.recipient);address(v.token);
  exactKeys(v.domain,['name','version','chainId','verifyingContract','salt'],'BC_E3_REGISTRATION_DOMAIN');
  check(v.domain.name==='ClearBootcampTestPayment'&&v.domain.version==='3'&&typeof v.domain.chainId==='string'&&/^[1-9][0-9]{0,77}$/.test(v.domain.chainId)
   &&BigInt(v.domain.chainId)<(1n<<256n),'BC_E3_REGISTRATION_DOMAIN');address(v.domain.verifyingContract);hash(v.domain.salt);
  check(!/^0x0+$/.test(v.domain.salt)&&v.recipient!==v.token&&v.recipient!==v.domain.verifyingContract,'BC_E3_REGISTRATION_DOMAIN');return freeze(v);
 }
 function assessment(name,context){
  const v=read(name,context);check(v.implementation!=='NOT_IMPLEMENTED','BC_E3_ASSESSMENT_BLOCKED');
  check(v.version==='clear-bootcamp-procedure-assessment.1'&&v.applicationId===context.applicationId&&v.assessmentId===context.assessmentId,'BC_E3_ASSESSMENT');
  id(v.assessmentId);hash(v.receiptHash);check(Array.isArray(v.basisEvidenceIds)&&v.basisEvidenceIds.length>0&&v.basisEvidenceIds.length<=4,'BC_E3_ASSESSMENT');
  v.basisEvidenceIds.forEach(id);return freeze(v);
 }
 return {funding,chain,authorization,registration,assessment};
}
export function currentSourceWindow(a,heads,source,time,{allowExpired=false}={}){
 const hs=heads(a);check(a.status==='ACTIVE'&&hs.length===4,'BC_E3_CURRENT_MET_REQUIRED');
 const guards=P0_POLICY.criteria.map(c=>{
  const h=hs.find(h=>h.criterion_id===c.criterionId);check(h?.valid&&h.evidence.condition==='MET','BC_E3_CURRENT_MET_REQUIRED');
  const g=source(a,c.criterionId,time);check(g&&same(g,h.guard)&&time<guardExpiry(g),'BC_E3_SOURCE_STALE');return g;
 });
 const moodle=P0_POLICY.criteria.slice(0,3).map(c=>hs.find(h=>h.criterion_id===c.criterionId).evidence.acquiredAt);
 const hr=hs.find(h=>h.criterion_id==='python-basic-certificate').evidence;
 const minimum=key=>Math.min(...guards.map(g=>g[key]));
 const window={moodleObservedAt:moodle.map(String),reclaimIssuedAt:[hr.facts.accountProofIssuedAt,hr.facts.certificateProofIssuedAt].map(String),
  authLeaseExpiresAt:String(minimum('authExpiresAt')),rawLeaseExpiresAt:String(minimum('rawExpiresAt')),queryLeaseExpiresAt:String(minimum('queryExpiresAt')),
  rawAcquiredAt:String(Math.min(...hs.map(h=>h.evidence.acquiredAt))),verifiedValidUntilExclusive:String(Math.min(...hs.map(h=>Math.min(h.valid_until,h.evidence.rawLocator.expiresAt))))};
 const end=Number(sourceCutoff(window,BigInt(time)));check(allowExpired||time<end,'BC_E3_SOURCE_EXPIRED');
 return freeze({window,validUntilExclusive:end,commitment:p0Hash('E3-CURRENT-SOURCE',{evidence:hs.map(h=>[h.evidence.evidenceId,h.evidence.sourceHash]),guards})});
}
export const sameSnapshot=(a,b)=>canonical(a)===canonical(b);
