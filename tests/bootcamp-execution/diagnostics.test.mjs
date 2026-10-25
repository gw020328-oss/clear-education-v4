import test from 'node:test';
import assert from 'node:assert/strict';
import {executionErrorSummary,createExecutionFailureLog,observeExecutionFailure} from '../../src/bootcamp/execution-diagnostics.mjs';
import {RuleError} from '../../src/policy/values.mjs';

test('fixed internal codes survive, arbitrary message/stack/query/causes are redacted',()=>{
 const secret='PRIVATE_URL?token=never-copy-this';const e=new RuleError('BC_E5_CLOCK_CHANGED');
 e.stack=secret;e.cause=new TypeError(secret,{cause:Error('E5_LEASE_EXPIRED')});
 const d=executionErrorSummary(e);assert.equal(d.code,'BC_E5_CLOCK_CHANGED');assert.equal(d.errorKind,'RULE_ERROR');
 assert.equal(d.causes[0].code,'UNCLASSIFIED');assert.equal(d.causes[1].code,'E5_LEASE_EXPIRED');assert.equal(JSON.stringify(d).includes(secret),false);
});
test('getters, proxies, cycles and long chains cannot disclose or execute error fields',()=>{
 let touched=0;const e={};for(const k of ['message','code','cause','stack'])Object.defineProperty(e,k,{get(){touched++;throw Error('PRIVATE');}});
 assert.equal(executionErrorSummary(e).code,'UNCLASSIFIED');assert.equal(touched,0);
 const p=new Proxy({}, {get(){throw Error('PRIVATE');},getOwnPropertyDescriptor(){throw Error('PRIVATE');},getPrototypeOf(){throw Error('PRIVATE');}});
 assert.equal(executionErrorSummary(p).errorKind,'OPAQUE');
 const cycle=Error('BC_VIEW_STALE');cycle.cause=cycle;assert.equal(executionErrorSummary(cycle).causeChainTruncated,true);
 let chain=Error('E5_LEASE_EXPIRED');for(let n=0;n<8;n++)chain=Error('PRIVATE',{cause:chain});assert.equal(executionErrorSummary(chain).causes.length,3);
});
test('failure log preserves first failure within a fixed bound and observer throws are harmless',()=>{
 const d=createExecutionFailureLog(),e=Error('E5_LEASE_EXPIRED');
 for(let n=0;n<30;n++)observeExecutionFailure(d.record,n===0?'B_PREPARE':'PRIVATE_PHASE',e,{subphase:'PRIVATE'});
 const s=d.snapshot();assert.equal(s.length,16);assert.equal(s[0].phase,'B_PREPARE');assert.equal(s[1].phase,'UNKNOWN_PHASE');assert.equal(JSON.stringify(s).includes('PRIVATE'),false);
 assert.doesNotThrow(()=>observeExecutionFailure(()=>{throw Error('PRIVATE');},'B_PREPARE',e));
});


test('report write failure cannot replace the original normal-payment exception',async()=>{
 const {executeNormalPayment}=await import('../../tools/bootcamp/normal-chain.mjs');
 const original=new TypeError('PRIVATE_ORIGINAL'),report={};let writes=0;
 await assert.rejects(executeNormalPayment({connection:{get configuration(){throw original;},diagnostics:()=>[],metrics:()=>({})},report,write(){writes++;throw Error('PRIVATE_WRITE');}}),e=>e===original);
 assert.equal(writes,1);assert.equal(report.paymentFailure.errorKind,'TYPE_ERROR');assert.equal(report.paymentFailure.step,'VALIDATE');
 assert.equal(JSON.stringify(report).includes('PRIVATE'),false);
});
