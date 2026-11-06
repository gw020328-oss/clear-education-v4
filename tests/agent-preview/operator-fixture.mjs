import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {hash,sourceClauses,reviewModelProposal,buildPlan,validatePlan} from '../../src/agent-preview/index.mjs';
import {prepareGeminiStructureRequest} from '../../src/agent-preview/gemini-preparation.mjs';
import {proposalDto} from '../../src/agent-preview/condition-structuring.mjs';
import {createOperatorPreviewRelay,createOperatorDPort,OPERATOR_PREVIEW_VERSION as version} from '../../src/agent-preview/operator-relay.mjs';
export {version};
export const sourceText='  파이썬 강좌 이수  ';
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const gates={scope:'PRECONFIGURATION_ONLY',automaticEligibility:false,paymentAllowed:false,actualReclaimCall:false,actualPayout:false,dataMode:'DEMO_ACCOUNTS_ONLY'};
export function fixture(t,overrides={}){
  const state={now:1800000000000,mono:0,valid:true,native:true,scopeValid:true,revision:1,authCalls:0,timers:new Map(),calls:[],hook:null};
  const context={token:'a'.repeat(64),wallet:'0x'+'1'.repeat(40),chainId:31337,csrf:'b'.repeat(64)};
  const limits={countTokens:1,generateContent:1,automaticRetries:0,maxInputTokens:4096,maxOutputTokens:2048,
    maximumGenerationCostUsd:'0.0063488',priceCheckedOn:'2026-11-04',priceSource:'https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite'};
  const deployment={artifactHash:'c'.repeat(64),deploymentEpoch:randomUUID(),bindingHash:'d'.repeat(64),model:'gemini-3.5-flash-lite',limitsHash:hash(limits)};
  const expires=state.now+600000;
  const authentication={authorizeWorkflow(ctx,write){state.authCalls++;assert.equal(write,true);
    if(!state.valid||ctx.csrf!==context.csrf||ctx.wallet!==context.wallet||ctx.chainId!==context.chainId||!['a'.repeat(64),'e'.repeat(64)].includes(ctx.token))throw Error('private-auth-detail');
    return {wallet:context.wallet,role:state.role??'operator'};},
    whoami(ctx){this.authorizeWorkflow(ctx,true);return {wallet:context.wallet,role:state.role??'operator',expiresAt:Math.floor(expires/1000)};}};
  const resolveOperatorPreviewScope=()=>({scopeRef:'server-scope-1',authorityRevision:state.revision,expiresAtMs:expires,
    dActor:{institutionId:'demo',courseId:'42',operatorId:'7'},deployment,
    assertCurrent(){if(!state.scopeValid)throw Error('scope-private-detail');}});
  const native={signal:new AbortController().signal,assertCurrent(){if(!state.native)throw Error('native-expired-private-detail');}};
  function reply(operation,body){const p=prepareGeminiStructureRequest(body.sourceText);
    if(operation==='prepare')return {status:200,body:{...gates,version:'clear-external-preview-preparation.1',sourceText:body.sourceText,
      bodyHash:p.bodyHash,sourceHash:p.sourceHash,model:p.model,bindingHash:deployment.bindingHash,limits,actualModelCall:false}};
    const rows=sourceClauses(body.sourceText).map(c=>({quote:c.text,start:c.start,end:c.end,status:'SUPPORTED',capability:'MOODLE_ACTIVITY_COMPLETION.1',question:null}));
    const draft=reviewModelProposal(body.sourceText,rows);
    if(operation==='generate')return {status:200,body:{...gates,version:'clear-external-preview-draft.1',draftId:randomUUID(),expiresAt:state.now+900000,
      draft,proposal:proposalDto(draft),modelCall:{attempted:true,replied:true,execution:'OFFLINE_TEST_TRANSPORT',model:p.model,bodyHash:p.bodyHash,
        succeeded:true,errorCode:null,methods:{countTokens:{invoked:true,replied:true},generateContent:{invoked:true,replied:true}}},
      model:p.model,bodyHash:p.bodyHash,actualModelCall:false,modelProvenance:'OFFLINE_TEST_TRANSPORT'}};
    const reviewed=reviewModelProposal(body.sourceText,rows,body.proposalHash),plan=buildPlan(reviewed);
    return {status:200,body:{...gates,version:'clear-external-preview-observation.1',draftId:body.draftId,proposalHash:body.proposalHash,
      sourceHash:p.sourceHash,plan,validation:validatePlan(plan,reviewed),planScope:'EXISTING_PUBLIC_PLAN_GRAMMAR_ONLY',
      executionBridge:'PENDING_B_C_APPROVED_BINDING_ADAPTER',observation:{targetRef:'synthetic-activity',status:'UNKNOWN',observedAt:Math.floor(state.now/1000),
        executionMode:'OFFLINE_TEST_ADAPTER',eligibility:'NOT_EVALUATED',completionObserved:false}}};
  }
  const dPort=createOperatorDPort({execution:'OFFLINE_TEST_TRANSPORT',request:async(command,{signal})=>{
    const operation=command.path.split('/').at(-1);state.calls.push(command);assert.equal(signal.aborted,false);
    return state.hook?state.hook(operation,command.body,signal):reply(operation,command.body);
  }});
  const relay=createOperatorPreviewRelay({authentication,resolveOperatorPreviewScope,dPort,clock:()=>state.now,monotonic:()=>state.mono,
    setTimer:(fn,ms)=>{const id={fn,ms};state.timers.set(id,id);return id;},clearTimer:id=>state.timers.delete(id),...overrides});
  t.after(()=>relay.close());
  const prepare=(text=sourceText)=>relay.prepare(context,{version,sourceText:text},native);
  const bind=(p,ref='approval_1',end=state.now+120000)=>relay.bindApproval(context,{version,contextRef:p.contextRef,revision:p.revision,
    bodyHash:p.bodyHash,bindingHash:deployment.bindingHash,approvalRef:ref,expiresAt:end},native);
  const generate=p=>relay.generate(context,{version,contextRef:p.contextRef,revision:p.revision,bodyHash:p.bodyHash},native);
  const execute=p=>relay.execute(context,{version,contextRef:p.contextRef,revision:p.revision,draftId:p.generated.draftId,
    proposalHash:p.generated.draft.proposalHash},native);
  const advance=ms=>{state.now+=ms;state.mono+=ms;};
  return {state,context,limits,deployment,authentication,resolveOperatorPreviewScope,native,relay,prepare,bind,generate,execute,reply,advance};
}
