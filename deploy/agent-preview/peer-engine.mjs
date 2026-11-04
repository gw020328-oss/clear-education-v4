import {createService} from './service.mjs';
import {developerTransport} from '../../src/ai-policy/gemini-evaluation.mjs';
import {reviewModelProposal,buildPlan,validatePlan} from '../../src/agent-preview/index.mjs';
import {strictJson} from '../../src/hackerrank-evidence/values.mjs';
import {hash,exact,requireRule as check} from './vendor/b-peer/contract.mjs';
import {acceptPeerRequest,encodePeerResponse} from './vendor/b-peer/peer-transport.mjs';
import {validateRelease,validateRegistration,peerPaths,preparePath} from './peer-release.mjs';
import {validateConfig} from './config.mjs';
import {limits,previewModel} from './limits.mjs';

// Registration is a trusted local control-plane input. No HTTP path can create it.
export function createPeerEngine({release:rawRelease,registration:rawRegistration,key,replay,store,
  receipts,offlineTransport,clock=Date.now,monotonic=()=>performance.now()}) {
  const release=validateRelease(rawRelease);
  const registration=validateRegistration(rawRegistration,release,clock());
  const context=registration.context;
  check(receipts?.id===release.receiptContract && receipts.ready===true,'RECEIPT_CONTRACT_PENDING');
  const modelTransport=release.mode==='ACTUAL_GEMINI'?developerTransport():offlineTransport;
  check(release.mode==='ACTUAL_GEMINI' ? !offlineTransport : modelTransport?.execution==='OFFLINE','MODEL_TRANSPORT_MODE');
  const config=validateConfig(release.config);
  let service;
  const secret=Buffer.from(key);
  check(secret.length===32,'PEER_KEY');
  const started=monotonic(),end=started+context.expiresAtExclusive*1000-clock();
  const lifetime=new AbortController();
  let requestWallEnd=Infinity,requestMonoEnd=Infinity;
  let registered=false,closed=false,busy=false,draft=null,reviewed=false,delivered=false,floor=clock();
  function current() {
    const now=clock(),mono=monotonic();
    check(!closed && now>=floor && now<context.expiresAtExclusive*1000 && mono>=started && mono<end && now<requestWallEnd && mono<requestMonoEnd,'CONTEXT_EXPIRED');
    floor=now;
    lifetime.signal.throwIfAborted();
    return now;
  }
  function close() {
    if(closed)return;
    closed=true;
    lifetime.abort(Error('SERVICE_CLOSED'));
    service?.close();
    draft=null;
    secret.fill(0);
    clearTimeout(timer);
  }
  const timer=setTimeout(close,Math.max(0,Math.min(context.expiresAtExclusive*1000-clock(),end-monotonic())));
  timer.unref();
  service=createService({config,store,modelTransport,clock:current,registeredPeerContext:context});
  return {
    async handle(path,wire,{signal}={}) {
      current();
      check(!busy && [preparePath,...peerPaths].includes(path),'PEER_ROUTE_OR_BUSY');
      busy=true;
      const combined=signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;
      try {
        combined.throwIfAborted();
        const pin={...release.pin,path};
        const request=acceptPeerRequest({wire,key:secret,pin,replay});
        const m=request.meta;
        check(m.contextRef===context.previewContextRef && m.sourceHash===context.sourceHash
          && m.expiresAtExclusive<=context.expiresAtExclusive,'PEER_CONTEXT');
        const deadline=(m.expiresAtExclusive-pin.maxClockSkewSeconds)*1000;
        const requestMono=monotonic()+deadline-clock();
        requestWallEnd=deadline;requestMonoEnd=requestMono;
        const valid=()=>{
          const now=current();
          combined.throwIfAborted();
          check(now<deadline && monotonic()<requestMono,'PEER_EXPIRED');
          return Math.floor(now/1000);
        };
        valid();
        const value=strictJson(new TextDecoder('utf-8',{fatal:true}).decode(request.body),16384);
        let dto,nextDraft=null,observationExpiry=context.expiresAtExclusive;
        if(path===preparePath) {
          exact(value,['version','context','release','toolBinding','modelCapability','observationCapability','dataMode']);
          exact(value.release,['deploymentEpoch','artifactHash','model','limitsHash']);
          check(value.release.deploymentEpoch===release.config.deploymentEpoch
            && m.deploymentEpoch===value.release.deploymentEpoch
            && value.release.artifactHash===release.config.artifactHash
            && value.release.model===previewModel && value.context?.model===value.release.model
            && value.release.limitsHash===hash(limits),'PEER_RELEASE');
          exact(value.toolBinding,['tool','planTarget','observationTargetRef']);
          check(!registered && m.proposalHash==='0'.repeat(64)
            && value.version==='clear-preview-peer-context-registration.1'
            && hash(value.context)===hash(context)
            && value.toolBinding.tool==='moodle.activity.public' && value.toolBinding.planTarget===release.planTarget
            && value.toolBinding.observationTargetRef===release.targetRef && value.dataMode==='SYNTHETIC_ONLY'
            && value.modelCapability===(release.mode==='ACTUAL_GEMINI'?'ACTUAL_GEMINI_HTTP':'OFFLINE_TEST')
            && value.observationCapability==='B_VERIFIED_MOODLE','PEER_REGISTRATION');
          dto=receipts.context({previewContextRef:context.previewContextRef,expiresAtExclusive:context.expiresAtExclusive,
            registered:true,paymentAllowed:false});
        } else if(path===peerPaths[0]) {
          check(registered,'PEER_NOT_REGISTERED');
          exact(value,['sourceText','approvalRef']);
          check(!draft && m.proposalHash==='0'.repeat(64) && value.approvalRef===registration.approvalRef,'PEER_DRAFT');
          const generated=await service.generate({institutionId:config.institutionId,courseId:config.courseId,
            operatorId:config.operatorId,...value},{signal:combined,offlinePeerDeadline:deadline});
          valid();
          const {input,proposal}=generated.peerDraft;
          const reviewedDraft=reviewModelProposal(proposal.sourceText,proposal.rows,input.proposalHash);
          const plan=buildPlan(reviewedDraft);
          check(validatePlan(plan,reviewedDraft).ok && plan.steps.length===1
            && plan.steps[0].tool==='moodle.activity.public' && plan.steps[0].input.target===release.planTarget,'PEER_TOOL');
          nextDraft={draftId:input.draftId,proposalHash:input.proposalHash};
          dto=receipts.draft({input,proposal,actualModelCall:generated.actualModelCall,modelProvenance:generated.modelProvenance});
        } else if(path===peerPaths[1]) {
          exact(value,['draftId','proposalHash']);
          check(registered && draft && !reviewed && m.proposalHash===draft.proposalHash && value.draftId===draft.draftId
            && value.proposalHash===draft.proposalHash,'PEER_REVIEW');
          dto=receipts.review({...draft,reviewed:true,paymentAllowed:false});
        } else {
          exact(value,['targetRef','status','observedAt']);
          check(registered && draft && reviewed && !delivered && m.proposalHash===draft.proposalHash,'PEER_REVIEW');
          check(value.targetRef===release.targetRef && ['COMPLETE','INCOMPLETE','UNKNOWN','INACCESSIBLE'].includes(value.status)
            && Number.isSafeInteger(value.observedAt) && value.observedAt>0 && value.observedAt<=Math.floor(clock()/1000),'PEER_OBSERVATION');
          observationExpiry=value.observedAt+release.maxObservationAgeSeconds-pin.maxClockSkewSeconds;
          check(m.expiresAtExclusive<=observationExpiry && clock()<observationExpiry*1000,'PEER_OBSERVATION_EXPIRED');
          dto=receipts.observation({observation:value,modelExecution:modelTransport.execution,automaticEligibility:false,paymentAllowed:false});
        }
        const response=encodePeerResponse({request,body:Buffer.from(JSON.stringify(dto)),key:secret,pin,now:valid(),
          expiresAtExclusive:Math.min(context.expiresAtExclusive,observationExpiry)});
        valid();
        if(path===preparePath) {
          store.nonce('peer-context:'+hash(release)+':'+context.previewContextRef,clock());
          valid();
          registered=true;
        } else if(nextDraft)draft=nextDraft;
        else if(path===peerPaths[1])reviewed=true;
        else delivered=true;
        return response;
      } finally {requestWallEnd=Infinity;requestMonoEnd=Infinity;busy=false;}
    },
    close,
    releaseHash:hash(release)
  };
}
