import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFrom} from '../src/bootcamp/criteria.js';
test('unavailable raw HTTP does not assert retention expiry',()=>{
 const r=collectionFrom({originalEvidence:{authorized:true,httpAvailable:false}});
 assert.equal(r.originalExpired,false);assert.match(r.originalUnavailableReason,/API가 제공되지/);assert.doesNotMatch(r.originalUnavailableReason,/기한 경과/);
});
test('permission denial and explicit expiry remain distinct',()=>{
 assert.match(collectionFrom({originalEvidence:{authorized:false,httpAvailable:false}}).originalUnavailableReason,/권한/);
 assert.match(collectionFrom({originalEvidence:{authorized:true,httpAvailable:false,expired:true}}).originalUnavailableReason,/기한 경과/);
 assert.equal(collectionFrom({}).originalUnavailableReason,null);
});
