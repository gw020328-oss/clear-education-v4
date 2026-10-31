import test from 'node:test';
import assert from 'node:assert/strict';
import {storeFixture} from './fixture.mjs';
import {executionErrorSummary} from '../../src/bootcamp/execution-diagnostics.mjs';
test('producer failure preserves only bounded fixed AI code before outer producer error',async t=>{
 const seen=[];let calls=0;
 const f=await storeFixture(t,{authority:{beforeVerify(){calls++;throw Object.assign(Error('NORMAL_CURRENT'),{data:'private source',cause:Error('private text')});}},store:{onCollectionFailure:x=>seen.push(x)}});
 const app=f.create();await assert.rejects(f.accept(app),/BC_PRODUCER_FAILED/);
 assert.equal(calls,1);assert.equal(seen.length,1);assert.equal(seen[0].phase,'PRODUCER');assert.equal(seen[0].code,'NORMAL_CURRENT');
 assert.doesNotMatch(JSON.stringify(seen),/private/);assert.equal(seen[0].causes[0].code,'UNCLASSIFIED');
 const hostile=new Proxy({},{get(){throw Error('private');}});assert.equal(executionErrorSummary(hostile).code,'UNCLASSIFIED');
});
