import {createHash,createHmac,randomBytes} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {canonical,exactKeys,freeze,requireRule as check} from '../../src/policy/values.mjs';
import {createMoodlePaymentReader,FIXED_MOODLE_MAPPING_VERSION,FIXED_MOODLE_SCOPE_VERSION,FIXED_MOODLE_PAYMENT_VERSION} from '../../src/bootcamp/moodle-payment-projection.mjs';
import {join} from 'node:path';
import {readPrivate} from '../../src/hackathon-test-vault/e5/private-storage.mjs';

export const COURSE_READ_PATH='/v1/moodle/course/read';
export const COURSE_READ_REQUEST='clear-moodle-course-read-request.1';
export const COURSE_READ_RESPONSE='clear-moodle-course-read-response.1';
export const FIXED_AUTHORITY_PATH='/local/clearbridge/authority.php';
const hosts=new WeakSet();
const ref=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const integer=v=>Number.isSafeInteger(v)&&v>0;
const same=(a,b)=>canonical(a)===canonical(b);
const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const roles=['PARTICIPANT','COURSE_OPERATOR'];

// Owner-created reverse client. The student's existing HTTP origin and cookies
// remain untouched. TLS terminates in Moodle, with a fixed logical HTTPS Host
// matching Moodle's canonical port; only the private TCP route uses port 19468.
// No caller/request can choose the target, Host, CA, redirect or credentials.
export function createFixedMoodleAuthorityVerifier({ownerRunId,secret,ca,connectionPort=19468,
 now=()=>Math.floor(Date.now()/1000),monotonic=()=>performance.now()}){
 check(ref(ownerRunId)&&typeof secret==='string'&&/^[a-f0-9]{64}$/.test(secret)&&ca
  &&Number.isInteger(connectionPort)&&connectionPort>=1024&&connectionPort<=65535,'COURSE_FIXED_AUTHORITY_CONFIG');
 const time=clock(now,monotonic),key=Buffer.from(secret,'utf8'),authorityHost='127.0.0.1:18768';
 const certificateAuthority=Buffer.from(ca);let closed=false;const requests=new Set();
 const verify=async(input,{signal}={})=>{
  check(!closed,'COURSE_FIXED_AUTHORITY_CLOSED');signal?.throwIfAborted();const body=requestShape(input,ownerRunId),start=time();
  check(start.wall<body.expiresAtExclusive&&body.expiresAtExclusive<=start.wall+5,'COURSE_FIXED_AUTHORITY_EXPIRED');
  const current=()=>{signal?.throwIfAborted();const t=time();check(!closed&&t.wall<body.expiresAtExclusive&&t.mono>=start.mono&&t.mono-start.mono<5000,'COURSE_FIXED_AUTHORITY_EXPIRED');};
  const raw=Buffer.from(JSON.stringify(body)),timestamp=String(start.wall),nonce=randomBytes(16).toString('hex');
  const signature=createHmac('sha256',key).update(['CLEAR-MOODLE-AUTHORITY-A-TO-C-1',timestamp,nonce,'POST',FIXED_AUTHORITY_PATH,
   createHash('sha256').update(raw).digest('hex')].join('\n')).digest('hex');
  const text=await new Promise((resolve,reject)=>{
   let settled=false,timer,request;
   const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);requests.delete(request);signal?.removeEventListener('abort',abort);
    if(error){request?.destroy();reject(Error('COURSE_FIXED_AUTHORITY_UNAVAILABLE'));}else resolve(value);};
   const abort=()=>finish(true);
   request=httpsRequest({hostname:'127.0.0.1',port:connectionPort,path:FIXED_AUTHORITY_PATH,method:'POST',agent:false,ca:certificateAuthority,
    rejectUnauthorized:true,minVersion:'TLSv1.2',headers:{host:authorityHost,'content-type':'application/json','content-length':raw.length,
     'x-clear-timestamp':timestamp,'x-clear-nonce':nonce,'x-clear-signature':signature}},response=>{
     if(response.statusCode!==200||response.headers['set-cookie']!==undefined||response.headers.location!==undefined
      ||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers['content-type']??'')){finish(true);return;}
     const parts=[];let size=0;
     response.on('data',part=>{size+=part.length;if(size>4096)finish(true);else parts.push(part);});
     response.on('error',()=>finish(true));response.on('aborted',()=>finish(true));response.on('end',()=>finish(false,Buffer.concat(parts).toString('utf8')));
    });
   requests.add(request);request.on('error',()=>finish(true));signal?.addEventListener('abort',abort,{once:true});
   timer=setTimeout(abort,Math.max(1,Math.min(5000,(body.expiresAtExclusive-start.wall)*1000)));timer.unref?.();
   if(signal?.aborted)abort();else request.end(raw);
  });
  current();let result;try{result=JSON.parse(text);}catch{throw Error('COURSE_FIXED_AUTHORITY_RESPONSE');}
  check(JSON.stringify(result)===text,'COURSE_FIXED_AUTHORITY_RESPONSE');
  exactKeys(result,['version','requestRef','ownerRunId','moodleAuthorityRef','role','status','installationRef','courseRef','subjectRef','actorRef',
   'applicationRef','expiresAtExclusive','displayOnly','authorityConsumptionAllowed'],'COURSE_FIXED_AUTHORITY_RESPONSE');
  check(result.version===FIXED_MOODLE_SCOPE_VERSION&&result.displayOnly===true&&result.authorityConsumptionAllowed===false
   &&['requestRef','ownerRunId','moodleAuthorityRef','role'].every(k=>result[k]===body[k]),'COURSE_FIXED_AUTHORITY_RESPONSE');
  const scope=['installationRef','courseRef','subjectRef','actorRef','applicationRef'];
  check(result.status==='UNAVAILABLE'?[...scope,'expiresAtExclusive'].every(k=>result[k]===null)
   :result.status==='OK'&&scope.every(k=>ref(result[k]))&&integer(result.expiresAtExclusive)
    &&now()<result.expiresAtExclusive&&result.expiresAtExclusive<=body.expiresAtExclusive,'COURSE_FIXED_AUTHORITY_RESPONSE');
  current();return freeze(result);
 };
 return Object.freeze({verify,close(){if(!closed){closed=true;for(const request of requests)request.destroy();requests.clear();key.fill(0);}}});
}
function requestShape(value,ownerRunId){
 exactKeys(value,['version','requestRef','ownerRunId','moodleAuthorityRef','role','expiresAtExclusive'],'COURSE_READ_REQUEST');
 check(value.version===COURSE_READ_REQUEST&&/^[a-f0-9]{64}$/.test(value.requestRef)&&value.ownerRunId===ownerRunId
  &&ref(value.moodleAuthorityRef)&&roles.includes(value.role)&&integer(value.expiresAtExclusive),'COURSE_READ_REQUEST');
 return freeze(structuredClone(value));
}
function clock(now,monotonic){
 let floor=0;
 return ()=>{const wall=now(),mono=monotonic();check(integer(wall)&&wall>=floor&&Number.isFinite(mono)&&mono>=0,'COURSE_READ_CLOCK');floor=wall;return {wall,mono};};
}

const stableSnapshot=value=>{const {observedAt,...stable}=value;return stable;};
const scopeKeys=['requestRef','authorityRef','authorityEpoch','expiresAtExclusive','mapping','role','clearContext'];
// No listener starts here. All dependencies are owner-only ports; absent current
// Moodle/B authority or a separate CLEAR actor must throw, never synthesize one.
export function createMoodleCourseReadHost({ownerRunId,mapping,resolveAuthority,authentication,snapshots,receiptSource,
 createCourseEvidenceReader,getDecisionEvidence,readSourceStates,now=()=>Math.floor(Date.now()/1000),monotonic=()=>performance.now()}){
 check(ref(ownerRunId)&&[resolveAuthority,authentication?.authorizeWorkflow,authentication?.whoami,
  createCourseEvidenceReader,getDecisionEvidence,now,monotonic].every(f=>typeof f==='function'),'COURSE_READ_CONFIG');
 const pinned=freeze(structuredClone(mapping)),fixed=pinned.version===FIXED_MOODLE_MAPPING_VERSION,time=clock(now,monotonic),used=new WeakSet(),handles=new WeakMap(),requests=new Set();
 const authorizeTransport=(handle,request)=>{
  const entry=handles.get(handle),current=time();
  entry?.signal?.throwIfAborted();
  check(entry&&entry.requestHash===digest(request),'COURSE_READ_AUTH');
  check(current.wall<request.expiresAtExclusive&&current.mono>=entry.started.mono&&current.mono-entry.started.mono<5000,'COURSE_READ_EXPIRED');
 };
 // Validate the pinned mapping/receipt/snapshot composition even before read.
 createMoodlePaymentReader({mapping:pinned,resolveScope:resolveAuthority,authentication,snapshots,receiptSource,now,monotonic});
 const host=Object.freeze({ownerRunId,async read(verifiedTransportHandle,body){
  const request=requestShape(body,ownerRunId);
  authorizeTransport(verifiedTransportHandle,request);
  check(!used.has(verifiedTransportHandle),'COURSE_READ_REPLAY');used.add(verifiedTransportHandle);
  const unavailable=()=>freeze({version:COURSE_READ_RESPONSE,requestRef:request.requestRef,ownerRunId:request.ownerRunId,
   role:request.role,status:'UNAVAILABLE',expiresAtExclusive:null,evidence:null,payment:null});
  try{
   const started=time();let end=Math.min(request.expiresAtExclusive,started.wall+5,pinned.expiresAtExclusive,fixed?pinned.expiresAtExclusive:pinned.bindingExpiresAtExclusive),identity;
   const current=()=>{authorizeTransport(verifiedTransportHandle,request);const t=time();check(t.wall<end&&t.mono>=started.mono&&t.mono-started.mono<5000,'COURSE_READ_EXPIRED');return t;};
   async function scope(){
    current();const s=structuredClone(await resolveAuthority(verifiedTransportHandle,request,{signal:handles.get(verifiedTransportHandle)?.signal}));current();
    exactKeys(s,fixed?scopeKeys.map(k=>k==='authorityEpoch'?'version':k):scopeKeys,'COURSE_READ_SCOPE');exactKeys(s.clearContext,['token','wallet','chainId','csrf'],'COURSE_READ_SCOPE');
    check(s.requestRef===request.requestRef&&s.authorityRef===request.moodleAuthorityRef&&(fixed?s.version===FIXED_MOODLE_SCOPE_VERSION:integer(s.authorityEpoch))
     &&integer(s.expiresAtExclusive)&&s.role===request.role&&same(s.mapping,pinned),'COURSE_READ_SCOPE');
    const expectedRole=request.role==='PARTICIPANT'?'participant':'operator';
    const expectedWallet=request.role==='PARTICIPANT'?pinned.participantWallet:pinned.operatorWallet;
    const actor=authentication.authorizeWorkflow(s.clearContext,false),session=authentication.whoami(s.clearContext);
    check(actor.role===expectedRole&&actor.wallet.toLowerCase()===expectedWallet&&session.role===expectedRole
     &&session.wallet.toLowerCase()===expectedWallet&&integer(session.expiresAt),'COURSE_READ_CLEAR_ACTOR');
    end=Math.min(end,s.expiresAtExclusive,session.expiresAt);current();
    const fingerprint=digest(s);if(identity===undefined)identity=fingerprint;else check(identity===fingerprint,'COURSE_READ_AUTHORITY_CHANGED');
    return s;
   }
   const first=await scope(),initial=snapshots.read(first.clearContext,pinned.applicationId);current();
   const paymentReader=createMoodlePaymentReader({mapping:pinned,resolveScope:scope,authentication,snapshots,receiptSource,now,monotonic});
   const payment=structuredClone(await paymentReader.read(verifiedTransportHandle));current();
   let captured,reads=0;
   const readEvidence=(context,applicationId)=>{
    check(applicationId===pinned.applicationId&&same(context,first.clearContext),'COURSE_READ_EVIDENCE_SCOPE');
    const value=getDecisionEvidence(context,applicationId);
    check(value?.version==='clear-bootcamp-decision-evidence.1'&&value.applicationId===pinned.applicationId&&value.role===request.role
     &&value.manifest?.applicationId===pinned.applicationId&&value.manifest?.decision?.policyHash===pinned.policyHash
     &&value.currentDecision?.matchesRequestedDecision===true&&value.currentDecision.decisionId===value.manifest.decision.decisionId
     &&integer(value.observedAt),'COURSE_READ_EVIDENCE_SCOPE');
    current();return structuredClone(value);
   };
   const evidenceReader=createCourseEvidenceReader({resolveScope:async()=>{const s=await scope();return {
    courseRef:pinned.courseRef,participantRef:pinned.subjectRef,applicationId:pinned.applicationId,
    role:s.role,authorityRef:s.authorityRef,clearContext:s.clearContext};},
    getDecisionEvidence:(context,id)=>{check(++reads===1,'COURSE_READ_EVIDENCE_READS');captured=readEvidence(context,id);return captured;},
    ...(readSourceStates===undefined?{}:{readSourceStates})});
   const evidence=structuredClone(await evidenceReader.read(verifiedTransportHandle));current();
   exactKeys(evidence,['version','role','observedAt','decision','applicationActive','criteria','usableForPayment'],'COURSE_READ_EVIDENCE');
   check(reads===1&&evidence.version==='clear-moodle-course-evidence.1'&&evidence.role===request.role&&evidence.usableForPayment===false
    &&evidence.observedAt===captured.observedAt&&evidence.decision.id===payment.decision.id
    &&evidence.decision.revision===payment.decision.revision&&evidence.decision.recordedConditionsStatus===payment.decision.recordedConditionsStatus
    &&captured.manifest.decision.decisionId===payment.decision.id&&captured.manifest.decision.decisionRevision===payment.decision.revision
    &&captured.manifest.decision.decisionHash===payment.decision.hash,'COURSE_READ_DECISION');
   const final=await scope(),last=snapshots.read(final.clearContext,pinned.applicationId);
   const finalEvidence=readEvidence(final.clearContext,pinned.applicationId);
   check(same(stableSnapshot(initial),stableSnapshot(last))&&same(stableSnapshot(captured),stableSnapshot(finalEvidence)),'COURSE_READ_CHANGED');
   check(payment.requestRef===request.requestRef&&payment.role===request.role&&payment.mappingRevision===pinned.mappingRevision
    &&(fixed?payment.version===FIXED_MOODLE_PAYMENT_VERSION&&payment.mappingRef===pinned.mappingRef
     :payment.bindingRef===pinned.bindingRef&&payment.bindingRevision===pinned.bindingRevision),'COURSE_READ_PAYMENT_SCOPE');
   // B's display DTO has no complete validity horizon. Do not let it outlive its
   // observed second; all its source/clock boundaries are integer epoch seconds.
   end=Math.min(end,payment.expiresAtExclusive,evidence.observedAt+1);current();
   payment.expiresAtExclusive=end;
   return freeze({version:COURSE_READ_RESPONSE,requestRef:request.requestRef,ownerRunId:request.ownerRunId,role:request.role,
    status:'OK',expiresAtExclusive:end,evidence,payment});
  }catch{return unavailable();}
 },
 // Private callback for D's authenticated handler ONLY. The six frozen fields
 // are service-verified by D, not user authority. Refs still go through the
 // independent, fresh Moodle/B/CLEAR owner resolver inside read().
 async readCourse(transportHandle,{signal}={}){
  check(signal===undefined||signal instanceof AbortSignal,'COURSE_READ_SIGNAL');signal?.throwIfAborted();
  check(Object.isFrozen(transportHandle),'COURSE_READ_TRANSPORT_HANDLE');
  const request=requestShape(transportHandle,ownerRunId),started=time();
  check(started.wall<request.expiresAtExclusive&&request.expiresAtExclusive<=started.wall+5
   &&!requests.has(request.requestRef)&&requests.size<10000,'COURSE_READ_REPLAY');
  requests.add(request.requestRef);handles.set(transportHandle,{requestHash:digest(request),started,signal});
  const result=await host.read(transportHandle,request);
  exactKeys(result,['version','requestRef','ownerRunId','role','status','expiresAtExclusive','evidence','payment'],'COURSE_READ_RESPONSE');
  check(result.version===COURSE_READ_RESPONSE&&result.requestRef===request.requestRef&&result.ownerRunId===request.ownerRunId
   &&result.role===request.role&&(result.payment===null||result.payment.requestRef===request.requestRef),'COURSE_READ_RESPONSE');
  return freeze({status:result.status,expiresAtExclusive:result.expiresAtExclusive,evidence:result.evidence,payment:result.payment});
 }
 });
 hosts.add(host);return host;
}

// Explicit owner-created HTTPS server; factory does not bind/listen. C/D must
// pin the CA and hostname and disable redirects on their client. No CORS, cookie,
// proxy authority, raw proof route, retry, payment command or default TLS bypass.
export function createMoodleCourseReadServer({host,tls,origin,secret,createCourseReadServer,clock=Date.now,monotonic=()=>performance.now()}){
 const url=new URL(origin);
 check(hosts.has(host)&&tls&&tls.key&&tls.cert&&typeof createCourseReadServer==='function'
  &&url.protocol==='https:'&&url.origin===origin&&!url.username&&!url.password
  &&typeof secret==='string'&&/^[a-f0-9]{64}$/.test(secret),'COURSE_READ_SERVER_CONFIG');
 // D owns raw HMAC, nonce/request replay, size/route/Host, cancellation and the
 // eight-field wire response. A supplies the independently checked four-field
 // callback, a fresh run/key and TLS. No same-host proxy/default key here.
 return createCourseReadServer({origin,ownerRunId:host.ownerRunId,secret,readCourse:host.readCourse,tls,clock,monotonic});
}

// Explicit optional owner code in this one-run private host directory. Import
// exactly the hash-checked bytes, not a path that could change after validation.
// The module must use absolute imports for separately pinned dependencies.
export async function loadNormalMoodleReadOwner({directory,sha256}){
 if(sha256===undefined)return null;
 check(typeof sha256==='string'&&/^[a-f0-9]{64}$/.test(sha256),'COURSE_READ_OWNER_PIN');
 const source=readPrivate(join(directory,'moodle-read-owner.mjs'));
 check(Buffer.byteLength(source)<=65536&&createHash('sha256').update(source).digest('hex')===sha256,'COURSE_READ_OWNER_PIN');
 const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 check(typeof module.createMoodleReadOptions==='function','COURSE_READ_OWNER_PORT');
 return module.createMoodleReadOptions;
}

// Startup attaches only an explicitly supplied owner configuration. Application
// mapping becomes available after the existing UI binds the participant. A new
// authenticated request may then construct the one fixed reader; no polling,
// automatic retries, fabricated mapping, new auth flow or payment call is added.
export async function attachNormalMoodleReadServer({context,options,signal}){
 if(options===null||options===undefined)return context;
 let server,closed=false,creating=null,readHost=null;
 const close=()=>{if(closed)return;closed=true;signal?.removeEventListener('abort',close);
  try{server?.close();server?.closeAllConnections?.();}finally{context.close();}};
 try{
  signal?.throwIfAborted();
  check([context?.report,context?.close,context?.createMoodleCourseReadHost,options.createCourseReadServer,options.resolveReadOptions,options.listen].every(f=>typeof f==='function'),'COURSE_READ_OWNER_PORT');
  const origin=new URL(options.origin),run=context.report().runId;
  check(ref(run)&&origin.protocol==='https:'&&origin.origin===options.origin&&!origin.username&&!origin.password
   &&options.tls?.key&&options.tls?.cert&&typeof options.secret==='string'&&/^[a-f0-9]{64}$/.test(options.secret),'COURSE_READ_SERVER_CONFIG');
  const readCourse=async(handle,{signal:requestSignal}={})=>{
   const combined=AbortSignal.any([signal,requestSignal].filter(Boolean));
   combined.throwIfAborted();check(!closed,'COURSE_READ_CLOSED');
   if(!readHost){
    creating??=(async()=>{const config=await options.resolveReadOptions({report:context.report(),signal:combined});
     combined.throwIfAborted();check(!closed&&config?.ownerRunId===run,'COURSE_READ_OWNER_RUN');
     return context.createMoodleCourseReadHost(config);})();
    try{readHost=await creating;}catch(error){creating=null;throw error;}
   }
   combined.throwIfAborted();check(!closed,'COURSE_READ_CLOSED');return readHost.readCourse(handle,{signal:combined});
  };
  server=options.createCourseReadServer({origin:options.origin,ownerRunId:run,secret:options.secret,tls:options.tls,readCourse,
   ...(options.clock===undefined?{}:{clock:options.clock}),...(options.monotonic===undefined?{}:{monotonic:options.monotonic})});
  server.once('error',close);signal?.addEventListener('abort',close,{once:true});
  await options.listen(server,options.origin);signal?.throwIfAborted();check(!closed,'COURSE_READ_CLOSED');
  return Object.freeze({...context,close});
 }catch(error){close();throw error;}
}
