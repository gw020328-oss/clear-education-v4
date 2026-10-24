// Invented owner, wallets, source text, billing designation and model response.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {storeFixture,START} from './fixture.mjs';
import {bootcampFixture,reflectionMock} from '../ai-review-precheck/bootcamp-fixture.mjs';
import {E6_OPERATIONS_HASH} from '../../src/document-precheck/review/e6-leased-reflection.mjs';
import {prepareFirstNormalReflectionPacket,runManagedNormalReflectionOfflineFixture} from '../ai-review-precheck/first-normal-reflection-entry.mjs';
import {openOfflineNormalReflectionRun} from '../../tools/bootcamp/normal-reflection-run.mjs';
import {createNormalReflectionApproval,configureNormalAiAuthority} from '../../tools/bootcamp/normal-reflection-approval.mjs';
import {createNormalReviewReaders} from '../../tools/bootcamp/normal-review-window.mjs';
import {awaitExactReflectionApproval} from '../../tools/bootcamp/normal-host-flow.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const put=(path,value)=>writeFileSync(path,JSON.stringify(value),{mode:0o600});
export async function normalApprovalFixture(t,{approver='operator'}={}){
 const f=await storeFixture(t),app=f.create(),base=join(f.directory,'owner'),directory=join(base,'var/bootcamp-normal-host','normal-offline-window');mkdirSync(directory,{recursive:true,mode:0o700});
 f.configuration.operatorBindings=[{wallet:f.operator.address,courseOperatorRef:'course-operator-demo'}];f.restart();
 mkdirSync(join(base,'artifacts'),{mode:0o700});
 const code={head:'a'.repeat(40),clean:true},day='2026-10-24';
 const config={participantWallet:f.alice.address.toLowerCase(),operatorWallet:f.operator.address.toLowerCase(),
  privacyKeyId:'hr-run.'+randomUUID(),origin:f.config.origin,aiApprovalWallet:null,aiApprovalAuthoritySha256:null};
 const authority={version:'clear-normal-ai-approval-authority.1',kind:'DIRECT_HUMAN_NATIVE_COST_APPROVER_WALLET_DESIGNATION',
  hostName:'normal-offline-window',origin:config.origin,wallet:config[approver==='operator'?'operatorWallet':'participantWallet'],
  codeHead:code.head,scope:'EXACT_GEMINI_ONE_ON_THIS_HOST_NOT_PAYMENT',
  authorization:{kind:'DIRECT_HUMAN_NATIVE_COST_APPROVER_WALLET_DESIGNATION',evidenceSha256:'d'.repeat(64)}};
 const authorityPath=join(f.directory,'invented-direct-owner-designation.json');put(authorityPath,authority);
 const designation=configureNormalAiAuthority({directory,config,sourcePath:authorityPath,codeHead:code.head});
 Object.assign(config,{aiApprovalWallet:designation.wallet,aiApprovalAuthoritySha256:designation.sha256});
 put(join(directory,'host.json'),config);put(join(directory,'run.used.json'),{version:'clear-bootcamp-normal-host-one-run.2',
  hostName:'normal-offline-window',runId:'normal-run-'+randomUUID(),code});
 const source=bootcampFixture();source.clock.value=START*1000;
 Object.assign(source.context,{applicationId:app,participantId:f.view(app).participantId,modelVersion:'gemini-3.5-flash-lite',issuedAtMs:START*1000,expiresAtMs:(START+240)*1000});
 const state={context:source.context,decisionRef:null,messageFormat:2,operationsProfileHash:E6_OPERATIONS_HASH,
  rawAvailable:true,leaseExpiresAtMs:(START+240)*1000};
 const packet=prepareFirstNormalReflectionPacket({context:source.context,text:source.text,decisionRef:null,messageFormat:2,leaseExpiresAtMs:state.leaseExpiresAtMs});
 const capability=openOfflineNormalReflectionRun(base,'normal-offline-window'),binding=capability.bind({packet,context:source.context});
 const prepared={packet,managedRun:binding,codeState:code,day,isCurrent:()=>{
  try{f.service.authorizeWorkflow(f.aliceContext,true);return state.rawAvailable&&f.time*1000<packet.leaseExpiresAtMs;}catch{return false;}
 }};
 put(join(directory,'price-review.json'),{officialSource:'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite',
  reviewedOn:day,inputNanoUsdPerToken:'300',outputIncludingThinkingNanoUsdPerToken:'2500',basis:'PUBLIC_PRICE_REVIEW_NOT_BILLING_AUTHENTICATION'});
 try{await awaitExactReflectionApproval({directory,prepared,onPrepared(){throw Error('OFFLINE_DISPLAY_ONLY');}});}catch(e){if(e.message!=='OFFLINE_DISPLAY_ONLY')throw e;}
 const readers=createNormalReviewReaders({now:()=>f.time});const touch=()=>{readers.observe('PARTICIPANT');readers.observe('OPERATOR');};touch();
 let pending=prepared,fetches=0,keys=0,unknown=false,wireWait=async()=>{};
 const control=createNormalReflectionApproval({directory,config,authorize:(c,w)=>{capability.assertCurrent();return f.service.authorizeWorkflow(c,w);},
  getPreparation:()=>pending,getApplicationId:()=>app,currentCodeState:()=>code,currentDay:()=>day,
  requireReaders:()=>readers.require(),nowMs:()=>f.time*1000});
 const actor=approver==='operator'?f.operatorContext:f.aliceContext;
 const body=()=>{const a=control.brief(actor);return {version:'clear-normal-ai-approval-action.1',applicationId:app,
  bodySha256:a.bodySha256,planHash:a.planHash,contextHash:a.contextHash,runBindingHash:a.runBindingHash,
  codeHead:a.codeHead,model:a.model,action:'APPROVE_THIS_INPUT_ONCE',costAcknowledgment:a.costAcknowledgment};};
 const readApproval=()=>JSON.parse(readFileSync(join(directory,'approval.json')));
 const run=()=>runManagedNormalReflectionOfflineFixture(capability,{packet,approval:readApproval(),codeState:code,day,
  currentCodeState:()=>code,currentDay:()=>day,currentApprovalHash:()=>hash(readApproval()),
  context:source.context,decisionRef:null,messageFormat:2,nowMs:()=>f.time*1000,resolveCurrent:()=>({...state,rawAvailable:prepared.isCurrent()}),
  lease:{isCurrent:()=>state.rawAvailable,async readBody(){return source.text;},release(){}},
  transportOptions:{keyReader:()=>{keys++;return 'invented-offline-provider-key';},fetchImpl:async()=>{
   fetches++;await wireWait();if(unknown)throw Error('invented unknown outcome');
   return new Response(JSON.stringify({modelVersion:'gemini-3.5-flash-lite',usageMetadata:{promptTokenCount:300,candidatesTokenCount:200,totalTokenCount:500,serviceTier:'standard'},
    candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify(await reflectionMock(source).observe())}]}}]}));}}});
 return {f,app,base,directory,code,day,config,authority,authorityPath,source,state,packet,capability,binding,prepared,control,
  readers,touch,actor,body,run,counts:()=>({fetches,keys}),setPending:v=>pending=v,setUnknown:()=>unknown=true,
  setWireWait:fn=>wireWait=fn,
  advance(seconds){if(!Number.isSafeInteger(seconds)||seconds<0)throw Error('FORWARD_SECONDS_ONLY');
   for(let i=0;i<seconds;i++){f.setTime(f.time+1);f.setAuthenticationTime(f.time);source.clock.value=f.time*1000;}}};
}
