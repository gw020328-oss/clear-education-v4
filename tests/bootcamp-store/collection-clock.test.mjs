import test from 'node:test';
import assert from 'node:assert/strict';
import {storeFixture} from './fixture.mjs';

test('source collection revalidates the same candidate on a forward second before its one write',async t=>{
 let f,calls=0;f=await storeFixture(t,{authority:{recheck(){if(++calls===2)f.setTime(f.time+1);return true;}}});
 const app=f.create(),r=await f.accept(app);assert.ok(r.record.target.evidenceId);assert.equal(f.counts().evidence,1);
});
for(const change of ['expiry','source','logout','reverse'])test('collection before-write '+change+' does not consume evidence nonce',async t=>{
 let f,calls=0;f=await storeFixture(t,{authority:{recheck(){if(++calls===2){if(change==='source')f.change(app,'activity-complete',{rawAvailable:false});else if(change==='logout')f.service.logout(f.aliceContext);else f.setTime(f.time+(change==='expiry'?4000:-1));}return true;}}});
 const app=f.create();await assert.rejects(f.accept(app),/BC_|AUTH|SESSION/);assert.equal(f.counts().evidence,0);
});
