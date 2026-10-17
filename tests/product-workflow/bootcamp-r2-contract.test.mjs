import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {R2_ADDENDUM,referenceFunding,referenceMetrics,frozenFileSha256} from '../../specs/bootcamp/r2-reference.mjs';
const vector=()=>JSON.parse(readFileSync(new URL('../../specs/bootcamp/r2-example.json',import.meta.url)));
test('R2 preserves exact P0 frozen files and separate wire version without enabling authority',()=>{
 const v=vector();for(const [path,sha] of Object.entries(v.frozenV1Files))assert.equal(frozenFileSha256(path),sha,path);
 assert.equal(R2_ADDENDUM.baseFrozenCommit,'03fa64324ef9cc2ce4fb442a612329a7b1285677');
 assert.equal(R2_ADDENDUM.gates.paymentAllowed,false);assert.equal(R2_ADDENDUM.oracle.trustless,false);
 assert.equal(R2_ADDENDUM.oracle.aiSigningOrTransferAuthority,false);
 assert.equal(R2_ADDENDUM.funding.commercialDepositRatio,null);assert.equal(R2_ADDENDUM.funding.allocationOrder,null);
});
test('shortfall protects allocated claim, does not double-count reserved obligations or pause pool',()=>{
 const r=referenceFunding(vector().fundingShortfall);
 assert.deepEqual([r.reservedAtoms,r.availableAtoms,r.confirmedObligationAtoms,r.unallocatedObligationAtoms,r.shortfallAtoms],['100000000','20000000','200000000','100000000','80000000']);
 assert.deepEqual(r.affectedQueue,['obligation-b']);assert.deepEqual(r.allocatedClaimRefs,['allocation-a']);assert.equal(r.globalPause,false);
});
test('confirmed top-up resolves arithmetic shortfall without pretending allocation/payment occurred',()=>{
 const input=vector().fundingShortfall,r=referenceFunding({...input,confirmedBalanceAtoms:'200000000'});
 assert.equal(r.shortfallAtoms,'0');assert.equal(r.reservedAtoms,'100000000');assert.deepEqual(r.affectedQueue,['obligation-b']);
});
test('duplicate reservation, redirected recipient and stale decision allocation are rejected',()=>{
 const input=vector().fundingShortfall,a=input.allocations[0];
 assert.throws(()=>referenceFunding({...input,obligations:[...input.obligations,{...input.obligations[0],obligationId:'renamed-obligation'}]}),/R2_DUPLICATE_APPLICATION_OBLIGATION/);
 assert.throws(()=>referenceFunding({...input,allocations:[a,{...a,allocationId:'allocation-other'}]}),/R2_DOUBLE_ALLOCATION/);
 for(const change of [{recipientRef:'recipient-other'},{decisionHash:'0x'+'9'.repeat(64)},{amountAtoms:'1'}])
  assert.throws(()=>referenceFunding({...input,allocations:[{...a,...change}]}),/R2_ALLOCATION_TARGET/);
});
test('insufficient reserved balance and float/negative amounts cannot create available funding',()=>{
 const input=vector().fundingShortfall;assert.throws(()=>referenceFunding({...input,confirmedBalanceAtoms:'99999999'}),/R2_INSOLVENT_RESERVED/);
 for(const amount of ['1.1','-1','01',100])assert.throws(()=>referenceFunding({...input,confirmedBalanceAtoms:amount}),/R2_ATOMS/);
});
test('dedup and per-person overlapping intervals separate active work from wall waiting',()=>{
 const e=vector().metricEvents,r=referenceMetrics([...e,structuredClone(e[0])]);
 assert.equal(r.provenance,'SYNTHETIC_EXAMPLE');assert.equal(r.eventCount,e.length);
 assert.equal(r.humanWorkMs,15000);assert.equal(r.waitingWallMs,60000);assert.equal(r.overallElapsedMs,90000);
 assert.equal(r.automatedOperationCount,1);assert.equal(r.supplementCount,1);assert.equal(r.humanWorkReductionPercent,null);
});
test('retry renamed event, conflicting duplicate and raw data field cannot inflate metrics',()=>{
 const e=vector().metricEvents;
 assert.throws(()=>referenceMetrics([...e,{...e[0],eventId:'renamed-retry'}]),/R2_OPERATION_DUPLICATE/);
 assert.throws(()=>referenceMetrics([...e,{...e[0],endedAtMs:1}]),/R2_DUPLICATE_CONFLICT/);
 assert.throws(()=>referenceMetrics([{...e[0],rawBody:'forbidden'}]),/R2_EVENT_FIELDS/);
});
test('missing measurement or unmatched baseline stays N/A; measured calculation may be negative',()=>{
 const e=vector().metricEvents;
 assert.equal(referenceMetrics([]).humanWorkMs,null);assert.equal(referenceMetrics(e.slice(1)).overallElapsedMs,null);
 assert.equal(referenceMetrics(e,{baselineHumanWorkMs:10000}).humanWorkReductionPercent,null);
 assert.equal(referenceMetrics(e,{baselineHumanWorkMs:10000,baselineComparable:true,humanWorkCoverageComplete:true}).humanWorkReductionPercent,-50);
 assert.throws(()=>referenceMetrics(e,{baselineHumanWorkMs:0}),/R2_BASELINE/);
});
test('new decision version is distinct while different case or measured/example provenance cannot mix',()=>{
 const e=vector().metricEvents,correction={...e[2],eventId:'new-version',decisionRevision:2,decisionHash:'0x'+'2'.repeat(64)};
 assert.equal(referenceMetrics([...e,correction]).eventCount,e.length+1);
 assert.throws(()=>referenceMetrics([...e,{...correction,scenarioRunId:'run-other'}]),/R2_CASE_MIX/);
 assert.throws(()=>referenceMetrics([...e,{...correction,provenance:'MEASURED_ISOLATED_TEST'}]),/R2_PROVENANCE_MIX/);
});
