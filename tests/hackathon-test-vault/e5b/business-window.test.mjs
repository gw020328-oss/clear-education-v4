import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBusinessWindow,validateWindowShape} from '../../../src/hackathon-test-vault/e5b/business-window.mjs';
const window={createdAt:1000,sourceUntil:1100,reviewUntil:1300,messageUntil:1080,businessValidUntil:1080};
const observation={business:{application:{firstStartedAt:'700',target:{sourceValidUntilExclusive:'1100'}}}};
const cmd={method:'accept',args:['op',{expiresAt:'1080'}]};
test('B business window preserves source cutoff, message expiry, review cap and independent 120-second envelope limit',()=>{
 validateBusinessWindow(window,cmd,observation,1000);
 for(const patch of [{sourceUntil:1101},{reviewUntil:1301},{messageUntil:1081}])assert.throws(()=>validateBusinessWindow({...window,...patch,businessValidUntil:Math.min(1120,patch.sourceUntil??1100,patch.reviewUntil??1300,patch.messageUntil??1080)},cmd,observation,1000),/E5B_/);
 assert.throws(()=>validateBusinessWindow(window,cmd,observation,1080),/E5B_BUSINESS_EXPIRED/);
 assert.throws(()=>validateWindowShape({...window,businessValidUntil:1200}),/E5B_BUSINESS_BOUND/);
 assert.throws(()=>validateWindowShape({...window,createdAt:1000.5}),/E5B_BUSINESS_TIME/);
});
test('claim and invalidation authority do not inherit an eligibility source or review deadline',()=>{
 const w={createdAt:1000,sourceUntil:null,reviewUntil:null,messageUntil:null,businessValidUntil:1120};
 for(const method of ['claim','terminate','observeCurrent']){validateBusinessWindow(w,{method},observation,1000);assert.throws(()=>validateBusinessWindow({...w,sourceUntil:1050,businessValidUntil:1050},{method},observation,1000),/E5B_NON_ELIGIBILITY_WINDOW/);}
});
