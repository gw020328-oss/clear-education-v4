import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet,id,verifyMessage} from 'ethers';
import {createNativeWorkflow,validateNativeWorkflowCommand} from '../../src/embedded-wallet/moodle-native-workflow.mjs';
import {requestMessage,requestHash} from '../../src/hackerrank-evidence/request.mjs';
import {recipientRegistration} from '../../src/bootcamp/recipient-registration.mjs';

function fixture(){
 const w=Wallet.createRandom(),app='application-fixture',now=Math.floor(Date.now()/1000),events=[],commands=[];
 let afterSign=()=>{},active=true,role='participant';
 const config={origin:'https://127.0.0.1:9477',appId:'syntheticapp001',redirectUri:'https://127.0.0.1:9477/local/clearbridge/wallet-return',surface:'MOODLE_NATIVE',phase:'ACTIVE_LOCAL_TEST',chainId:31337,rpcUrl:'http://127.0.0.1:9479',instanceId:id('instance')};
 const sourceExpected={version:'clear-hackerrank-request.1',audience:'synthetic',participantId:'participant-fixture',participantWallet:w.address.toLowerCase(),applicationId:app,criterionId:'python-basic-certificate',policyHash:id('policy'),runtimeMappingHash:id('mapping'),trustConfigHash:id('trust'),recipeHash:id('recipe'),expectedClaimOwner:Wallet.createRandom().address.toLowerCase(),nonce:id('nonce'),issuedAt:now,expiresAt:now+120,selectedCertificateId:null};
 const source={applicationId:app,approvalId:'approval-fixture',requestHash:requestHash(sourceExpected),message:requestMessage(sourceExpected),expiresAt:now+120,purpose:'HACKERRANK_EVIDENCE_OBSERVATION_NOT_PAYMENT_AUTHORIZATION'};
 const payload=recipientRegistration({chainId:31337,verifyingContract:Wallet.createRandom().address,instanceId:config.instanceId,policyHash:id('policy'),runtimeMappingHash:id('mapping'),participant:w.address,applicationSalt:id('salt'),nonce:id('reg-nonce'),deadline:now+100});
 const reg={version:'clear-bootcamp-recipient-registration.1',applicationId:app,role:'PARTICIPANT',status:'AWAITING_SIGNATURE',purpose:'REGISTER_FIXED_RECIPIENT',calldataPublic:true,registrationTargetId:'registration-fixture',payload,signatureAccepted:false,canonical:true,finalized:false,chainStatus:'NOT_REGISTERED',registrationSequence:null,recipient:null,chainApplicationId:payload.message.applicationId,checkpoint:{number:'10',hash:id('block10'),time:String(now)},observedAt:now,applicationRevision:1,ledgerSequence:2,decisionId:'decision-fixture',decisionRevision:1,decisionHash:id('decision')};
 const reflection={version:'clear-normal-exact-ai-approval-display.1',applicationId:app,permitted:true,bodySha256:'a'.repeat(64),planHash:id('plan'),contextHash:id('context'),runBindingHash:id('run'),codeHead:'b'.repeat(40),model:'synthetic-model',costAcknowledgment:'synthetic-cost-ack'};
 const info={version:'clear-bootcamp-normal-session.1',role:'PARTICIPANT',applicationId:app,policyHash:id('policy'),runtimeMappingHash:id('mapping'),sourceMode:'REGISTERED_TEST_SOURCE',receiptRequired:true,expectedPayment:{recipient:w.address},
  signingContext:{source:sourceExpected,registration:{applicationId:app,instanceId:config.instanceId,verifyingContract:payload.domain.verifyingContract,policyHash:id('policy'),runtimeMappingHash:id('mapping'),participant:w.address}},aiApproval:reflection};
 const evidence={conditionsStatus:'UNKNOWN',current:false,validUntilExclusive:null,criteria:['activity-complete','assignment-submitted','reflection-topics','python-basic-certificate'].map(criterionId=>({criterionId,state:'MISSING',current:false,evidenceId:null,originalEvidenceAccessible:false}))};
 const procedure={version:'clear-bootcamp-review-procedure.1',applicationId:app,role:'PARTICIPANT',policyHash:id('policy'),runtimeMappingHash:id('mapping'),applicationRevision:1,ledgerSequence:2,decisionId:'decision-fixture',decisionRevision:1,decisionHash:id('decision'),asOf:now,evidence,funding:{},procedure:{},consent:{records:[]},chain:{acceptedRight:null,transactionState:'NONE',transactionHash:null,blockRef:null},objection:{blocked:false}};
 const operations={...procedure,version:'clear-bootcamp-operations-projection.2',current:true};
 const guard=async()=>{if(!active)throw Error('CANCELLED');};
 const session={async assertSession(){await guard();return{role,wallet:w.address};},async request(path,options={}){
  events.push('GET:'+path.split('?')[0]);assert.equal(options.method??'GET','GET');
  if(path==='/__dev/config')return{version:'clear-bootcamp-frontend-host.1',sourceMode:'REGISTERED_TEST_SOURCE',policyHash:id('policy'),procedureHttpVersion:procedure.version,operationsHttpVersion:operations.version};
  if(path.endsWith('/procedure'))return structuredClone(procedure);
  if(path.endsWith('/operations'))return structuredClone(operations);
  if(path==='/bootcamp/v4/session')return structuredClone({...info,role:role.toUpperCase()});
  if(path.endsWith('/source-signature'))return structuredClone(source);
  if(path.includes('/recipient-registration')){const checkpoint=new URL(path,config.origin).searchParams.get('checkpoint');return{...structuredClone(reg),...(checkpoint?{checkpointContinuity:{status:'CANONICAL_ANCESTOR',from:JSON.parse(checkpoint),to:structuredClone(reg.checkpoint)}}:{})};}
  throw Error('unexpected read');
 }};
 const wallet={pin:{address:w.address,chainId:31337},async personal(message){events.push('wallet');const s=await w.signMessage(message);afterSign();return s;},async typed(p){events.push('wallet');const types={...p.types};delete types.EIP712Domain;const s=await w.signTypedData(p.domain,types,p.message);afterSign();return s;}};
 const command=async input=>{await guard();events.push('grant-and-submit');commands.push(structuredClone(input));
  if(input.path.endsWith('/source-refresh'))return{status:'QUEUED',operationId:'operation-activity'};
  if(input.path.endsWith('/certificate-start'))return{version:'clear-certificate-start-receipt.1',applicationId:app,criterionId:'python-basic-certificate',status:'START_ACCEPTED',paymentAuthorization:false};
  if(input.path.endsWith('/source-signature')){assert.equal(verifyMessage(source.message,input.body.signature),w.address);return{approvalId:source.approvalId,requestHash:source.requestHash,status:'PARTICIPANT_SIGNATURE_ACCEPTED',paymentAuthorization:false};}
  if(input.path.endsWith('/review-consents'))return{version:'clear-bootcamp-procedure-operation.1',record:{applicationId:app,target:{decisionId:input.body.targetDecisionId}},current:true,usableForPayment:false};
  if(input.path.endsWith('/recipient-registration'))return{version:'clear-bootcamp-procedure-operation.1',record:{applicationId:app},current:true,usableForPayment:false};
  if(input.path.endsWith('/reflection-approval'))return{version:'clear-normal-ai-approval-receipt.1',applicationId:app};
  if(input.path==='/bootcamp/v1/applications')return{record:{applicationId:app,operationId:'operation-fixture'},current:true};
  throw Error('unexpected command');
 };
 const flow=createNativeWorkflow({session,wallet,config,command,guard});
 return{flow,events,commands,app,source,reg,reflection,procedure,operations,info,after:fn=>afterSign=fn,cancel:()=>active=false,role:v=>role=v};
}

test('fixed workflow actions reject URLs, extra fields and missing command keys before I/O',()=>{
 for(const input of [{action:'fetch',url:'/auth/session'},{action:'read-session',url:'/x'},{action:'create-application'},
  {action:'read-application',applicationId:'../other'},{action:'consent',reviewed:{},value:'AUTO',idempotencyKey:'one'}])assert.throws(()=>validateNativeWorkflowCommand(input));
});
test('source review remains in Moodle and only the exact reviewed request can be signed and submitted',async()=>{
 const f=fixture(),reviewed=await f.flow.run({action:'read-source-signature',applicationId:f.app});
 assert.equal(f.commands.length,0);assert(!f.events.includes('wallet'));
 await assert.rejects(f.flow.run({action:'approve-source-signature',reviewed:{...reviewed,message:'replacement'}}),/SOURCE_REVIEW_REQUIRED/);
 const result=await f.flow.run({action:'approve-source-signature',reviewed});
 assert.equal(result.status,'PARTICIPANT_SIGNATURE_ACCEPTED');assert.equal(result.signature,undefined);
 assert.equal(f.commands.length,1);assert(f.events.indexOf('wallet')<f.events.indexOf('grant-and-submit'));
 assert.equal(f.commands[0].idempotencyKey,null);assert.deepEqual(Object.keys(f.commands[0].body),['approvalId','signature']);
 await assert.rejects(f.flow.run({action:'approve-source-signature',reviewed}),/SOURCE_REVIEW_REQUIRED/);
});
for(const kind of ['cancel','source','role'])test('source '+kind+' change while wallet prompt is open prevents command grant',async()=>{
 const f=fixture(),reviewed=await f.flow.run({action:'read-source-signature',applicationId:f.app});
 f.after(()=>{if(kind==='cancel')f.cancel();if(kind==='source')f.source.approvalId='approval-replaced';if(kind==='role')f.role('operator');});
 await assert.rejects(f.flow.run({action:'approve-source-signature',reviewed}));assert.equal(f.commands.length,0);
});
test('registration reuses existing typed signer and CAS serializer; grant follows wallet approval',async()=>{
 const f=fixture(),reviewed=await f.flow.run({action:'read-registration'});
 assert.equal(f.commands.length,0);await f.flow.run({action:'approve-registration',reviewed});
 assert.equal(f.commands.length,1);assert(f.events.indexOf('wallet')<f.events.indexOf('grant-and-submit'));
 assert.equal(f.commands[0].body.registrationTargetId,reviewed.registrationTargetId);
 assert.equal(f.commands[0].body.targetDecisionHash,reviewed.decisionHash);
 await assert.rejects(f.flow.run({action:'approve-registration',reviewed}),/REVIEW_REQUIRED/);
});
test('registration decision change after signature refuses submit',async()=>{
 const f=fixture(),reviewed=await f.flow.run({action:'read-registration'});f.after(()=>f.reg.ledgerSequence++);
 await assert.rejects(f.flow.run({action:'approve-registration',reviewed}),/REGISTRATION_STALE/);assert.equal(f.commands.length,0);
});
test('AI review is explicit, uses exact current input, and never calls an AI provider',async()=>{
 const f=fixture(),reviewed=(await f.flow.run({action:'read-session'})).aiApproval;
 assert.equal(f.commands.length,0);
 f.reflection.permitted=false;
 await assert.rejects(f.flow.run({action:'approve-reflection',reviewed,idempotencyKey:'approval-stale'}),
  {message:'AI_REVIEW_CHANGED',outcome:'NOT_SENT'});
 assert.equal(f.commands.length,0);
 f.reflection.permitted=true;
 const refreshed=(await f.flow.run({action:'read-session'})).aiApproval;
 f.reflection.planHash=id('changed');await assert.rejects(f.flow.run({action:'approve-reflection',reviewed:refreshed,idempotencyKey:'approval-one'}),/AI_REVIEW_CHANGED/);
 assert.equal(f.commands.length,0);
 const current=(await f.flow.run({action:'read-session'})).aiApproval;
 await f.flow.run({action:'approve-reflection',reviewed:current,idempotencyKey:'approval-two'});
 assert.equal(f.commands.length,1);assert.equal(f.commands[0].body.action,'APPROVE_THIS_INPUT_ONCE');assert(!f.events.includes('wallet'));
});

test('consent keeps the reviewed decision and exact CAS body; fresh ledger changes require a new review',async()=>{
 const f=fixture(),reviewed=await f.flow.run({action:'read-application',applicationId:f.app});
 f.procedure.ledgerSequence++;f.operations.ledgerSequence++;
 await assert.rejects(f.flow.run({action:'consent',reviewed,value:'AGREE',idempotencyKey:'consent-old'}),/CONSENT_REVIEW_CHANGED/);
 assert.equal(f.commands.length,0);
 const current=await f.flow.run({action:'read-application',applicationId:f.app});
 await f.flow.run({action:'consent',reviewed:current,value:'AGREE',idempotencyKey:'consent-new'});
 assert.deepEqual(f.commands[0].body,{...current.target,value:'AGREE'});
 await assert.rejects(f.flow.run({action:'consent',reviewed:current,value:'AGREE',idempotencyKey:'consent-repeat'}),/CONSENT_REVIEW_REQUIRED/);
});

test('source approval ID changes before prompting require a fresh review even when message is unchanged',async()=>{
 const f=fixture(),reviewed=await f.flow.run({action:'read-source-signature',applicationId:f.app});
 f.source.approvalId='approval-replaced';
 await assert.rejects(f.flow.run({action:'approve-source-signature',reviewed}),/SOURCE_STALE/);
 assert(!f.events.includes('wallet'));assert.equal(f.commands.length,0);
});

test('refresh activity uses the current participant session and the fixed command route without signing',async()=>{
 const f=fixture(),action={action:'refresh-activity',applicationId:f.app,expectedRevision:1,idempotencyKey:'activity-one'};
 await assert.rejects(f.flow.run(action),/MOODLE_ACTIVITY_UNAVAILABLE/);
 f.info.conditionTargets={applicationId:f.app,targets:[{criterionId:'activity-complete'}]};
 f.role('operator');
 await assert.rejects(f.flow.run(action),/MOODLE_ACTIVITY_UNAVAILABLE/);
 f.role('participant');
 assert.deepEqual(await f.flow.run(action),{status:'QUEUED',operationId:'operation-activity'});
 assert.deepEqual(f.commands,[{method:'POST',path:'/bootcamp/v4/applications/'+f.app+'/source-refresh',
  body:{criterionId:'activity-complete',expectedRevision:1},idempotencyKey:'activity-one'}]);
 assert(!f.events.includes('wallet'));
});

test('certificate start needs authoritative matching stage and readiness; session reads do not write or sign',async()=>{
 const f=fixture(),command={action:'start-certificate',applicationId:f.app,expectedRevision:1,idempotencyKey:'cert-one'};
 await f.flow.run({action:'read-session'});assert.equal(f.commands.length,0);
 await assert.rejects(f.flow.run(command),/MOODLE_CERTIFICATE_UNAVAILABLE/);
 f.info.phase='SOURCE_python-basic-certificate';
 await assert.rejects(f.flow.run(command),/MOODLE_CERTIFICATE_UNAVAILABLE/);
 f.info.certificate={applicationId:f.app,criterionId:'python-basic-certificate',startAllowed:true};
 const result=await f.flow.run(command);assert.equal(result.status,'START_ACCEPTED');
 assert.equal(f.commands.length,1);assert(!f.events.includes('wallet'));
 assert.equal(f.commands[0].path,'/bootcamp/v4/applications/'+f.app+'/certificate-start');
 assert.deepEqual(f.commands[0].body,{expectedRevision:1});
 f.role('operator');await assert.rejects(f.flow.run(command),/MOODLE_CERTIFICATE_UNAVAILABLE/);f.role('participant');
 for(const patch of [{phase:'SOURCE_activity-complete'},
  {certificate:{...f.info.certificate,startAllowed:false}},{certificate:{...f.info.certificate,applicationId:'other'}}]){
  const saved={...f.info};Object.assign(f.info,patch);
  await assert.rejects(f.flow.run(command),/MOODLE_CERTIFICATE_UNAVAILABLE/);Object.assign(f.info,saved);
 }
 assert.equal(f.commands.length,1);
});
