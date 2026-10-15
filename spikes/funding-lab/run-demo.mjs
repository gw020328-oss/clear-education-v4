import assert from 'node:assert/strict';
import { openLab } from './environment.mjs';
import { createLabReader } from './reader.mjs';
import { simulateReserve } from './simulation.mjs';

const f=await openLab();
try {
  const app=f.fixtures[0].applicationId,other=f.fixtures[1].applicationId,steps=[];
  const record=async label=>{
    const s=await f.reader.snapshot(app);
    steps.push({label,...Object.fromEntries(['registration','eligibility','funding','claimState','entitlementAtoms','fundedTotalAtoms','securedAtoms','allocatedAtoms','reservedAtoms','shortfallAtoms','paidAtoms','paymentAllowed'].map(k=>[k,s[k]]))});
  };
  await f.register();await record('합성 조건 충족·재원 부족');
  await assert.rejects(()=>f.vault.claim.staticCall(app));
  await f.topUp('40000000');await record('40 TEST 부분 충전');
  await assert.rejects(()=>f.vault.allocate.staticCall(app));
  const {operationId}=await f.topUp('60000000'); // submission result may be lost
  const recovered=await createLabReader(f.provider,f.pin).operation(app,operationId,'60000000');assert.equal(recovered.applied,true);
  await(await f.vault.topUp(app,operationId,'60000000')).wait();await f.mine();await record('60 TEST 추가 충전·응답 유실 재조회·중복 재시도');
  await f.register(1);await f.topUp('100000000',1);await(await f.vault.allocate(other)).wait();
  await(await f.vault.allocate(app)).wait();await f.mine();await record('신청별 전액 배정');
  await assert.rejects(()=>f.vault.recoverUnallocated.staticCall(other));
  await(await f.vault.connect(f.signers[3]).claim(app)).wait();await(await f.vault.claim(app)).wait();await f.mine();await record('단회 전액 지급·중복 재시도');
  assert.equal(await f.token.balanceOf(f.fixtures[0].recipient),100000000n);assert.equal(await f.vault.totalReserved(),100000000n);
  const base={students:100,tuitionAtoms:'100000000',refunds:[{tier:100,count:50,amountAtoms:'100000000'},{tier:300,count:10,amountAtoms:'300000000'}],
    ancillaryAtoms:'100000000',bufferBps:500,bufferBasis:'REVENUE',topUpBps:1500,topUpBasis:'REVENUE'};
  console.log(JSON.stringify({scope:'EPHEMERAL_SYNTHETIC_TEST_ONLY',chainId:31338,token:'TEST',decimals:6,
    eligibilitySource:'TRUSTED_CONSTRUCTOR_FIXTURES_NOT_REAL_EVIDENCE',steps,
    recoveredOperationWithoutDuplicateCredit:true,unfundedPaymentBlocked:true,partialAllocationBlocked:true,
    otherApplicationReservedAtoms:(await f.vault.totalReserved()).toString(),successfulPaymentsForFirstApplication:1,
    simulationNotice:'60/55/5/15 percent are mentor-question assumptions, not defaults or recommendations; no PG or asset connection',
    comparisons:[6000,5500].map(holdBps=>simulateReserve({...base,holdBps})),
    blockers:{automatic400PercentPayment:false,moodle:'BLOCKED',sourceEligibility:'BLOCKED',grantOutbox:'HOLD',independentProductClaim:'NO_GO',macFailureRootCause:'UNCONFIRMED'},
  },null,2));
} finally {await f.close();}
