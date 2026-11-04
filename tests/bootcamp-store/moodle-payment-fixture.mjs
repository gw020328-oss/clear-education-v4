import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {procedureFixture,START} from './procedure-fixture.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {openMoodlePaymentSnapshots} from '../../src/bootcamp/moodle-payment-snapshot.mjs';
import {createMoodlePaymentReader} from '../../src/bootcamp/moodle-payment-projection.mjs';
const H=x=>p0Hash('OFFLINE-MOODLE-PAYMENT',x);
export async function paymentFixture(t){
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);
 const app=f.store.getApplication(f.aliceContext,a),v=f.store.getOperationsProjection(f.aliceContext,a);
 const path=join(f.directory,'bootcamp.sqlite');let wall=f.time,mono=0,authorityEpoch=1,authorityRef='moodle-authority-1',role='PARTICIPANT',clearContext=f.aliceContext,available=true,scopeExpiry=START+1000;
 const mapping={mappingRevision:1,installationRef:'installed-moodle',courseRef:'course-fixed',subjectRef:'subject-fixed',bApplicationId:H('B-application'),bindingRef:'binding-fixed',bindingRevision:1,
  bindingExpiresAtExclusive:START+3000,applicationId:a,participantId:app.participantId,courseOperatorRef:'course-operator-demo',policyHash:v.policyHash,runtimeMappingHash:v.runtimeMappingHash,
  participantWallet:f.alice.address.toLowerCase(),operatorWallet:f.operator.address.toLowerCase(),recipient:f.alice.address.toLowerCase(),token:'0x'+'33'.repeat(20),expiresAtExclusive:START+2000};
 const checkpoint={hash:H('block'),number:'12',time:String(START+2)},runtimeHash=H('runtime');
 const report={applicationId:a,recipient:mapping.recipient,runtimeMappingHash:mapping.runtimeMappingHash,chainApplicationId:H('chain-app'),sourceMode:'SYNTHETIC_TEST_SOURCE',realSourceVerified:false,
  reviewTarget:{applicationId:a,policyHash:mapping.policyHash,runtimeMappingHash:mapping.runtimeMappingHash,decisionId:v.decisionId,decisionRevision:v.decisionRevision,decisionHash:v.decisionHash,allocationId:'allocation-offline'},
  stages:[{kind:'ACCEPT',txHash:H('accept'),checkpoint:{hash:H('accept-block'),number:'10',time:String(START)}}],claim:{txHash:H('claim'),checkpoint,amountAtoms:'100000000'},completed:true};
 const receipt={version:'clear-e5b-direct-claim-receipt.1',runtimeHash,applicationId:report.chainApplicationId,txHash:report.claim.txHash,status:'INCLUDED',checkpoint,
  recipient:mapping.recipient,token:mapping.token,amountAtoms:'100000000',finalized:false,allocationId:H('allocation'),authorizationDigest:H('auth'),
  observation:{runtimeHash,checkpoint,business:{applicationId:report.chainApplicationId,application:{state:'6',recipient:mapping.recipient,target:{decisionHash:v.decisionHash,revision:String(v.decisionRevision)}},
   right:{recipient:mapping.recipient,token:mapping.token,amountAtoms:'100000000',allocationId:H('allocation'),authorizationDigest:H('auth')}}}};
 const snapshots=openMoodlePaymentSnapshots({databasePath:path,authentication:f.service,resolveOperatorBindings:()=>f.configuration.operatorBindings,now:()=>wall});t.after(()=>snapshots.close());
 const handle=Object.freeze({serverOnly:true});let calls=0,onRead=async()=>structuredClone(receipt),resolveHook=()=>{};
 const resolveScope=async h=>{assert.equal(h,handle);resolveHook();if(!available)throw Error('B_CURRENTNESS_UNAVAILABLE');return {requestRef:'request-fixed',authorityRef,authorityEpoch,expiresAtExclusive:scopeExpiry,mapping,
  role,clearContext};};
 const options={mapping,resolveScope,authentication:f.service,snapshots,receiptSource:{runtimeHash,selfAttestor:null,readReport:()=>report,readCanonicalClaim:async()=>{calls++;return onRead();}},now:()=>wall,monotonic:()=>mono};
 const reader=createMoodlePaymentReader(options);
 const dump=()=>{const db=new DatabaseSync(path,{readOnly:true});try{return Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(({name})=>[name,db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()]));}finally{db.close();}};
 return {f,a,path,mapping,report,receipt,snapshots,options,reader,handle,dump,calls:()=>calls,
  onRead:fn=>{onRead=fn;},resolveHook:fn=>{resolveHook=fn;},epoch:()=>{authorityEpoch++;},authority:ref=>{authorityRef=ref;},unavailable:()=>{available=false;},
  operator:()=>{role='COURSE_OPERATOR';clearContext=f.operatorContext;},useParticipantSession:()=>{clearContext=f.aliceContext;},
  scopeExpiry:n=>{scopeExpiry=n;},setWall:n=>{wall=n;},setMono:n=>{mono=n;},bytes:()=>readFileSync(path),authBytes:()=>readFileSync(join(f.config.directory,'applications.sqlite'))};
}
