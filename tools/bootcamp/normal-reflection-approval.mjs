// Existing native cost approver's explicit wallet delegation, for one test host.
// A course role alone never grants provider billing or external-transmission authority.
import {existsSync} from 'node:fs';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {exactKeys,requireRule as check} from '../../src/policy/values.mjs';
import {readPrivate,atomicPrivate} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
import {validateNormalReflectionClearance,NORMAL_REFLECTION_COST_ACK} from '../../src/document-precheck/review/fixed-normal-reflection.mjs';
import {requireNormalModelWindow,REVIEW_WINDOW} from './normal-review-window.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const AUTHORITY_KIND='DIRECT_HUMAN_NATIVE_COST_APPROVER_WALLET_DESIGNATION';
const AUTHORITY_SCOPE='EXACT_GEMINI_ONE_ON_THIS_HOST_NOT_PAYMENT';
export const NORMAL_REFLECTION_SOURCE_SCOPE='ONE_GENERATED_LOCAL_MOODLE_DEMO_REFLECTION_BODY_MAX_2048_UTF8_BYTES_THREE_REQUIRED_TOPICS';
const read=path=>JSON.parse(readPrivate(path));

function validateAuthority(a,{hostName,config,codeHead}){
  exactKeys(a,['version','kind','hostName','origin','wallet','codeHead','scope','authorization'],'NORMAL_HOST_AI_APPROVAL_AUTHORITY');
  exactKeys(a.authorization,['kind','evidenceSha256'],'NORMAL_HOST_AI_APPROVAL_AUTHORITY');
  check(a.version==='clear-normal-ai-approval-authority.1'&&a.kind===AUTHORITY_KIND&&a.hostName===hostName
    &&a.origin===config.origin&&a.scope===AUTHORITY_SCOPE&&a.codeHead===codeHead&&/^[a-f0-9]{40}$/.test(a.codeHead)
    &&typeof a.wallet==='string'&&/^0x[0-9a-f]{40}$/.test(a.wallet)
    &&[config.participantWallet,config.operatorWallet].includes(a.wallet)
    &&a.authorization.kind===AUTHORITY_KIND&&/^[a-f0-9]{64}$/.test(a.authorization.evidenceSha256??''),
    'NORMAL_HOST_AI_APPROVAL_AUTHORITY');return a;
}
export function configureNormalAiAuthority({directory,config,sourcePath,codeHead}){
  const authority=validateAuthority(read(sourcePath),{hostName:basename(directory),config,codeHead});
  const path=join(directory,'ai-approval-authority.json');
  if(existsSync(path))check(hash(read(path))===hash(authority),'NORMAL_HOST_AI_APPROVAL_AUTHORITY_IMMUTABLE');
  else atomicPrivate(path,authority,{exclusive:true});
  return {wallet:authority.wallet,sha256:hash(authority)};
}
export function readNormalAiAuthority({directory,config,codeHead}){
  check(config.aiApprovalWallet&&config.aiApprovalAuthoritySha256,'BC_NORMAL_AI_AUTHORITY_REQUIRED');
  const a=validateAuthority(read(join(directory,'ai-approval-authority.json')),{hostName:basename(directory),config,codeHead});
  check(a.wallet===config.aiApprovalWallet&&hash(a)===config.aiApprovalAuthoritySha256,'BC_NORMAL_AI_AUTHORITY_REQUIRED');return a;
}

export function createNormalReflectionApproval({directory,config,authorize,getPreparation,getApplicationId,
  currentCodeState,currentDay,requireReaders,nowMs=()=>Date.now()}){
  const paths={request:join(directory,'approval-request.json'),template:join(directory,'approval-template.json'),
    approval:join(directory,'approval.json'),evidence:join(directory,'human-ai-approval-evidence.json'),
    spent:join(directory,'ai-reflection/spent.paid-wire.v3.lock')};
  function current(){
    const preparation=getPreparation();check(preparation&&preparation.isCurrent(),'BC_LIVE_AI_PREPARATION_STALE');
    const request=read(paths.request),template=read(paths.template),m=request.managedRun,p=request.packet;
    check(request.sourceScope===NORMAL_REFLECTION_SOURCE_SCOPE
      &&hash(read(join(directory,'price-review.json')))===request.pricingReview?.evidenceSha256,'BC_NORMAL_AI_APPROVAL_TARGET');
    check(m?.applicationId===getApplicationId()&&m?.hostName===basename(directory)
      &&m?.participantWallet===config.participantWallet&&m?.bindingHash===template.runBindingHash
      &&hash(m)===hash(preparation.managedRun)&&hash(p)===hash(preparation.packet)
      &&hash(read(join(directory,'ai-reflection-binding.json')))===hash(m),'BC_NORMAL_AI_APPROVAL_TARGET');
    return {preparation,request,template,m,p};
  }
  return Object.freeze({
    brief(context){
      const actor=authorize(context,false),code=currentCodeState();let authority=null;
      try{authority=readNormalAiAuthority({directory,config,codeHead:code.head});}catch{}
      if(!getPreparation()||!existsSync(paths.request)||!existsSync(paths.template))return null;
      const {preparation,request,m,p}=current(),partial=existsSync(paths.evidence)&&!existsSync(paths.approval),
        recorded=existsSync(paths.approval)||partial||existsSync(paths.spent);
      const approvalWindowEndsAtMs=Math.min(preparation.approvalWindowEndsAtMs??Infinity,p.leaseExpiresAtMs-REVIEW_WINDOW.beforeModelSeconds*1000);
      const remainingMs=approvalWindowEndsAtMs-nowMs();
      let screensReady=false;try{requireReaders();screensReady=true;}catch{}
      return Object.freeze({version:'clear-normal-exact-ai-approval-display.1',applicationId:m.applicationId,
        hostRunId:m.runId,bodySha256:p.bodySha256,inputHash:p.inputHash,planHash:p.planHash,contextHash:p.contextHash,
        runBindingHash:m.bindingHash,codeHead:code.head,model:p.model,sourceScope:request.sourceScope,
        sourceBodyMaxUtf8Bytes:2048,totalRequestMaxUtf8Bytes:8192,maxOutputTokens:1024,thinkingLevel:'MINIMAL',
        maxGenerationCalls:1,maxCountCalls:0,automaticRetries:0,continuations:0,fallbacks:0,
        scenarioUsd:'0.00346',hardCashCapVerified:false,invoiceVerified:false,costAcknowledgment:NORMAL_REFLECTION_COST_ACK,
        paymentConsentIncluded:false,leaseExpiresAtMs:p.leaseExpiresAtMs,observedAtMs:nowMs(),
        approvalWindowEndsAtMs,
        minimumRemainingBeforeModelSeconds:REVIEW_WINDOW.beforeModelSeconds,
        authorityConfigured:!!authority,approvalWallet:authority?.wallet??null,reviewScreensReady:screensReady,
        permitted:!!authority&&actor.wallet.toLowerCase()===authority.wallet&&!recorded&&screensReady
          &&remainingMs>=0,
        status:partial?'PARTIAL_STOPPED':recorded?'RECORDED':remainingMs<0?'INSUFFICIENT_REVIEW_WINDOW':'WAITING'});
    },
    approve(context,applicationId,body,key){
      const actor=authorize(context,true),code=currentCodeState();
      const authority=readNormalAiAuthority({directory,config,codeHead:code.head});
      check(actor.wallet.toLowerCase()===authority.wallet,'FORBIDDEN');
      exactKeys(body,['version','applicationId','bodySha256','planHash','contextHash','runBindingHash','codeHead','model','action','costAcknowledgment'],'BC_NORMAL_AI_APPROVAL_BODY');
      check(typeof key==='string'&&/^[a-z][a-z0-9.-]{0,79}$/.test(key),'BC_IDEMPOTENCY_KEY');
      check(applicationId===getApplicationId()&&body.applicationId===applicationId,'BC_NORMAL_AI_APPROVAL_TARGET');
      check(![paths.approval,paths.evidence,paths.spent].some(existsSync),'BC_NORMAL_AI_APPROVAL_ALREADY_RECORDED');
      const {preparation,request,template,m,p}=current();
      check(body.version==='clear-normal-ai-approval-action.1'&&body.action==='APPROVE_THIS_INPUT_ONCE'
        &&body.bodySha256===p.bodySha256&&body.planHash===p.planHash&&body.contextHash===p.contextHash
        &&body.runBindingHash===m.bindingHash&&body.codeHead===code.head&&body.model===p.model
        &&body.costAcknowledgment===NORMAL_REFLECTION_COST_ACK,'BC_NORMAL_AI_APPROVAL_TARGET');
      requireReaders();requireNormalModelWindow(preparation,nowMs());
      const evidence={version:'clear-normal-direct-human-ai-approval-evidence.2',kind:'AUTHENTICATED_EXPLICIT_TEST_UI_ACTION',
        authorizedByNativeCostApproverDesignation:true,authorityRecordSha256:config.aiApprovalAuthoritySha256,
        nativeAuthorityEvidenceSha256:authority.authorization.evidenceSha256,approvedByWallet:actor.wallet.toLowerCase(),
        receivedAt:new Date(nowMs()).toISOString(),applicationId,runId:m.runId,bodySha256:p.bodySha256,
        planHash:p.planHash,contextHash:p.contextHash,runBindingHash:m.bindingHash,model:p.model,
        sourceScope:request.sourceScope,maxGenerationCalls:1,maxCountCalls:0,automaticRetries:0,
        continuations:0,fallbacks:0,sourceBodyMaxUtf8Bytes:2048,totalRequestMaxUtf8Bytes:8192,maxOutputTokens:1024,
        scenarioUsd:'0.00346',hardCashCapVerified:false,paymentConsentIncluded:false,leaseExpiresAtMs:p.leaseExpiresAtMs,
        requestKeyHash:hash(key)};
      const approval={...template,authorization:{kind:'DIRECT_HUMAN_FRESH_NORMAL_ONE',evidenceSha256:hash(evidence)}};
      validateNormalReflectionClearance({packet:p,approval,codeState:code,day:currentDay()});
      // Synchronous exclusive writes; a partial failure is retained and cannot be retried into a new grant.
      try{atomicPrivate(paths.evidence,evidence,{exclusive:true});atomicPrivate(paths.approval,approval,{exclusive:true});}
      catch{check(false,'BC_NORMAL_AI_APPROVAL_RECORD_FAILED');}
      return {version:'clear-normal-ai-approval-receipt.1',applicationId,runBindingHash:m.bindingHash,
        status:'RECORDED',maxGenerationCalls:1,paymentConsentIncluded:false};
    },
  });
}
