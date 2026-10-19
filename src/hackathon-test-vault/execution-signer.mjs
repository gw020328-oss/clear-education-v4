import {TypedDataEncoder} from 'ethers';
import {canonical,exactKeys,freeze} from '../policy/values.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {createTestDraftInspector,hashTestUnsignedPayload} from '../bootcamp-authorization/test-encoding-v3.mjs';
import {PROFILE_HASH} from '../bootcamp-authorization/test-schema-v3.mjs';

export const EXECUTION_STAGE='COMPILE_ONLY_E3_FINAL_INTAKE_PENDING';
export const REQUIRED_INTAKE=freeze({
 e1:'6b4b0cf2d847937aebc6da69f9e7df62e926fa50',e2:'d9407b06b8a13122a489193119c1899929f83fe4',
 e3Source:'fb9e6d3a9f35c8d12b80f0c84e01d8a6db9aeda1',e3FinalAcceptance:null,
 preparation:'d287b3789a678a1e6984b583e4c85859e9e97a22',
});
const BLOCKERS=freeze(['E3_FINAL_EXACT_HEAD_ACCEPTANCE_REQUIRED','EXECUTION_RUNTIME_NOT_DEPLOYED_OR_PINNED','E5_AUTHENTICATED_CURRENT_CHECKPOINT_AND_CHAIN_CAS_REQUIRED','SIGNER_ACTIVATION_NOT_AUTHORIZED']);
const blocked=(extra={})=>freeze({status:'BLOCKED',stage:EXECUTION_STAGE,code:'EXECUTION_INTAKE_PENDING',paymentAuthority:false,signerActivated:false,keyProviderAccessed:false,signature:null,blockers:BLOCKERS,...extra});
class CandidateError extends Error {constructor(code){super(code);this.code=code;}}
const check=(ok,code)=>{if(!ok)throw new CandidateError(code);};
const keys=(value,list,code)=>{try{exactKeys(value,list,code);}catch{throw new CandidateError(code);}};
const same=(a,b)=>canonical(a)===canonical(b);
const b32=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x)&&!/^0x0+$/.test(x);
const address=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&!/^0x0+$/.test(x);
const uint=(x,bits=64)=>typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x)&&BigInt(x)<(1n<<BigInt(bits));
const safe=x=>Number.isSafeInteger(x)&&x>0;
const ROLES=['registrar','initialSigner','keyAdmin','relayer','depositor','terminator'];
const RUNTIME_FIELDS=['chainId','genesisHash','vaultAddress','vaultCodeHash','tokenAddress','tokenCodeHash','instanceId','policyHash','runtimeMappingHash','operationsPolicyHash','domainSeparator','typeHash','roles','signerKeyId','signerAddress'];
const SCOPE_FIELDS=['version','operationsPolicyHash','applicationId','procedureId','decisionId','allocationId','policyHash','runtimeMappingHash','decisionRevision','decisionHash','recipient','token','amountAtoms','allocationVersion','firstReviewStartedAt','reviewCapAt','decisionPublishedAt','confirmAt'];
function verifyRuntime(pin,observed,payload){
 keys(pin,['version','provenance',...RUNTIME_FIELDS],'RUNTIME_PIN_SHAPE');
 check(pin.version==='clear-hackathon-test-execution-runtime.1'&&pin.provenance==='SYNTHETIC_COMPILE_FIXTURE','RUNTIME_STAGE');
 check(uint(pin.chainId,256)&&pin.chainId!=='0','CHAIN_ID');
 for(const k of ['genesisHash','vaultCodeHash','tokenCodeHash','instanceId','policyHash','runtimeMappingHash','operationsPolicyHash','domainSeparator','typeHash','signerKeyId'])check(b32(pin[k]),'RUNTIME_HASH');
 check(address(pin.vaultAddress)&&address(pin.tokenAddress)&&pin.vaultAddress!==pin.tokenAddress,'RUNTIME_ADDRESS');
 check(address(pin.signerAddress),'SIGNER_ADDRESS_PIN');
 keys(pin.roles,ROLES,'RUNTIME_ROLES');const roles=Object.values(pin.roles);
 check(roles.every(v=>address(v)&&v!==pin.vaultAddress&&v!==pin.tokenAddress)&&new Set(roles).size===6,'ROLE_SEPARATION');
 keys(observed,RUNTIME_FIELDS,'OBSERVED_RUNTIME_SHAPE');
 for(const k of RUNTIME_FIELDS)check(same(observed[k],pin[k]),'RUNTIME_PIN_MISMATCH');
 check(same(payload.domain,{name:'ClearBootcampTestPayment',version:'3',chainId:pin.chainId,verifyingContract:pin.vaultAddress,salt:pin.instanceId}),'RUNTIME_DOMAIN');
 const m=payload.message;
 check(m.token===pin.tokenAddress&&m.policyHash===pin.policyHash&&m.runtimeMappingHash===pin.runtimeMappingHash&&m.operationsPolicyHash===PROFILE_HASH&&pin.operationsPolicyHash===PROFILE_HASH,'RUNTIME_TARGET');
 check(pin.typeHash==='0x0420a07c2295bca1fc66f0033f2afa0c6e430c7d7cccb48fa23a98c84d97fa8f'&&pin.domainSeparator===TypedDataEncoder.hashDomain(payload.domain),'RUNTIME_ENCODING');
}
function verifyConsent(scope,set,m,now){
 keys(scope,SCOPE_FIELDS,'CONSENT_SCOPE_SHAPE');
 check(scope.version==='clear-bootcamp-app-consent-scope.1','CONSENT_SCOPE_VERSION');
 for(const k of ['operationsPolicyHash','applicationId','procedureId','decisionId','allocationId','policyHash','runtimeMappingHash','decisionHash','recipient','token','amountAtoms'])check(scope[k]===m[k],'CONSENT_SCOPE_TARGET');
 check(uint(scope.decisionRevision)&&scope.decisionRevision===m.decisionRevision,'CONSENT_SCOPE_REVISION');
 for(const k of ['firstReviewStartedAt','decisionPublishedAt'])check(safe(scope[k])&&String(scope[k])===m[k],'CONSENT_SCOPE_TIME_TARGET');
 check(uint(scope.allocationVersion)&&scope.allocationVersion!=='0'&&scope.reviewCapAt===scope.firstReviewStartedAt+600&&scope.confirmAt===scope.decisionPublishedAt+120,'CONSENT_SCOPE_WINDOW');
 keys(set,['version','variant','scopeHash','consents','objectionVariant','objections'],'CONSENT_SET_SHAPE');
 check(set.version==='clear-bootcamp-app-consent-set.1'&&set.scopeHash===p0Hash('E3-APP-CONSENT-SCOPE',scope),'CONSENT_SCOPE_HASH');
 check(set.variant===(m.eligibilityRoute==='1'?'MUTUAL_CURRENT_APP_CONSENT':'DEADLINE_CURRENT_APP_CONSENT_SET'),'CONSENT_ROUTE');
 check(Array.isArray(set.consents)&&set.consents.length<=2&&Array.isArray(set.objections),'CONSENT_SET_ARRAYS');
 const roles=[];const ids=new Set();
 for(const c of set.consents){
  keys(c,['id','actorRole','actorCommitment','scopeHash','recordedAt'],'CONSENT_RECORD');
  check(typeof c.id==='string'&&c.id.length>0&&!ids.has(c.id)&&['COURSE_OPERATOR','PARTICIPANT'].includes(c.actorRole)&&b32(c.actorCommitment)&&c.scopeHash===set.scopeHash&&safe(c.recordedAt)&&c.recordedAt>=scope.decisionPublishedAt&&c.recordedAt<=now,'CONSENT_RECORD_TARGET');
  roles.push(c.actorRole);ids.add(c.id);
 }
 check(new Set(roles).size===roles.length&&same(roles,[...roles].sort()),'CONSENT_ROLE_ORDER');
 if(m.eligibilityRoute==='1')check(same(roles,['COURSE_OPERATOR','PARTICIPANT']),'BOTH_CONSENTS_REQUIRED');
 check(set.objectionVariant===(set.objections.length?'ASSESSED_RECORDS':'NO_OBJECTIONS'),'OBJECTION_VARIANT');
 const objectionIds=[];
 for(const o of set.objections){
  keys(o,['id','status','assessmentId','receiptHash'],'OBJECTION_RECORD');
  check(typeof o.id==='string'&&o.id.length>0&&['DUPLICATE','IRRELEVANT','RESOLVED'].includes(o.status)&&typeof o.assessmentId==='string'&&o.assessmentId.length>0&&b32(o.receiptHash),'OBJECTION_UNRESOLVED');objectionIds.push(o.id);
 }
 check(new Set(objectionIds).size===objectionIds.length&&same(objectionIds,[...objectionIds].sort()),'OBJECTION_ORDER');
 check(p0Hash('E3-APP-CONSENT-SET',set)===m.consentSetHash,'CONSENT_SET_HASH');
 // Exact keys above intentionally exclude nonce/issuedAt/expiresAt/deadlinePolicyHash.
}
function verifyCas(actual,expected){
 keys(expected,['expectedRevision','expectedLedgerSequence','expectedSnapshotHash'],'E3_CAS_SHAPE');
 check(safe(expected.expectedRevision)&&safe(expected.expectedLedgerSequence)&&b32(expected.expectedSnapshotHash),'E3_CAS_VALUE');
 check(actual.applicationRevision===expected.expectedRevision&&actual.ledgerSequence===expected.expectedLedgerSequence&&actual.currentSnapshotHash===expected.expectedSnapshotHash,'E3_CAS_STALE');
}
function verifyRegistration(registration,target,expected){
 check(registration.version==='clear-bootcamp-e4-registration-intake.1'&&registration.paymentAuthority===false&&registration.procedureStarted===false&&registration.allocationConfirmed===false,'REGISTRATION_INTAKE');
 verifyCas(registration,expected);
 const r=registration.record,p=r.registration,m=target.payload.message,logical=target.payload.logicalTarget;
 check(r.version==='clear-bootcamp-e4-registration-target.1'&&r.paymentAuthority===false&&r.procedureStarted===false&&r.allocationConfirmed===false,'REGISTRATION_RECORD');
 check(p.version==='clear-bootcamp-procedure-registration-port.1'&&p.execution==='SYNTHETIC_PORT_FIXTURE','REGISTRATION_PROVENANCE');
 for(const k of ['applicationId','decisionId','allocationId'])check(r.opaqueTarget[k]===m[k]&&p[k]===logical[k],'REGISTRATION_OPAQUE_TARGET');
 check(same(p.domain,target.payload.domain)&&String(p.decisionRevision)===m.decisionRevision&&p.decisionHash===m.decisionHash&&p.recipient===m.recipient&&p.token===m.token&&p.amountAtoms==='100000000'&&p.tokenDecimals==='6','REGISTRATION_TARGET');
 check(typeof p.obligationId==='string'&&p.obligationId.length>0&&safe(r.decisionAcceptanceSequence),'REGISTRATION_OBLIGATION_SEQUENCE');
 check(r.policyHash===m.policyHash&&r.runtimeMappingHash===m.runtimeMappingHash&&r.profileHash===m.operationsPolicyHash,'REGISTRATION_POLICY');
 check(b32(r.sourceCurrentCommitment)&&r.sourceCurrentCommitment===target.sourceCurrentCommitment&&String(r.sourceValidUntilExclusive)===m.sourceValidUntilExclusive&&same(r.sourceWindow,target.currentServerState.sourceWindow),'REGISTRATION_SOURCE');
 check(registration.currentSnapshotHash===p0Hash('E3-CURRENT-REGISTRATION',{record:r,applicationRevision:registration.applicationRevision,ledgerSequence:registration.ledgerSequence,source:r.sourceCurrentCommitment}),'REGISTRATION_SNAPSHOT_HASH');
}
function verifyChain(chain,target,registration,scope,expected,now){
 keys(chain,['version','provenance','runtime','checkpoint','application','signer','nonce','accounting','newOperationsPaused'],'CHAIN_SNAPSHOT_SHAPE');
 check(chain.version==='clear-hackathon-test-execution-observation.1'&&chain.provenance==='SYNTHETIC_COMPILE_FIXTURE','CHAIN_PROVENANCE');
 keys(chain.checkpoint,['blockNumber','blockHash','canonical','observedAt'],'CHAIN_CHECKPOINT_SHAPE');
 keys(expected,['blockNumber','blockHash','applicationVersion'],'CHAIN_CAS_SHAPE');
 const cp=chain.checkpoint,a=chain.application,m=target.payload.message;
 check(uint(cp.blockNumber,256)&&b32(cp.blockHash)&&cp.canonical===true&&cp.observedAt===now,'CHAIN_CHECKPOINT');
 check(expected.blockNumber===cp.blockNumber&&expected.blockHash===cp.blockHash&&expected.applicationVersion===a.version,'CHAIN_CAS_STALE');
 check(uint(a.version)&&BigInt(a.version)>=BigInt(scope.allocationVersion),'CHAIN_VERSION');
 check(chain.newOperationsPaused===false&&a.state==='REVIEW'&&a.currentMet===true&&a.validObjection===false&&a.unassessedObjection===false&&a.newValidError===false&&a.terminalError===false,'CHAIN_CURRENT_STATE');
 for(const k of ['applicationId','recipient','allocationId','decisionId','decisionRevision','decisionHash','procedureId','firstReviewStartedAt','decisionPublishedAt','sourceValidUntilExclusive','revalidationCount','authorizationEpoch','consentSetHash'])check(a[k]===m[k],'CHAIN_EXACT_TARGET');
 check(a.acceptanceSequence===String(registration.record.decisionAcceptanceSequence)&&a.sourceReceiptHash===target.sourceCurrentCommitment,'CHAIN_SOURCE_SEQUENCE');
 check(a.reservationAtoms==='100000000'&&a.obligationAtoms==='100000000','CHAIN_FULL_RESERVATION');
 check(a.preparedDigest===hashTestUnsignedPayload({domain:target.payload.domain,message:m}).digest&&a.preparedNonce===m.nonce&&a.deadlinePolicyHash===m.deadlinePolicyHash,'CHAIN_PREPARED_DIGEST');
 check(a.mutualConsent===target.currentServerState.bothPartiesConsent&&(m.eligibilityRoute!=='1'||a.mutualConsent===true),'CHAIN_CONSENT');
 check(uint(a.allocatedAt)&&uint(a.targetRecordedAt)&&uint(a.observedAt)&&BigInt(a.allocatedAt)<=BigInt(m.decisionPublishedAt)&&BigInt(a.targetRecordedAt)<=BigInt(m.decisionPublishedAt)&&BigInt(a.observedAt)<=BigInt(m.issuedAt),'CHAIN_OBSERVATION_TIME');
 keys(chain.signer,['keyId','address','active'],'CHAIN_SIGNER_SHAPE');
 const roles=chain.runtime.roles;
 check(chain.signer.keyId===m.signerKeyId&&chain.signer.keyId===chain.runtime.signerKeyId&&chain.signer.address===chain.runtime.signerAddress&&chain.signer.active===true&&address(chain.signer.address)&&![roles.registrar,roles.keyAdmin,roles.relayer,roles.depositor,roles.terminator,chain.runtime.vaultAddress,chain.runtime.tokenAddress].includes(chain.signer.address),'CHAIN_SIGNER');
 keys(chain.nonce,['value','available'],'CHAIN_NONCE_SHAPE');check(chain.nonce.value===m.nonce&&chain.nonce.available===true,'CHAIN_NONCE');
 keys(chain.accounting,['balance','reserved','obligations','actualTokenBalance'],'CHAIN_ACCOUNTING_SHAPE');
 for(const v of Object.values(chain.accounting))check(uint(v,256),'CHAIN_ACCOUNTING_VALUE');
 const {balance:B,reserved:R,obligations:O,actualTokenBalance:T}=Object.fromEntries(Object.entries(chain.accounting).map(([k,v])=>[k,BigInt(v)]));
 check(B>=R&&O>=R&&R>=100000000n&&T>=B,'CHAIN_ACCOUNTING');
}

/** Read-only consistency audit of fictional copies of exact E3 internal outputs.
 * It does NOT authenticate a caller, E3 receipt, source, chain or intake. Even a
 * fully consistent candidate remains BLOCKED. Never accepts browser authority.
 * Future integration must obtain these values through authenticated internal
 * capabilities, recheck E3 CAS, and separately resolve E5 canonical chain CAS.
 */
export function auditExecutionCandidate(input){
 try{
  const x=structuredClone(input);
  keys(x,['target','registration','consentScope','chain','expected','runtimePin','intake','now'],'CANDIDATE_SHAPE');
  check(same(x.intake,REQUIRED_INTAKE),'INTAKE_PIN');check(safe(x.now),'CLOCK');
  keys(x.expected,['prepared','registration','chain'],'EXPECTED_CAS_REQUIRED');
  const t=x.target,m=t.payload.message;
  check(t.version==='clear-bootcamp-e4-target-intake.1'&&t.status==='UNSIGNED_PREFLIGHT_ONLY'&&t.paymentAuthority===false,'E3_INTERNAL_TARGET');
  verifyCas(t,x.expected.prepared);
  check(b32(t.sourceCurrentCommitment)&&['funding','authorizationPort','chain'].every(k=>b32(t.serverSnapshotHashes[k])),'E3_CURRENT_SNAPSHOT');
  check(t.currentSnapshotHash===p0Hash('E3-CURRENT-E4-INTAKE',{applicationRevision:t.applicationRevision,ledgerSequence:t.ledgerSequence,source:t.sourceCurrentCommitment,
   funding:t.serverSnapshotHashes.funding,authorization:t.serverSnapshotHashes.authorizationPort,chain:t.serverSnapshotHashes.chain,consentSetHash:m.consentSetHash,deadlinePolicyHash:m.deadlinePolicyHash}),'E3_SNAPSHOT_HASH');
  const checkE2=createTestDraftInspector(t.snapshot,{clock:()=>x.now}).inspect(t.payload,t.currentServerState);
  check(checkE2.status==='UNSIGNED_PREFLIGHT_ONLY','E2_CURRENT_'+(checkE2.code??'REJECTED'));
  verifyRuntime(x.runtimePin,x.chain.runtime,t.payload);
  verifyRegistration(x.registration,t,x.expected.registration);
  verifyConsent(x.consentScope,t.consentSet,m,x.now);
  verifyChain(x.chain,t,x.registration,x.consentScope,x.expected.chain,x.now);
  return blocked({candidateConsistent:true,digest:checkE2.hashes.digest,validationScope:'UNSIGNED_SYNTHETIC_CONSISTENCY_ONLY'});
 }catch(e){return freeze({status:'REJECTED',code:e instanceof CandidateError?e.code:'INVALID_CANDIDATE',stage:EXECUTION_STAGE,paymentAuthority:false,signerActivated:false,keyProviderAccessed:false,signature:null});}
}

// No key provider, transport, callback, HTTP flag, runtime pin or receipt supplied
// by a caller can enable this adapter. This stage has no operational signing path.
// Provider properties are deliberately never even read (including getters).
export function createExecutionSignerAdapter(_configuration){
 return freeze({stage:EXECUTION_STAGE,requiredIntake:REQUIRED_INTAKE,
  status:()=>blocked(),auditCandidate:auditExecutionCandidate,
  sign:async()=>blocked(),
 });
}
