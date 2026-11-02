import test from 'node:test';import assert from 'node:assert/strict';
import {id} from 'ethers';
import {procedureFixture} from './procedure-fixture.mjs';
import {readRecipientRegistration} from '../../src/bootcamp/recipient-registration-ui.mjs';
for(const kind of ['forward','repeat','reverse'])test('registered observation real store '+kind+' clock boundary preserves original target without RPC replay',async t=>{
 const f=await procedureFixture(t),registration=f.configuration.procedurePorts.registration;f.configuration.procedurePorts.registration=(...args)=>({...registration(...args),version:'clear-bootcamp-procedure-registration-port.2'});f.restart();const app=f.create();await f.complete(app);f.store.registerCurrentMetForE4(f.aliceContext,app,f.body(app),f.key());
 const original=f.store.getRecipientRegistration(f.aliceContext,app),before=f.counts(),base=f.configuration.now;let armed=false,ticks=0;
 f.configuration.now=()=>{if(armed){ticks++;if(ticks===2||kind==='repeat'&&ticks===6)f.setTime(f.time+(kind==='reverse'?-1:1));}return base();};f.restart();
 let rpc=0,proof=0;const checkpoint={number:'10',hash:id('checkpoint'),time:String(f.time)};
 const connection={async refresh(){rpc++;},recipientRegistrationState:()=>({chainStatus:'NOT_REGISTERED',canonical:true,checkpoint}),async verifyRecipientRegistrationCheckpoint(){proof++;}};
 armed=true;const promise=readRecipientRegistration({store:f.store,connection,context:f.aliceContext,applicationId:app,authorize:c=>f.service.authorizeWorkflow(c,false),checkpoint});
 if(kind==='forward'){const r=await promise;assert.equal(r.payload.message.deadline,original.payload.message.deadline);assert.equal(r.payload.message.nonce,original.payload.message.nonce);assert.equal(r.registrationTargetId,original.registrationTargetId);assert.equal(rpc,1);assert.equal(proof,1);}
 else{await assert.rejects(promise,/BC_VIEW_STALE|BC_CLOCK_REVERSED/);assert.equal(rpc,0);assert.equal(proof,0);}
 armed=false;assert.equal(f.counts().commands,before.commands);
});
