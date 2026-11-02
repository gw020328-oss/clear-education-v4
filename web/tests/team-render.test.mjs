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

test('application polling preserves consent control identity; target, own consent and unknown outcome changes redraw',()=>{
 let draws=0,tree;const paint=createPreparationRenderer({draw(){tree={id:++draws};},update(){}});
 const data={state:{bootstrap:{role:'OPERATOR'},view:{observedAt:100,target:{targetDecisionId:'one'},consent:{records:[]}},busy:false},availability:{ai:{code:'WAIT'},consent:{code:'READY',enabled:true,reason:'review'}},packet:null,ack:null};paint(data);const first=tree;
 data.state.view.observedAt=101;data.state.busy=true;paint(data);assert.equal(tree,first);
 data.state.busy=false;data.state.reviewWindow={reviewMs:50000};paint(data);assert.equal(tree,first);
 data.state.view.consent.records=[{actorRole:'COURSE_OPERATOR',value:'AGREE'}];paint(data);assert.notEqual(tree,first);
 const agreed=tree;data.state.view.target.targetDecisionId='two';paint(data);assert.notEqual(tree,agreed);
 data.state.view=null;data.state.consentReplayPending=true;paint(data);assert.equal(draws,4);
});

test('an in-flight read clearing its internal view never detaches the displayed consent control; final failures do',()=>{
 let tree,draws=0,disabled=false;const paint=createPreparationRenderer({draw(){tree={id:++draws}},update:({state})=>{disabled=state.busy}});
 const view={observedAt:100,target:{id:'one'}},data={state:{bootstrap:{role:'OPERATOR'},view,busy:false},availability:{ai:{code:'WAIT'},consent:{code:'READY'}}};paint(data);const original=tree;
 data.state.busy=true;data.state.view=null;data.availability.consent={code:'CONSENT_VIEW_REQUIRED'};paint(data);assert.equal(tree,original);assert.equal(disabled,true);
 data.state.busy=false;data.state.view={...view,observedAt:101};data.availability.consent={code:'READY'};paint(data);assert.equal(tree,original);assert.equal(disabled,false);
 data.state.view=null;data.state.error={code:'AUTH_REQUIRED'};paint(data);assert.notEqual(tree,original);assert.equal(draws,2);
});
