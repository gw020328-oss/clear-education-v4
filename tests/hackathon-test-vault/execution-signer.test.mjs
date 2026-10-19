import test from 'node:test';
import assert from 'node:assert/strict';
import {auditExecutionCandidate,createExecutionSignerAdapter} from '../../src/hackathon-test-vault/execution-signer.mjs';
import {candidate,h,addr} from './execution-candidate-fixture.mjs';

test('execution adapter defaults BLOCKED without touching any configuration or key provider',async()=>{
 let reads=0;const poison=new Proxy({}, {get(){reads++;throw new Error('must not read credentials or callbacks');}});
 const a=createExecutionSignerAdapter(poison);assert.equal(a.status().status,'BLOCKED');
 assert.equal((await a.sign(poison)).status,'BLOCKED');assert.equal(reads,0);
});
test('HTTP enable flags and claimed intake approval cannot activate signing',async()=>{
 let keyCalls=0;const a=createExecutionSignerAdapter({enabled:true,e3Accepted:true,verified:true,keyProvider(){keyCalls++;throw Error('key');}});
 for(const value of [{enabled:true},{receiptHash:h(88),verified:true},candidate()]){
  const r=await a.sign(value);assert.equal(r.status,'BLOCKED');assert.equal(r.signature,null);assert.equal(r.paymentAuthority,false);
 }
 assert.equal(keyCalls,0);
});
test('consistent E3 example remains a fictional unsigned BLOCKED audit, never a signing positive',()=>{
 const r=auditExecutionCandidate(candidate());assert.equal(r.status,'BLOCKED');assert.equal(r.candidateConsistent,true);assert.equal(r.keyProviderAccessed,false);assert.equal(r.signature,null);
});
const cases=[
 ['missing E3 final acceptance cannot be supplied by caller',x=>x.intake.e3FinalAcceptance='fb9e6d3a9f35c8d12b80f0c84e01d8a6db9aeda1','INTAKE_PIN'],
 ['wrong E1 intake',x=>x.intake.e1='0'.repeat(40),'INTAKE_PIN'],
 ['wrong E2 intake',x=>x.intake.e2='0'.repeat(40),'INTAKE_PIN'],
 ['wrong E3 source',x=>x.intake.e3Source='0'.repeat(40),'INTAKE_PIN'],
 ['missing server CAS',x=>delete x.expected.prepared,'EXPECTED_CAS_REQUIRED'],
 ['stale server revision',x=>x.expected.prepared.expectedRevision++,'E3_CAS_STALE'],
 ['stale global ledger sequence',x=>x.expected.prepared.expectedLedgerSequence++,'E3_CAS_STALE'],
 ['stale server snapshot',x=>x.expected.prepared.expectedSnapshotHash=h(99),'E3_CAS_STALE'],
 ['HTTP payment authority is not accepted',x=>x.target.paymentAuthority=true,'E3_INTERNAL_TARGET'],
 ['forged source commitment',x=>x.target.sourceCurrentCommitment=h(99),'E3_SNAPSHOT_HASH'],
 ['withdrawn current app consent',x=>x.target.currentServerState.bothPartiesConsent=false,'E2_CURRENT_CONSENT_REQUIRED'],
 ['unassessed objection',x=>x.target.currentServerState.unassessedSubstantiveObjection=true,'E2_CURRENT_CURRENT_OR_OBJECTION'],
 ['unresolved valid objection',x=>x.target.currentServerState.unresolvedValidObjection=true,'E2_CURRENT_CURRENT_OR_OBJECTION'],
 ['new valid error',x=>x.target.currentServerState.newValidError=true,'E2_CURRENT_CURRENT_OR_OBJECTION'],
 ['source expires at exclusive bound',x=>x.now=Number(x.target.payload.message.sourceValidUntilExclusive),'E2_CURRENT_FIRST_ACCEPT_TIME'],
 ['source lease shrinks before expiry',x=>x.target.currentServerState.sourceWindow.queryLeaseExpiresAt=String(x.now),'E2_CURRENT_SOURCE_CUTOFF'],
 ['E3 nonce consumed',x=>x.target.currentServerState.nonceAvailable=false,'E2_CURRENT_NONCE_UNAVAILABLE'],
 ['E3 key revoked',x=>x.target.currentServerState.signerActive=false,'E2_CURRENT_SIGNER_STATE'],
 ['E3 epoch stale',x=>x.target.currentServerState.authorizationEpoch='2','E2_CURRENT_APP_EPOCH'],
 ['accepted-right cannot be signed again',x=>x.target.currentServerState.status='ACCEPTED','E2_CURRENT_FIRST_ACCEPT_ONLY'],
 ['runtime code mismatch',x=>x.chain.runtime.vaultCodeHash=h(99),'RUNTIME_PIN_MISMATCH'],
 ['genesis mismatch',x=>x.chain.runtime.genesisHash=h(99),'RUNTIME_PIN_MISMATCH'],
 ['token code mismatch',x=>x.chain.runtime.tokenCodeHash=h(99),'RUNTIME_PIN_MISMATCH'],
 ['role collision',x=>x.runtimePin.roles.relayer=x.runtimePin.roles.registrar,'ROLE_SEPARATION'],
 ['registration CAS stale',x=>x.expected.registration.expectedRevision++,'E3_CAS_STALE'],
 ['opaque mapping cannot be substituted',x=>x.registration.record.opaqueTarget.applicationId=h(99),'REGISTRATION_OPAQUE_TARGET'],
 ['registration decision differs',x=>x.registration.record.registration.decisionRevision++,'REGISTRATION_TARGET'],
 ['registration must not assert actual allocation',x=>x.registration.allocationConfirmed=true,'REGISTRATION_INTAKE'],
 ['consent scope forbids circular authorization nonce',x=>x.consentScope.nonce=h(99),'CONSENT_SCOPE_SHAPE'],
 ['consent scope forbids final deadline hash',x=>x.consentScope.deadlinePolicyHash=h(99),'CONSENT_SCOPE_SHAPE'],
 ['wrong fixed recipient in consent',x=>x.consentScope.recipient=addr(99),'CONSENT_SCOPE_TARGET'],
 ['duplicate consent role',x=>x.target.consentSet.consents[1].actorRole='COURSE_OPERATOR','CONSENT_ROLE_ORDER'],
 ['missing second early-route consent',x=>x.target.consentSet.consents.pop(),'BOTH_CONSENTS_REQUIRED'],
 ['consent ordered array matters',x=>x.target.consentSet.consents.reverse(),'CONSENT_ROLE_ORDER'],
 ['new objection cannot be made safe by receipt hash',x=>{x.target.consentSet.objectionVariant='ASSESSED_RECORDS';x.target.consentSet.objections=[{id:'objection-a',status:'UNASSESSED',assessmentId:'assessment-a',receiptHash:h(99)}];},'OBJECTION_UNRESOLVED'],
 ['chain canonical false',x=>x.chain.checkpoint.canonical=false,'CHAIN_CHECKPOINT'],
 ['checkpoint stale',x=>x.chain.checkpoint.observedAt--,'CHAIN_CHECKPOINT'],
 ['chain block CAS mismatch',x=>x.expected.chain.blockHash=h(99),'CHAIN_CAS_STALE'],
 ['chain version CAS mismatch',x=>x.expected.chain.applicationVersion='4','CHAIN_CAS_STALE'],
 ['new operations paused',x=>x.chain.newOperationsPaused=true,'CHAIN_CURRENT_STATE'],
 ['terminated chain state',x=>x.chain.application.state='TERMINATED','CHAIN_CURRENT_STATE'],
 ['chain current flag false',x=>x.chain.application.currentMet=false,'CHAIN_CURRENT_STATE'],
 ['chain objections cannot be ignored',x=>x.chain.application.unassessedObjection=true,'CHAIN_CURRENT_STATE'],
 ['chain target changed',x=>x.chain.application.decisionRevision='10','CHAIN_EXACT_TARGET'],
 ['chain epoch changed',x=>x.chain.application.authorizationEpoch='2','CHAIN_EXACT_TARGET'],
 ['chain sequence is decision sequence, not global ledger',x=>x.chain.application.acceptanceSequence=String(x.target.ledgerSequence),'CHAIN_SOURCE_SEQUENCE'],
 ['chain partial reservation',x=>x.chain.application.reservationAtoms='50000000','CHAIN_FULL_RESERVATION'],
 ['unsigned digest is not prepared',x=>x.chain.application.preparedDigest=h(99),'CHAIN_PREPARED_DIGEST'],
 ['prepared nonce differs',x=>x.chain.application.preparedNonce=h(99),'CHAIN_PREPARED_DIGEST'],
 ['consent chain commitment changed',x=>x.chain.application.mutualConsent=false,'CHAIN_CONSENT'],
 ['chain observed after issued invalidates old payload',x=>x.chain.application.observedAt=String(x.now+1),'CHAIN_OBSERVATION_TIME'],
 ['wrong registered signing address',x=>x.chain.signer.address=addr(99),'CHAIN_SIGNER'],
 ['chain key revoked',x=>x.chain.signer.active=false,'CHAIN_SIGNER'],
 ['chain nonce spent',x=>x.chain.nonce.available=false,'CHAIN_NONCE'],
 ['credited balance cannot cover R',x=>x.chain.accounting.balance='50000000','CHAIN_ACCOUNTING'],
 ['actual token balance cannot cover credited balance',x=>x.chain.accounting.actualTokenBalance='1','CHAIN_ACCOUNTING'],
];
for(const [name,mutate,code] of cases)test('compile-only audit rejects '+name,()=>{
 const x=candidate();mutate(x);const r=auditExecutionCandidate(x);assert.equal(r.status,'REJECTED');assert.equal(r.code,code);assert.equal(r.signature,null);assert.equal(r.keyProviderAccessed,false);
});
test('forged stored E3 inspection flags still cannot authenticate or sign',async()=>{
 const x=candidate();x.target.inspection={status:'VERIFIED',signatureVerified:true};
 // The stored inspector report is never used as authority. Fresh E2 checks run.
 assert.equal(auditExecutionCandidate(x).status,'BLOCKED');
 assert.equal((await createExecutionSignerAdapter({intake:x.intake}).sign(x)).status,'BLOCKED');
});
