import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,statSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSourceDiagnostics,observeSource,sourceDiagnosticCode} from '../../src/hackerrank-evidence/diagnostics.mjs';
import {atomicPrivate} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
const secret='SYNTHETIC_DIAGNOSTIC_SECRET';

test('relative monotonic time pairs only observed boundaries and never uses a previous attempt start',()=>{
 let now=12345;const d=createSourceDiagnostics({persist(){},monotonicNow:()=>now});
 observeSource(d,'SIGNATURE_WAIT','STARTED');now+=20;observeSource(d,'SIGNATURE_ACCEPTANCE','COMPLETED');
 now+=30;observeSource(d,'SIGNATURE_WAIT','FAILED',Error('AUTH_REQUIRED'));
 now+=10;observeSource(d,'SIGNATURE_WAIT','STARTED');now+=5;observeSource(d,'SIGNATURE_WAIT','COMPLETED');
 const v=d.snapshot();assert.equal(v.version,'clear-normal-source-diagnostics.3');assert.equal(v.timing,'COMPLETE');
 assert.deepEqual(v.events.map(e=>e.offsetMs),[0,20,50,60,65]);
 assert.deepEqual(v.events.map(e=>e.durationMs),[null,null,50,null,5]);
 assert.equal(JSON.stringify(v).includes('12345'),false);
});

test('fixed codes only: arbitrary text, nested causes, getters and hostile errors cannot escape',()=>{
 for(const value of [Error(secret),{code:'CLAIM_SIGNATURE:'+secret},{code:'UNREVIEWED_UPPERCASE'},secret,null,
  {cause:{code:'ECONNRESET'}},{get code(){throw Error(secret);},get message(){throw Error(secret);}},new Proxy({},{getOwnPropertyDescriptor(){throw Error(secret);}})])
  assert.equal(sourceDiagnosticCode(value),'UNKNOWN_ERROR');
 assert.equal(sourceDiagnosticCode(Object.assign(Error(secret),{code:'ECONNRESET',stack:secret})),'ECONNRESET');
 assert.equal(sourceDiagnosticCode(Error('CLAIM_SIGNATURE')),'CLAIM_SIGNATURE');
});
test('private durable snapshots retain the first boundary error without raw data or invented progress',t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'source-diagnostics-'))),path=join(dir,'diagnostics.json');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const d=createSourceDiagnostics({persist:v=>atomicPrivate(path,v)});
 observeSource(d,'ACCOUNT_PROOF_RETURN','STARTED');
 observeSource(d,'ACCOUNT_RESPONSE_INSPECTION','FAILED',Object.assign(Error(secret),{code:'WORKER_HTTP_STATUS',stack:secret,cookie:secret}));
 observeSource(d,'HR_COLLECTION','FAILED',Error('BC_PRODUCER_FAILED'));
 const text=readFileSync(path,'utf8'),v=JSON.parse(text);
 assert.equal(v.firstFailure.stage,'ACCOUNT_RESPONSE_INSPECTION');assert.equal(v.firstFailure.code,'WORKER_HTTP_STATUS');
 assert.equal(v.events.at(-1).code,'BC_PRODUCER_FAILED');assert.equal(v.stages.PAIR_OFFICIAL_VERIFY.state,'NOT_OBSERVED');
 assert.equal(v.signatureAcceptance,'UNKNOWN');assert.equal(v.persistence,'COMPLETE');assert.equal(statSync(path).mode&0o777,0o600);
 assert.equal(text.includes(secret),false);assert.equal(text.includes('stack'),false);assert.equal(text.includes('cookie'),false);
});
test('throwing persistence cannot replace an original exception or cause a write retry',()=>{
 let writes=0;const d=createSourceDiagnostics({persist(){writes++;throw Error(secret);}}),original=Error('COLLECTOR_COOKIES');
 assert.equal(writes,1);
 assert.throws(()=>{try{throw original;}catch(error){observeSource(d,'ACCOUNT_COOKIE_READ','FAILED',error);throw error;}},e=>e===original);
 assert.equal(writes,2);assert.equal(d.snapshot().persistence,'INCOMPLETE');
});
test('invalid observer inputs are ignored, snapshots cannot mutate authority, and history is bounded',()=>{
 let writes=0;const d=createSourceDiagnostics({persist(){writes++;}});
 observeSource({record(){assert.fail('unowned callback');}},'HR_COLLECTION','STARTED');
 observeSource(d,secret,'FAILED',Error(secret));observeSource(d,'HR_COLLECTION',secret);
 assert.equal(writes,1);d.snapshot().stages.SIGNATURE_ACCEPTANCE.completedObserved=true;
 assert.equal(d.snapshot().signatureAcceptance,'UNKNOWN');
 for(let i=0;i<140;i++)observeSource(d,'HR_COLLECTION','STARTED');
 assert.equal(d.snapshot().events.length,128);assert.equal(d.snapshot().truncated,true);assert.equal(writes,130);
});
test('a failed snapshot is marked incomplete on subsequent successful persistence',()=>{
 let stored,fail=false;const d=createSourceDiagnostics({persist(v){if(fail)throw Error(secret);stored=v;}});
 fail=true;observeSource(d,'SIGNATURE_WAIT','STARTED');fail=false;
 observeSource(d,'SIGNATURE_ACCEPTANCE','COMPLETED');
 assert.equal(stored.persistence,'INCOMPLETE');assert.equal(stored.signatureAcceptance,'ACCEPTED');
 observeSource(d,'SIGNATURE_ACCEPTANCE','FAILED',Error('BC_UI_SIGNATURE_NOT_PENDING'));
 assert.equal(stored.signatureAcceptance,'ACCEPTED');
});

test('only a projection stale deferral is representable and a later real failure remains firstFailure',()=>{
 const d=createSourceDiagnostics({persist(){}});
 observeSource(d,'UI_SESSION_AUTHORITY','DEFERRED',Error('AUTH_REQUIRED'));
 observeSource(d,'UI_APPLICATION_PROJECTION','DEFERRED',Error('ERR_SQLITE_ERROR'));
 assert.equal(d.snapshot().events.length,0);
 observeSource(d,'UI_APPLICATION_PROJECTION','DEFERRED',Error('BC_VIEW_STALE'));
 assert.equal(d.snapshot().firstFailure,null);assert.equal(d.snapshot().signatureAcceptance,'UNKNOWN');
 observeSource(d,'UI_SESSION_AUTHORITY','FAILED',Error('AUTH_REQUIRED'));
 observeSource(d,'SIGNATURE_WAIT','FAILED',Error('BC_UI_CONTEXT_UNAVAILABLE'));
 assert.equal(d.snapshot().firstFailure.stage,'UI_SESSION_AUTHORITY');assert.equal(d.snapshot().firstFailure.code,'AUTH_REQUIRED');
});

test('invalid, throwing or reversed clocks are sticky incomplete and do not manufacture durations',()=>{
 for(const bad of [NaN,Infinity,-1,'20',null,9,()=>{throw Error(secret);}]){
  let at=10;const d=createSourceDiagnostics({persist(){},monotonicNow:()=>typeof at==='function'?at():at});
  observeSource(d,'ACCOUNT_SDK_CALL','STARTED');at=bad;observeSource(d,'ACCOUNT_SDK_CALL','FAILED',Error('WORKER_COLLECTION_FAILED'));
  at=30;observeSource(d,'HR_COLLECTION','FAILED',Error('COLLECTION_FAILED'));
  const v=d.snapshot();assert.equal(v.timing,'INCOMPLETE');assert.equal(v.persistence,'COMPLETE');
  assert.equal(v.events[1].offsetMs,null);assert.equal(v.events[1].durationMs,null);assert.equal(v.events[2].offsetMs,null);
  assert.equal(v.firstFailure.code,'WORKER_COLLECTION_FAILED');assert.equal(JSON.stringify(v).includes(secret),false);
 }
});

test('diagnostic detail serialization uses only fixed own values without invoking getters',()=>{
 let reads=0;const d=createSourceDiagnostics({persist(){}});
 observeSource(d,'ACCOUNT_SDK_RETURN','OBSERVED',undefined,{resultKind:'ERROR',sdkCode:secret,aborted:secret,raw:secret});
 observeSource(d,'ACCOUNT_SDK_RETURN','OBSERVED',undefined,{get resultKind(){reads++;throw Error(secret);},get sdkCode(){reads++;throw Error(secret);},get aborted(){reads++;throw Error(secret);}});
 assert.equal(reads,0);assert.equal(d.snapshot().events[0].code,'UNKNOWN_ERROR');assert.equal(d.snapshot().events[0].aborted,null);
 assert.equal(d.snapshot().firstFailure,null);assert.equal(JSON.stringify(d.snapshot()).includes(secret),false);
});

test('diagnostic transport lookup cannot break existing HR-only offline consumers',async()=>{
 const {execFileSync}=await import('node:child_process');
 const script=`
 import {registerHooks} from 'node:module';
 let blocked=false;
 registerHooks({resolve(specifier,context,next){
  if(specifier.includes('/src/ybm-collector/node_modules/@reclaimprotocol/attestor-core/')){blocked=true;throw Error('SYNTHETIC_PREFIX_UNAVAILABLE');}
  return next(specifier,context);
 }});
 const {collectWorkerSource}=await import('./src/hackerrank-evidence/worker-source.mjs');
 if(typeof collectWorkerSource!=='function'||!blocked)throw Error('IMPORT_NOT_EXERCISED');
 `;
 assert.doesNotThrow(()=>execFileSync(process.execPath,['--import','./tests/ybm-collector/network-guard.mjs','--input-type=module','-e',script],{cwd:new URL('../../',import.meta.url),env:{...process.env,LOG_LEVEL:'silent'},stdio:'pipe'}));
});
