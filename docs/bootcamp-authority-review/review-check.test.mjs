// Review artifact checks only. Does not simulate a new authorization contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectSources} from './source-inspection.mjs';
import {referenceFunding,R2_ADDENDUM} from '../../specs/bootcamp/r2-reference.mjs';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const inspection=read('./source-inspection.json'),vectors=read('./unsigned-design-vectors.json');
test('existing contracts recompile to the recorded ABI and runtime fingerprints without a provider',()=>{
 assert.deepEqual(inspectSources(),inspection);
});
test('V4 actual grant tuple cannot encode the new R2 decision/consent/allocation/key fields',()=>{
 const c=inspection.contracts.CourseRefundVaultV4;
 const grant=c.functions.find(f=>f.name==='authorizeGrant');
 assert.equal(grant.selector,'0x8d122e60');
 const names=grant.inputs[0].components.map(x=>x.name);
 assert.deepEqual(names,['grantId','applicationId','learner','policyHash','runtimeConfigHash','examNullifier','amount','verifiedAt','issueBy','claimUntil']);
 for(const field of ['runtimeMappingHash','decisionId','decisionRevision','decisionHash','allocationId','consentSetHash','deadlinePolicyHash','eligibilityRoute','nonce','signerKeyId','authorizationEpoch']){
  assert(R2_ADDENDUM.oracle.requiredMessageFields.includes(field));assert(!names.includes(field));
 }
 assert(!c.functions.some(f=>/revoke|rotate|epoch|setIssuer/i.test(f.name)));
});
test('FundingLab ABI is per-application topUp/allocate without oracle authorization',()=>{
 const functions=inspection.contracts.FundingLab.functions;
 assert.equal(functions.find(f=>f.name==='topUp').signature,'topUp(bytes32,bytes32,uint256)');
 assert.equal(functions.find(f=>f.name==='allocate').signature,'allocate(bytes32)');
 assert(!functions.some(f=>/authorize|signer|epoch/i.test(f.name)));
});
test('P0 frozen reference hashes and additive R2 blocking gates remain unchanged',()=>{
 const original=JSON.parse(readFileSync(new URL('../../specs/bootcamp/r2-example.json',import.meta.url)));
 for(const [path,sha] of Object.entries(original.frozenV1Files)){
  const bytes=readFileSync(new URL('../../specs/bootcamp/'+path,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);
 }
 assert.equal(R2_ADDENDUM.gates.paymentAllowed,false);assert.equal(R2_ADDENDUM.gates.outbox,'HOLD');
 assert.equal(R2_ADDENDUM.funding.allocationOrder,null);assert.equal(R2_ADDENDUM.funding.unresolvedFundsOwnership,null);
});
for(const row of vectors.fundingCases)test('unsigned funding arithmetic: '+row.id,()=>{
 const result=referenceFunding(row.input);
 for(const [field,expected] of Object.entries(row.expected))assert.equal(result[field],expected,field);
 assert.equal(result.globalPause,false);
 const B=BigInt(result.confirmedBalanceAtoms),R=BigInt(result.reservedAtoms),O=BigInt(result.confirmedObligationAtoms);
 assert(B>=R&&O>=R);assert.equal(BigInt(result.shortfallAtoms),O>B?O-B:0n);
});
test('documented payment/topup transitions conserve B R O independently',()=>{
 const rows=new Map(vectors.fundingCases.map(x=>[x.id,x.expected]));
 for(const t of vectors.fundingTransitions){
  const from=rows.get(t.from),to=rows.get(t.to);
  for(const [key,d] of [['confirmedBalanceAtoms','deltaB'],['reservedAtoms','deltaR'],['confirmedObligationAtoms','deltaO']])assert.equal(BigInt(to[key])-BigInt(from[key]),BigInt(t[d]));
 }
});
test('same application cannot gain another obligation by renaming its ID or decision',()=>{
 const input=structuredClone(vectors.fundingCases.find(x=>x.id==='separate-shortfall-start').input);
 input.obligations.push({...input.obligations[0],obligationId:'replacement-id',decisionHash:'0x'+'99'.repeat(32)});
 assert.throws(()=>referenceFunding(input),/R2_DUPLICATE_APPLICATION_OBLIGATION/);
});
test('old reservation cannot silently be rebound to a corrected target or different recipient',()=>{
 for(const patch of [{decisionHash:'0x'+'88'.repeat(32)},{recipientRef:'recipient-other'}]){
  const input=structuredClone(vectors.fundingCases.find(x=>x.id==='separate-shortfall-start').input);
  Object.assign(input.allocations[0],patch);assert.throws(()=>referenceFunding(input),/R2_ALLOCATION_TARGET/);
 }
});
