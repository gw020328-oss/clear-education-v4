import test from 'node:test';
import assert from 'node:assert/strict';
import {currentFixture} from './current-fixture.mjs';
import {bridgeFixture} from './bridge-fixture.mjs';
import {database,H,ZERO} from './fixture.mjs';
import {executionCorrections} from '../../src/bootcamp/execution-corrections.mjs';
import {executionCommands} from '../../src/bootcamp/execution-commands.mjs';

test('objection receipt is not inclusion and invalidates already prepared API approval before chain reflection',async t=>{
 const f=await currentFixture(t,{kind:'ACCEPT'}),evidenceId=f.store.getApplication(f.aliceContext,f.a).evidence[0].record.evidenceId;
 const v=f.view(f.a);const r=f.store.submitReviewObjection(f.aliceContext,f.a,{expectedRevision:v.applicationRevision,expectedLedgerSequence:v.ledgerSequence,targetDecisionId:v.decisionId,targetDecisionRevision:v.decisionRevision,targetDecisionHash:v.decisionHash,reason:'SOURCE_MISMATCH',evidenceId},f.key());
 assert.equal(r.record.target.chainStatus,'NOT_OBSERVED');
 await assert.rejects(f.prepare(),/BC_E5_(CURRENT_CHANGED|OBJECTION_BLOCKED)/);
 assert.equal(f.metrics.seals,0);assert.equal(f.metrics.dispatches,0);
});

for(const status of ['UNKNOWN','REORGED'])test('B receipt '+status+' never commits inclusion or frees the original intent',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.makeEnvelope(r.binding);await f.bridge.lookup(f.g,f.h,r.binding);
 f.setReceipt({ref:'env-offline',status,txHash:H('tx'),automaticPromotion:false});
 const result=await f.bridge.recover(f.g,f.h,r.binding);assert.equal(result.status,'HOLD');assert.equal(result.automaticResign,false);
 assert.equal(database(f,db=>db.prepare('SELECT COUNT(*) n FROM e5b_completions').get().n),0);assert.ok(f.bridge.inspect(f.g,f.h));
});

test('correction planner rejects forged application/version, accepted state and a target without a registered new decision',async t=>{
 const f=await currentFixture(t,{setupOnly:true}),a=database(f,db=>db.prepare('SELECT * FROM applications WHERE id=?').get(f.a));
 database(f,db=>{
  const corrections=executionCorrections({db,heads:()=>[],source:()=>null}),v=f.view(f.a);
  const i={kind:'OBSERVE',operationId:H('observe'),chainApplicationId:f.m.applicationId,expectedChainVersion:'4',targetDecisionId:v.decisionId,targetDecisionHash:v.decisionHash,targetDecisionRevision:v.decisionRevision};
  const facts=corrections.build(i,a,f.snapshot(),f.time);assert.equal(facts.command.method,'observeCurrent');assert.equal(facts.sourceValidUntilExclusive,null);assert.equal(facts.reviewCapAt,null);
  assert.equal(facts.command.args[2].currentMet,false);assert.equal(facts.command.args[2].sourceValidUntilExclusive,f.m.sourceValidUntilExclusive);
  for(const patch of [{chainApplicationId:H('wrong')},{expectedChainVersion:'3'},{targetDecisionHash:H('wrong')}])assert.throws(()=>corrections.build({...i,...patch},a,f.snapshot(),f.time));
  for(const state of ['4','5','6']){const o=f.snapshot();o.business.application.state=state;assert.throws(()=>corrections.build(i,a,o,f.time),/CORRECTION_UNACCEPTED/);}
  assert.throws(()=>corrections.build({...i,kind:'REPLACE'},a,f.snapshot(),f.time),/REPLACEMENT_BLOCKED/);
  assert.throws(()=>corrections.build({...i,kind:'TERMINATE'},a,f.snapshot(),f.time),/TERMINATION_REQUIRED/);
 });
});

async function correctionReceipt(t){
 const f=await bridgeFixture(t,{kind:'OBSERVE'}),r=await f.prepare();f.makeEnvelope(r.binding,{authorizationNonce:ZERO});await f.bridge.lookup(f.g,f.h,r.binding);
 const v=f.command.args[2];Object.assign(f.observation.business.application,{currentMet:v.currentMet,unassessedObjection:v.unassessedObjection,validObjection:v.validObjection,newValidError:v.newValidError,
  observationReceiptHash:v.receiptHash,observedAt:v.observedAt,preparedDigest:ZERO,preparedNonce:ZERO,deadlinePolicyHash:ZERO,consentSetHash:ZERO,mutualConsent:false,version:'5',epoch:String(BigInt(f.m.authorizationEpoch)+1n)});
 f.observation.business.application.target.sourceValidUntilExclusive=v.sourceValidUntilExclusive;
 const o=f.snapshot();o.business.nonce=ZERO;o.businessHash=(await import('../../src/bootcamp/execution-e4-ports.mjs')).e4Hash(o.business);
 f.setReceipt({ref:'env-offline',status:'INCLUDED',txHash:H('tx'),checkpoint:o.checkpoint,observation:o,automaticResign:false});return {f,b:r.binding};
}
test('canonical correction readback is required; later proven reorg downgrades persisted INCLUDED and never promotes from DB',async t=>{
 const {f,b}=await correctionReceipt(t);assert.equal((await f.bridge.recover(f.g,f.h,b)).completion.status,'INCLUDED');
 assert.equal((await f.store.execution.reviewChain(f.aliceContext,f.a)).status,'INCLUDED');
 f.setComparison((previous,current)=>({status:'REORG_PROVEN_RECOVERY_BLOCKED',oldHash:previous.hash,currentHash:current.hash,replacementHash:H('fork'),automaticRebase:false}));
 const after=await f.store.execution.reviewChain(f.aliceContext,f.a);assert.equal(after.status,'REORGED');assert.equal(after.canonical,false);assert.equal(after.finalized,false);
 assert.equal(database(f,db=>db.prepare('SELECT COUNT(*) n FROM e5b_completions').get().n),1);
});
test('correction receipt with missing observed effect cannot complete or release its slot',async t=>{
 const {f,b}=await correctionReceipt(t);f.observation.business.application.observationReceiptHash=H('not-applied');
 await assert.rejects(f.bridge.recover(f.g,f.h,b),/BC_E5B_RECEIPT_POSTCONDITION/);
 assert.equal(database(f,db=>db.prepare('SELECT COUNT(*) n FROM e5b_completions').get().n),0);
});
