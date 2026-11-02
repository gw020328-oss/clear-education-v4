import test from 'node:test';import assert from 'node:assert/strict';
import {createPreparationRenderer} from '../src/bootcamp/team-render.js';
test('poll busy/timing updates preserve the exact control instance; new reviewed targets replace it',()=>{
 let tree,draws=0,updates=0;const render=createPreparationRenderer({draw(){tree={id:++draws};},update(){updates++;}});
 const data={state:{applicationId:'app',bootstrap:{role:'PARTICIPANT',aiApproval:{planHash:'plan',bodySha256:'body',observedAtMs:10}},busy:false,aiApprovalRemainingMs:1000},packet:null,ack:'plan',availability:{ai:{code:'READY',enabled:true,reason:'ready'}}};
 render(data);const original=tree;
 data.state.busy=true;data.state.bootstrap.aiApproval.observedAtMs=20;data.state.aiApprovalRemainingMs=500;render(data);assert.equal(tree,original);
 data.state.busy=false;render(data);assert.equal(tree,original);assert.equal(draws,1);assert.equal(updates,3);
 data.state.bootstrap.aiApproval.bodySha256='changed';render(data);assert.notEqual(tree,original);assert.equal(draws,2);
 const changed=tree;data.availability.ai={code:'EXPIRED',enabled:false,reason:'expired'};render(data);assert.notEqual(tree,changed);
 data.packet={status:'AWAITING_SIGNATURE',registrationTargetId:'new'};render(data);assert.equal(draws,4);
 data.state.error={code:'AUTH_REQUIRED'};render(data);assert.equal(draws,5);
});
