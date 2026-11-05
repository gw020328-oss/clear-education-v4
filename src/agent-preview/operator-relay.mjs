// Unmounted operator relay. All authority and transport ports are owner-supplied.
import {randomUUID} from 'node:crypto';
import {hash, reviewModelProposal, buildPlan} from './index.mjs';
import {prepareGeminiStructureRequest} from './gemini-preparation.mjs';
import {proposalDto} from './condition-structuring.mjs';

export const OPERATOR_PREVIEW_VERSION = 'clear-operator-preview.1';
const errors = new WeakMap();
const fail = code => {const e = new Error(code); errors.set(e,code); throw e;};
const check = (ok, code='PREVIEW_INVALID') => {if (!ok) fail(code);};
const exact = (v, keys) => check(v && Object.getPrototypeOf(v) === Object.prototype
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k)));
const freeze = v => {if(v && typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const copy = v => {hash(v);return structuredClone(v);};
const hex = v => typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
const opaque = v => typeof v==='string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
const positive = v => Number.isSafeInteger(v) && v>0;
const sync = fn => {const v=fn();if(v && typeof v.then==='function'){Promise.resolve(v).catch(()=>{});fail('PREVIEW_UNAVAILABLE');}return v;};
const gates = Object.freeze({scope:'PRECONFIGURATION_ONLY',automaticEligibility:false,paymentAllowed:false});
const paths = Object.freeze({prepare:'/v1/preview/prepare',generate:'/v1/preview/generate',execute:'/v1/preview/execute'});
const dGates = ['scope','automaticEligibility','paymentAllowed','actualReclaimCall','actualPayout','dataMode'];
const dErrors = new Set(['AUTH_REQUIRED','HOST_REJECTED','SERVER_TO_SERVER_ONLY','REQUEST_REPLAY','INVALID_FIELDS','ACTOR_SCOPE',
  'SOURCE_INVALID','APPROVAL_INVALID','APPROVAL_REQUIRED_OR_SPENT','APPROVAL_EXPIRED','BUSY','DRAFT_LIMIT','INPUT_TOKEN_LIMIT',
  'DRAFT_STALE_OR_UNREVIEWED','DRAFT_NOT_READY','PLAN_REJECTED','ACTUAL_TOOL_NOT_ENABLED','OBSERVATION_ADAPTER_NOT_ACCEPTED',
  'OBSERVATION_INVALID','BODY_LIMIT','CONTENT_TYPE','ROUTE_NOT_FOUND','GEMINI_RATE_LIMIT','GEMINI_BILLING_ERROR',
  'GEMINI_HTTP_FAILURE','GEMINI_NETWORK_FAILURE','GEMINI_REQUEST_ABORTED','REQUEST_REJECTED']);
export function operatorPreviewFailure(error) {
  return freeze({version:OPERATOR_PREVIEW_VERSION,...gates,stage:'FAILED',
    failure:{kind:'RELAY',code:errors.get(error)??'PREVIEW_REJECTED'}});
}
// The callback is an existing authenticated server-to-server transport. No URL,
// HMAC key, credentials, approval registration or network implementation lives here.
export function createOperatorDPort({request,execution}={}) {
  return Object.freeze({execution,call(operation,body,{signal}={}) {
    check(typeof request==='function' && ['ACTUAL','OFFLINE_TEST_TRANSPORT'].includes(execution),'PREVIEW_UNAVAILABLE');
    check(Object.hasOwn(paths,operation));
    exact(body,['institutionId','courseId','operatorId','sourceText',
      ...(operation==='generate'?['approvalRef']:operation==='execute'?['draftId','proposalHash']:[])]);
    return request(freeze({method:'POST',path:paths[operation],body:copy(body)}),{signal});
  }});
}
// Empty the callbacks on abort; a noncooperative transport must not retain our
// continuation through its unresolved promise. No retry or detached work is started.
function bounded(promise,signal) {
  return new Promise((resolve,reject)=>{
    const cell={resolve,reject};resolve=null;reject=null;
    const finish=(ok,value)=>{const fn=ok?cell.resolve:cell.reject;if(!fn)return;
      cell.resolve=cell.reject=null;signal.removeEventListener('abort',abort);fn(value);};
    const abort=()=>finish(false,signal.reason);
    Promise.resolve(promise).then(v=>finish(true,v),e=>finish(false,e));
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  });
}
function safeDReply(reply) {
  reply=copy(reply);exact(reply,['status','body']);
  check(Number.isInteger(reply.status) && reply.status>=200 && reply.status<=599,'D_RESPONSE_INVALID');
  check(Buffer.byteLength(JSON.stringify(reply))<=131072,'D_RESPONSE_INVALID');
  if(reply.status!==200){exact(reply.body,['version','code','paymentAllowed']);
    check(reply.body.version==='clear-external-preview-error.1' && dErrors.has(reply.body.code)
      && reply.body.paymentAllowed===false,'D_RESPONSE_INVALID');}
  return reply;
}
function commonD(body,fields) {
  exact(body,[...dGates,...fields]);
  check(body.scope===gates.scope && body.automaticEligibility===false && body.paymentAllowed===false
    && body.actualReclaimCall===false && body.actualPayout===false && body.dataMode==='DEMO_ACCOUNTS_ONLY','D_RESPONSE_INVALID');
}

export function createOperatorPreviewRelay({authentication,resolveOperatorPreviewScope,dPort,
  clock=Date.now,monotonic=()=>performance.now(),ttlMs=60000,executionContract='DISPLAY_ONLY',
  setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  check(positive(ttlMs) && ttlMs<=900000 && ['DISPLAY_ONLY','D_SINGLE_ACTIVITY_OFFLINE.1'].includes(executionContract));
  const records=new Map(),sessions=new Map(),spent=new Map(),operations=new Set(),publications=new WeakMap();let closed=false,revision=0,inFlight=0,wallFloor=0,monoFloor=0;
  function time(){const wall=clock(),mono=monotonic();check(positive(wall)&&wall>=wallFloor&&Number.isFinite(mono)&&mono>=monoFloor,'PREVIEW_EXPIRED');
    wallFloor=wall;monoFloor=mono;return {wall,mono};}
  function forget(r){if(!r)return;records.delete(r.id);if(sessions.get(r.session)===r.id)sessions.delete(r.session);
    clearTimer(r.timer);r.controller.abort();r.sourceText=r.generated=r.approval=r.prepared=r.publication=null;}
  function shorten(r,end){const at=time();r.expires=Math.min(r.expires,end);
    r.monoEnd=Math.min(r.monoEnd,at.mono+Math.max(0,r.expires-at.wall));
    clearTimer(r.timer);r.timer=setTimer(()=>forget(r),Math.max(0,Math.min(r.expires-at.wall,r.monoEnd-at.mono)));r.timer.unref?.();}
  function configuration(){check(!closed,'PREVIEW_CLOSED');check(typeof authentication?.authorizeWorkflow==='function'
    && typeof authentication?.whoami==='function' && typeof resolveOperatorPreviewScope==='function'
    && typeof dPort?.call==='function' && ['ACTUAL','OFFLINE_TEST_TRANSPORT'].includes(dPort.execution),'PREVIEW_UNAVAILABLE');}
  function credentials(context){context=copy(context);exact(context,['token','wallet','chainId','csrf']);
    check(hex(context.token)&&hex(context.csrf)&&typeof context.wallet==='string'&&/^0x[a-fA-F0-9]{40}$/.test(context.wallet)
      && positive(context.chainId),'PREVIEW_AUTH_REQUIRED');return freeze(context);}
  function authenticate(context){const actor=sync(()=>authentication.authorizeWorkflow(context,true)),session=sync(()=>authentication.whoami(context));
    check(actor?.role==='operator' && session?.role==='operator' && typeof actor.wallet==='string' && actor.wallet===session.wallet
      && actor.wallet.toLowerCase()===context.wallet.toLowerCase(),'PREVIEW_FORBIDDEN');
    check(positive(session.expiresAt)&&Number.isSafeInteger(session.expiresAt*1000)&&time().wall<session.expiresAt*1000,'PREVIEW_AUTH_REQUIRED');
    return {session:hash({token:context.token,wallet:context.wallet.toLowerCase(),chainId:context.chainId}),expires:session.expiresAt*1000};}
  function fence(options){check(options?.signal instanceof AbortSignal && typeof options.assertCurrent==='function','PREVIEW_UNAVAILABLE');
    check(!options.signal.aborted,'PREVIEW_CANCELLED');sync(options.assertCurrent);}
  async function authority(context,options){configuration();fence(options);const before=authenticate(context);
    const supplied=await bounded(Promise.resolve().then(()=>resolveOperatorPreviewScope(context,{signal:options.signal})),options.signal);
    configuration();fence(options);exact(supplied,['scopeRef','authorityRevision','expiresAtMs','dActor','deployment','assertCurrent']);
    check(typeof supplied.assertCurrent==='function','PREVIEW_UNAVAILABLE');sync(supplied.assertCurrent);
    const {assertCurrent,...value}=supplied,scope=copy(value);
    check(opaque(scope.scopeRef)&&positive(scope.authorityRevision)&&positive(scope.expiresAtMs),'PREVIEW_UNAVAILABLE');
    exact(scope.dActor,['institutionId','courseId','operatorId']);
    check(typeof scope.dActor.institutionId==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(scope.dActor.institutionId)
      && ['courseId','operatorId'].every(k=>typeof scope.dActor[k]==='string'&&/^[1-9][0-9]{0,9}$/.test(scope.dActor[k])),'PREVIEW_UNAVAILABLE');
    exact(scope.deployment,['artifactHash','deploymentEpoch','bindingHash','model','limitsHash']);
    check(['artifactHash','bindingHash','limitsHash'].every(k=>hex(scope.deployment[k]))
      && typeof scope.deployment.deploymentEpoch==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(scope.deployment.deploymentEpoch)
      && scope.deployment.model==='gemini-3.5-flash-lite','PREVIEW_UNAVAILABLE');
    const after=authenticate(context);check(after.session===before.session,'PREVIEW_AUTH_REQUIRED');
    const expires=Math.min(before.expires,after.expires,scope.expiresAtMs);check(time().wall<expires,'PREVIEW_EXPIRED');
    const {expiresAtMs,...binding}=scope;return {...scope,expires,session:after.session,scopeHash:hash(binding),assertCurrent};
  }
  function live(r,options){configuration();fence(options);const t=time();
    check(records.get(r.id)===r&&!r.controller.signal.aborted&&t.wall<r.expires&&t.mono<r.monoEnd,'PREVIEW_STALE');}
  async function current(r,context,options){try{live(r,options);const a=await authority(context,options);
    const assertCurrent=()=>{try{live(r,options);const auth=authenticate(context);sync(a.assertCurrent);
      check(auth.session===r.session&&auth.expires>=r.expires&&a.session===r.session
        &&a.scopeHash===r.scopeHash&&a.expires>=r.expires,'PREVIEW_STALE');
      }catch(error){forget(r);throw error;}};
    assertCurrent();return assertCurrent;
    }catch(error){forget(r);throw error;}}
  function get(input,context){const r=records.get(input.contextRef);check(r&&r.revision===input.revision,'PREVIEW_STALE');
    check(r.session===hash({token:context.token,wallet:context.wallet.toLowerCase(),chainId:context.chainId}),'PREVIEW_FORBIDDEN');
    try{authenticate(context);}catch(error){forget(r);throw error;}return r;}
  function optionsFor(r,options){return {...options,signal:AbortSignal.any([options.signal,r.controller.signal])};}
  function preparedView(r){return freeze({version:OPERATOR_PREVIEW_VERSION,...gates,stage:'PREPARED',contextRef:r.id,revision:r.revision,
    expiresAt:r.expires,bodyHash:r.prepared.bodyHash,sourceHash:r.prepared.sourceHash,model:r.prepared.model,
    limits:copy(r.limits),approvalState:r.approval?'RECORDED':'REQUIRED'});}
  async function dispatch(r,context,options,operation,extra={}){
    const before=await current(r,context,options);before();
    const response=await bounded(Promise.resolve(dPort.call(operation,{...r.dActor,sourceText:r.sourceText,...extra},{signal:options.signal})),options.signal);
    const assertCurrent=await current(r,context,options);assertCurrent();return {reply:safeDReply(response),assertCurrent};
  }
  function dFailure(r,response){const result=freeze({version:OPERATOR_PREVIEW_VERSION,...gates,stage:'FAILED',contextRef:r.id,revision:r.revision,
    failure:{kind:'D_HTTP',status:response.status,error:response.body}});forget(r);return result;}
  function request(input,keys){input=copy(input);exact(input,['version',...keys]);check(input.version===OPERATOR_PREVIEW_VERSION);return freeze(input);}
  const api={
    // Publication-only port: no native reservation, D dispatch or approval
    // restoration. The original result object is a one-use in-process capability.
    // send must synchronously write/end the response; never await after the final
    // currentness check and before that write.
    async publish(context,result,{signal}={},send){
      configuration();context=credentials(context);check(signal instanceof AbortSignal&&typeof send==='function','PREVIEW_UNAVAILABLE');
      const entry=publications.get(result);check(entry,'PREVIEW_ALREADY_USED');
      check(entry.session===hash({token:context.token,wallet:context.wallet.toLowerCase(),chainId:context.chainId}),'PREVIEW_FORBIDDEN');
      publications.delete(result); // Consumed before any await; failures never restore it.
      const r=entry.record,controller=new AbortController();let active=true,timer;
      const options=optionsFor(r,{signal:AbortSignal.any([signal,controller.signal]),assertCurrent(){
        const now=time();check(active&&now.wall<entry.wallEnd&&now.mono<entry.monoEnd,'PREVIEW_EXPIRED');
        check(r.publication===entry&&r.id===entry.id&&r.revision===entry.revision&&r.session===entry.session
          &&r.scopeHash===entry.scopeHash&&r.phase===entry.phase&&r.expires===entry.expires,'PREVIEW_STALE');
      }});
      operations.add(controller);
      try{
        live(r,options);const now=time();
        timer=setTimer(()=>controller.abort(),Math.max(0,Math.min(entry.wallEnd-now.wall,entry.monoEnd-now.mono,r.expires-now.wall,r.monoEnd-now.mono)));timer.unref?.();
        // Re-resolve scope after runCommand finishes. The returned synchronous
        // check covers changes after this await, including the snapshot callback.
        const assertCurrent=await current(r,context,options);
        const body=JSON.stringify(result);assertCurrent();live(r,options);
        sync(()=>send(body));
      }catch(error){forget(r);throw error;}
      finally{active=false;controller.abort();clearTimer(timer);operations.delete(controller);}
    },
    async prepare(context,input,options){configuration();context=credentials(context);input=request(input,['sourceText']);fence(options);
      const prepared=prepareGeminiStructureRequest(input.sourceText),session=authenticate(context).session;
      forget(records.get(sessions.get(session)));
      check(records.size<16&&Number.isSafeInteger(revision+1),'PREVIEW_LIMIT');
      // Order prepares before the first await. A slow older resolver cannot
      // replace the newer input's context when it eventually returns.
      const id=randomUUID(),issuedRevision=++revision;sessions.set(session,id);let r;
      try{const a=await authority(context,options),at=time();check(sessions.get(session)===id,'PREVIEW_STALE');
      const expires=Math.min(at.wall+ttlMs,a.expires);r={id,revision:issuedRevision,session:a.session,scopeHash:a.scopeHash,
        dActor:a.dActor,deployment:a.deployment,sourceText:input.sourceText,prepared,expires,monoEnd:at.mono+expires-at.wall,
        phase:'PREPARING',controller:new AbortController(),approval:null,generated:null};
      records.set(r.id,r);sessions.set(r.session,r.id);r.timer=setTimer(()=>forget(r),expires-at.wall);r.timer.unref?.();
      options=optionsFor(r,options);
      const {reply:response,assertCurrent}=await dispatch(r,context,options,'prepare');assertCurrent();if(response.status!==200)return dFailure(r,response);
        const b=response.body;commonD(b,['version','sourceText','bodyHash','sourceHash','model','bindingHash','limits','actualModelCall']);
        check(b.version==='clear-external-preview-preparation.1'&&b.sourceText===r.sourceText&&b.bodyHash===prepared.bodyHash
          &&b.sourceHash===prepared.sourceHash&&b.model===prepared.model&&b.bindingHash===r.deployment.bindingHash
          &&hash(b.limits)===r.deployment.limitsHash&&b.actualModelCall===false,'D_RESPONSE_INVALID');
        r.limits=b.limits;r.phase='PREPARED';const result=preparedView(r);assertCurrent();return result;
      }catch(e){forget(r);if(sessions.get(session)===id)sessions.delete(session);throw e;}
    },
    // Owner-only binding of an already durably registered, directly approved ref.
    // This is deliberately not an HTTP route and never registers a D approval.
    async bindApproval(context,input,options){configuration();context=credentials(context);
      input=request(input,['contextRef','revision','bodyHash','bindingHash','approvalRef','expiresAt']);fence(options);
      const r=get(input,context);options=optionsFor(r,options);const assertCurrent=await current(r,context,options);assertCurrent();
      check(r.phase==='PREPARED'&&!r.approval,'PREVIEW_ALREADY_USED');
      check(input.bodyHash===r.prepared.bodyHash&&input.bindingHash===r.deployment.bindingHash
        &&typeof input.approvalRef==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(input.approvalRef)
        &&positive(input.expiresAt)&&time().wall<input.expiresAt&&input.expiresAt<=time().wall+3600000,'APPROVAL_REQUIRED');
      r.approval={ref:input.approvalRef,expires:input.expiresAt,key:hash({ref:input.approvalRef,binding:input.bindingHash})};
      shorten(r,input.expiresAt);const result=preparedView(r);assertCurrent();return result;
    },
    async generate(context,input,options){configuration();context=credentials(context);input=request(input,['contextRef','revision','bodyHash']);fence(options);
      const r=get(input,context);options=optionsFor(r,options);const ready=await current(r,context,options);ready();
      check(r.phase==='PREPARED','PREVIEW_ALREADY_USED');check(input.bodyHash===r.prepared.bodyHash,'PREVIEW_STALE');
      const at=time();for(const [key,end] of spent)if(end<=at.wall)spent.delete(key);
      check(r.approval&&at.wall<r.approval.expires,'APPROVAL_REQUIRED');
      check(!spent.has(r.approval.key)&&spent.size<256,'PREVIEW_ALREADY_USED');
      spent.set(r.approval.key,r.approval.expires);r.phase='GENERATING';const ref=r.approval.ref;
      try{const {reply:response,assertCurrent}=await dispatch(r,context,options,'generate',{approvalRef:ref});assertCurrent();if(response.status!==200)return dFailure(r,response);
        const b=response.body;commonD(b,['version','draftId','expiresAt','draft','proposal','modelCall','model','bodyHash','actualModelCall','modelProvenance']);
        check(b.version==='clear-external-preview-draft.1'&&typeof b.draftId==='string'&&/^[a-f0-9-]{36}$/.test(b.draftId)
          &&positive(b.expiresAt)&&b.expiresAt>time().wall&&b.expiresAt<=time().wall+900000
          &&b.bodyHash===r.prepared.bodyHash&&b.model===r.prepared.model,'D_RESPONSE_INVALID');
        const draft=reviewModelProposal(r.sourceText,b.draft.modelRows);
        check(hash(draft)===hash(b.draft)&&hash(proposalDto(draft))===hash(b.proposal),'D_RESPONSE_INVALID');
        const c=b.modelCall;exact(c,['attempted','replied','execution','model','bodyHash','succeeded','errorCode','methods']);
        exact(c.methods,['countTokens','generateContent']);
        for(const method of Object.values(c.methods)){exact(method,['invoked','replied']);check(method.invoked===true&&method.replied===true,'D_RESPONSE_INVALID');}
        check(c.attempted===true&&c.replied===true&&c.succeeded===true&&c.errorCode===null&&c.execution===dPort.execution
          &&c.model===b.model&&c.bodyHash===b.bodyHash&&b.actualModelCall===(dPort.execution==='ACTUAL')
          &&b.modelProvenance===(dPort.execution==='ACTUAL'?'ACTUAL_GEMINI_HTTP':'OFFLINE_TEST_TRANSPORT'),'D_RESPONSE_INVALID');
        r.generated=b;shorten(r,b.expiresAt);r.phase='PROPOSED';
        const result=freeze({version:OPERATOR_PREVIEW_VERSION,...gates,stage:'PROPOSED',contextRef:r.id,revision:r.revision,expiresAt:r.expires,generated:copy(b)});assertCurrent();return result;
      }catch(e){forget(r);throw e;}
    },
    async execute(context,input,options){configuration();context=credentials(context);input=request(input,['contextRef','revision','draftId','proposalHash']);fence(options);
      const r=get(input,context);options=optionsFor(r,options);const ready=await current(r,context,options);ready();
      check(executionContract==='D_SINGLE_ACTIVITY_OFFLINE.1','PREVIEW_DISPLAY_ONLY');
      check(r.phase==='PROPOSED','PREVIEW_ALREADY_USED');
      check(r.generated.draftId===input.draftId&&r.generated.draft.proposalHash===input.proposalHash,'PREVIEW_STALE');
      const reviewed=reviewModelProposal(r.sourceText,r.generated.draft.modelRows,input.proposalHash);
      check(reviewed.status==='READY','DRAFT_NOT_READY');const plan=buildPlan(reviewed);
      check(plan.steps.length===1&&plan.steps[0].tool==='moodle.activity.public','ACTUAL_TOOL_NOT_ENABLED');r.phase='EXECUTING';
      try{const {reply:response,assertCurrent}=await dispatch(r,context,options,'execute',{draftId:input.draftId,proposalHash:input.proposalHash});assertCurrent();if(response.status!==200)return dFailure(r,response);
        const b=response.body;commonD(b,['version','draftId','proposalHash','sourceHash','plan','validation','planScope','executionBridge','observation']);
        check(b.version==='clear-external-preview-observation.1'&&b.draftId===input.draftId&&b.proposalHash===input.proposalHash
          &&b.sourceHash===r.prepared.sourceHash&&hash(b.plan)===hash(plan)&&b.validation.ok===true
          &&b.validation.planHash===plan.planHash&&b.validation.sourceHash===r.prepared.sourceHash
          &&Array.isArray(b.validation.errors)&&b.validation.errors.length===0
          &&b.planScope==='EXISTING_PUBLIC_PLAN_GRAMMAR_ONLY'&&b.executionBridge==='PENDING_B_C_APPROVED_BINDING_ADAPTER','D_RESPONSE_INVALID');
        exact(b.validation,['ok','errors','sourceHash','planHash']);
        const o=b.observation;exact(o,['targetRef','status','observedAt','executionMode','eligibility','completionObserved']);
        check(typeof o.targetRef==='string'&&o.targetRef.length>0&&o.targetRef.length<=128
          &&['COMPLETE','INCOMPLETE','UNKNOWN','INACCESSIBLE'].includes(o.status)&&positive(o.observedAt)
          &&o.observedAt<=Math.floor(time().wall/1000)&&Math.floor(time().wall/1000)-o.observedAt<=30
          &&o.executionMode==='OFFLINE_TEST_ADAPTER'&&o.eligibility==='NOT_EVALUATED'&&o.completionObserved===(o.status==='COMPLETE'),'D_RESPONSE_INVALID');
        r.phase='OBSERVED';const result=freeze({version:OPERATOR_PREVIEW_VERSION,...gates,stage:'OBSERVED',contextRef:r.id,revision:r.revision,observation:copy(b)});assertCurrent();return result;
      }catch(e){forget(r);throw e;}
    },
    // Owner invalidation (logout/scope replacement). Never mounted as a browser authority API.
    invalidate(contextRef){forget(records.get(contextRef));},
    close(){closed=true;for(const controller of operations)controller.abort();for(const r of [...records.values()])forget(r);sessions.clear();spent.clear();},
  };
  // Bound authority resolution as well as D work; never extend the native fence.
  const wrapped={...api};
  for(const operation of ['prepare','bindApproval','generate','execute'])wrapped[operation]=async(context,input,options)=>{
    configuration();fence(options);check(inFlight<16,'PREVIEW_LIMIT');const at=time(),controller=new AbortController();let active=true;inFlight++;operations.add(controller);
    const signal=AbortSignal.any([options.signal,controller.signal]);
    const timer=setTimer(()=>controller.abort(),45000);timer.unref?.();
    const guarded={signal,assertCurrent(){const now=time();
      check(active&&now.wall<at.wall+45000&&now.mono<at.mono+45000,'PREVIEW_EXPIRED');sync(options.assertCurrent);}};
    try{const result=await bounded(api[operation](context,input,guarded),signal);
      if(result.stage!=='FAILED'){
        const r=records.get(result.contextRef);check(r,'PREVIEW_STALE');live(r,guarded);
        check(r.revision===result.revision&&r.phase===result.stage
          &&(!Object.hasOwn(result,'expiresAt')||result.expiresAt===r.expires),'PREVIEW_STALE');
        const entry={record:r,id:r.id,revision:r.revision,session:r.session,scopeHash:r.scopeHash,phase:r.phase,
          expires:r.expires,wallEnd:at.wall+45000,monoEnd:at.mono+45000};
        r.publication=entry;publications.set(result,entry);
      }
      return result;
    }
    finally{active=false;controller.abort();clearTimer(timer);operations.delete(controller);inFlight--;}
  };
  return Object.freeze(wrapped);
}
