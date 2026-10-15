import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteBenefitAmount } from '../../src/policy/benefit-amount.mjs';
import { simulateReserve } from '../../spikes/funding-lab/simulation.mjs';
const amount={basis:'SYNTHETIC_ASSUMPTION',token:'TEST',decimals:6,paidAtoms:'100000000',bookAtoms:'10000000',deviceAtoms:'5000000',fixedFeeAtoms:'1000000',examCreditAtoms:'2000000',taxBps:300,capAtoms:'999000000',rounding:'FLOOR_ONCE_DEMO',formulaVersion:'siwon-demo-amount.1'};
const scenario={students:100,tuitionAtoms:'100000000',refunds:[{tier:100,count:50,amountAtoms:'100000000'},{tier:300,count:10,amountAtoms:'300000000'}],ancillaryAtoms:'100000000',holdBps:6000,bufferBps:500,bufferBasis:'REVENUE',topUpBps:1500,topUpBasis:'REVENUE'};
test('shared M0 amount arithmetic uses one final floor with fixed units and no silent official defaults',()=>{
  assert.deepEqual(quoteBenefitAmount(200,amount),['CALCULATED_SYNTHETIC','165870000']);
  for(const field of ['paidAtoms','bookAtoms','deviceAtoms','fixedFeeAtoms','examCreditAtoms','taxBps','capAtoms'])assert.deepEqual(quoteBenefitAmount(200,{...amount,[field]:null}),['AMOUNT_OPEN',null]);
  assert.deepEqual(quoteBenefitAmount(100,{...amount,basis:'OFFICIAL_OPEN'}),['AMOUNT_OPEN',null]);
  assert.deepEqual(quoteBenefitAmount(400,amount),['PRECHECK_ONLY',null]);assert.throws(()=>quoteBenefitAmount(500,amount),/BENEFIT_TIER/);
  assert.deepEqual(quoteBenefitAmount(100,{...amount,bookAtoms:'999000000'}),['INVALID_AMOUNT',null]);
  assert.deepEqual(quoteBenefitAmount(300,{...amount,capAtoms:'1'}),['INVALID_AMOUNT',null]);
  assert.deepEqual(quoteBenefitAmount(50,{...amount,paidAtoms:'3',bookAtoms:'0',deviceAtoms:'0',fixedFeeAtoms:'0',examCreditAtoms:'0',taxBps:0}),['CALCULATED_SYNTHETIC','1']);
  for(const change of [{paidAtoms:1.1},{taxBps:3.3},{token:'KRW'},{formulaVersion:'guess'},{rounding:'ROUND'}])assert.throws(()=>quoteBenefitAmount(100,{...amount,...change}));
});
test('mentor what-if ratios remain explicit aggregate assumptions, never onchain balance or defaults',()=>{
  const a=simulateReserve(scenario),b=simulateReserve({...scenario,holdBps:5500});
  assert.equal(a.refundPeople,60);assert.equal(a.refundAtoms,'8000000000');assert.equal(a.requiredAtoms,'8600000000');
  assert.equal(a.simulatedAvailableAtoms,'7500000000');assert.equal(a.additionalRequiredAtoms,'1100000000');
  assert.equal(b.additionalRequiredAtoms,'1600000000');assert.equal(a.onchainSpendableAtoms,'0');assert.equal(a.paymentAllowed,false);assert.equal(a.productDefault,false);
  const c=simulateReserve({...scenario,bufferBasis:'LIABILITY',topUpBasis:'LIABILITY',ancillaryAtoms:'0',refunds:[{tier:100,count:20,amountAtoms:'100000000'}]});
  assert.equal(c.refundPeople,20);assert.equal(c.bufferAtoms,'100000000');assert.equal(c.hypotheticalTopUpAtoms,'300000000');assert.equal(c.additionalRequiredAtoms,'0');
  const d=simulateReserve({...scenario,students:0,refunds:[],ancillaryAtoms:'0'});assert.equal(d.requiredAtoms,'0');
});
test('simulation rejects missing inputs, overcounting, ambiguous basis, floats and 400/500 payout bins',()=>{
  const {holdBps,...missing}=scenario;assert.throws(()=>simulateReserve(missing));
  for(const change of [{refunds:[{tier:400,count:1,amountAtoms:'1'}]},{refunds:[{tier:500,count:1,amountAtoms:'1'}]},
    {refunds:[{tier:100,count:101,amountAtoms:'1'}]},{topUpBasis:null},{holdBps:60.5},{tuitionAtoms:100},{ancillaryAtoms:'-1'},
    {refunds:[{tier:100,count:1,amountAtoms:'1'},{tier:100,count:1,amountAtoms:'1'}]}])assert.throws(()=>simulateReserve({...scenario,...change}));
});
