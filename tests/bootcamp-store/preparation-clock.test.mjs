import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {procedureFixture} from './procedure-fixture.mjs';
const prepared=f=>{const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'),{readOnly:true});try{return db.prepare('SELECT record FROM e3_prepared').all().map(r=>JSON.parse(r.record));}finally{db.close();}};
async function fixture(t,change='forward'){
 let f,armed=false,writes=0,checks=0;
 f=await procedureFixture(t,{fault(point){if(armed&&point==='e3-after-prepared'){
  writes++;
  if(change==='source')f.change(app,'activity-complete',{rawAvailable:false});
  if(change==='logout')f.service.logout(f.aliceContext);
  if(change==='signer')f.setSigner(false);
  if(change==='nonce')f.newNonce();
  if(change==='funding')f.setFull(false);
  if(change==='operator-consent-revoked')f.configuration.operatorBindings.splice(0);
  f.setTime(change==='expiry'?until:f.time+(change==='reverse'?-1:1));
 }}});
 const app=f.create();await f.complete(app);f.publish(app);f.consent(app);f.consent(app,f.operatorContext);
 f.configuration.resolveOperatorBindings=()=>f.configuration.operatorBindings;f.restart();
 f.setHook(point=>{if(writes&&point==='authorization'&&(change==='second-conflict'||change==='one-final-crossing'&&checks===0)){checks++;f.setTime(f.time+1);}});
 const body=f.body(app),before=f.counts(),start=f.time,until=f.view(app).evidence.validUntilExclusive,key=f.key();armed=true;
 return {f,app,body,before,start,until,key,run:()=>f.store.prepareReviewAuthorization(f.aliceContext,app,body,key),get writes(){return writes;}};
}
for(const change of ['forward','one-final-crossing'])test('unsigned preparation '+change+' commits once with original issue time and deadline',async t=>{
 const x=await fixture(t,change),result=x.run(),[r]=prepared(x.f);
 assert.equal(x.writes,1);assert.equal(r.payload.message.issuedAt,String(x.start));assert.equal(r.payload.message.expiresAt,String(x.until));
 assert.equal(r.nonceConsumed,false);assert.equal(r.signerActivated,false);assert.equal(x.f.counts().commands,x.before.commands+1);
 assert.equal(x.run().record.operationId,result.record.operationId);assert.equal(x.writes,1);assert.equal(prepared(x.f).length,1);
});
for(const change of ['source','expiry','logout','signer','nonce','funding','reverse','operator-consent-revoked','second-conflict'])test('unsigned preparation '+change+' rolls back without consuming nonce',async t=>{
 const x=await fixture(t,change);assert.throws(x.run,/BC_|AUTH_REQUIRED/);assert.equal(x.writes,1);
 assert.equal(prepared(x.f).length,0);assert.equal(x.f.counts().commands,x.before.commands);
});
