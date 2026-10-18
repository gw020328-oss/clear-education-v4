import test from 'node:test';
import assert from 'node:assert/strict';
import {bootcampFixture,reflectionMock} from './bootcamp-fixture.mjs';
import {bytesDigest} from '../../src/product-workflow/contract.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {createE6LeasedReflectionSession,E6_OPERATIONS_HASH} from '../../src/document-precheck/review/e6-leased-reflection.mjs';
import {createBootcampReflectionSession} from '../../src/document-precheck/review/bootcamp-reflection.mjs';
function fixture(options={}){
 const f=bootcampFixture(options),state={context:f.context,rawAvailable:true,decisionRef:null,messageFormat:options.messageFormat??2,
   operationsProfileHash:E6_OPERATIONS_HASH,leaseExpiresAtMs:f.context.expiresAtMs};let reads=0,releases=0,available=true;
 const lease={isCurrent:()=>available,readBody(){reads++;assert.equal(available,true);return f.text;},release(){releases++;}};
 const s=createE6LeasedReflectionSession(()=>state,{nowMs:()=>f.clock.value});
 const input=()=>({context:f.context,decisionRef:state.decisionRef,messageFormat:state.messageFormat,lease});
 return {f,state,lease,s,input,get reads(){return reads;},get releases(){return releases;},closeOwner(){available=false;state.rawAvailable=false;}};
}
const deferred=f=>{let release;const a=reflectionMock(f),output=a.observe();a.observe=()=>new Promise(resolve=>{release=async()=>resolve(await output);});
 return {a,ready:async()=>{while(!release)await new Promise(resolve=>setImmediate(resolve));},release:()=>release()};};
test('E0 wrapper consumes a borrowed body once and releases without disposing shared source or changing v1 hash',async()=>{
 const x=fixture();Object.defineProperty(x.state,'unrelatedRaw',{get(){throw Error('must not read');},enumerable:true});
 const r=await x.s.review(x.input(),reflectionMock(x.f));assert.equal(r.current,true);assert.equal(r.observation.contentStatus,'CHECKED');
 assert.equal(r.operationsProfileHash,E6_OPERATIONS_HASH);assert.equal(x.reads,1);assert.equal(x.releases,1);
 const baseline=createBootcampReflectionSession(()=>({context:x.f.context,rawAvailable:true}),{nowMs:()=>x.f.clock.value});
 const old=await baseline.review(x.f.input,reflectionMock(x.f));assert.equal(r.observation.observationHash,old.observationHash);
 assert.equal(x.s.consume(r).current,true);assert.equal(x.reads,1);assert.equal(JSON.stringify(r).includes(x.f.text),false);
 assert.equal(r.observation.context.version,'clear-bootcamp-observation-context.1');assert.equal(r.observation.usableForAcceptance,false);
 x.s.dispose();assert.equal(x.s.consume(r).current,false);assert.equal(x.releases,1);
});
test('HTML body uses original raw UTF-16 offsets; no strip, entity decode, normalized fingerprint or new title region',async()=>{
 const plain=bootcampFixture(),body='<p>'+plain.text.split('\n').join('</p><p>')+'</p>',x=fixture({text:body,messageFormat:1});
 const a=reflectionMock(x.f),observe=a.observe;a.observe=request=>{assert.equal(request.sourceFormat.messageFormat,1);assert.equal(request.sourceFormat.normalizationApplied,false);return observe(request);};
 const r=await x.s.review(x.input(),a);assert.equal(r.observation.contentStatus,'CHECKED');assert.equal(r.observation.originalBodyHash,bytesDigest(Buffer.from(body)));
 assert.equal(r.observation.topics[0].originalEvidenceLocator.start,3);assert.equal(r.locationBasis,'ORIGINAL_REFLECTION_BODY_UTF16');
 const y=fixture({text:'<p>A&amp;B</p>\n'+plain.text,messageFormat:1}),bad=reflectionMock(y.f,{'work-performed':{evidence:{sourceId:y.f.context.sourceId,quote:'A&B'}}});
 const unclear=await y.s.review(y.input(),bad);assert.equal(unclear.observation.topics[0].state,'UNCERTAIN');
 for(const format of [0,4]){const z=fixture({messageFormat:format});await assert.rejects(()=>z.s.review(z.input(),reflectionMock(z.f)),/E6_FORMAT_UNSUPPORTED/);assert.equal(z.reads,0);}
});
test('lease expiry before/after getter, source hash mismatch and owner close stop raw/model use',async()=>{
 const x=fixture();x.f.clock.value=x.state.leaseExpiresAtMs;const a=reflectionMock(x.f),r=await x.s.review(x.input(),a);
 assert.equal(r.current,false);assert.equal(x.reads,0);assert.equal(a.calls,0);assert.equal(x.releases,1);
 const y=fixture();y.lease.readBody=()=>{y.closeOwner();return y.f.text;};const b=reflectionMock(y.f),closed=await y.s.review(y.input(),b);
 assert.equal(closed.code,'E6_LEASE_CLOSED');assert.equal(b.calls,0);
 const z=fixture();z.lease.readBody=()=>z.f.text+' changed';const bad=await z.s.review(z.input(),reflectionMock(z.f));assert.equal(bad.code,'E6_INPUT_MISMATCH');
});
test('cancel and dispose abort ignoring mock, release once, and never inspect a late response',async()=>{
 for(const action of ['cancel','dispose']){
   const x=fixture(),a=reflectionMock(x.f);let resolve,outputReads=0;
   a.observe=()=>new Promise(r=>{resolve=r;});const pending=x.s.review(x.input(),a);while(!resolve)await new Promise(r=>setImmediate(r));
   x.s[action]();const r=await pending;const output={};Object.defineProperty(output,'topics',{get(){outputReads++;return [];}});resolve(output);
   assert.equal(r.current,false);assert.equal(x.releases,1);assert.equal(outputReads,0);assert.equal(x.s.consume(r).current,false);
 }
});
test('new decision/source/request/mapping invalidates even after business reverification/cap were consumed',async()=>{
 const mutations=[s=>s.context.sourceHash=p0Hash('NEW','source'),s=>s.context.requestHash=p0Hash('NEW','request'),
   s=>s.context.runtimeMappingHash=p0Hash('NEW','mapping'),s=>s.decisionRef={decisionId:'new-decision',decisionRevision:2,decisionHash:p0Hash('NEW','decision')},
   s=>s.messageFormat=1,s=>s.operationsProfileHash=p0Hash('NEW','profile')];
 for(const mutate of mutations){
   const x=fixture(),r=await x.s.review(x.input(),reflectionMock(x.f));x.state.businessReverificationUsed=1;x.state.firstReviewCapExpired=true;mutate(x.state);
   assert.equal(x.s.refresh(),false);assert.equal(x.s.consume(r).current,false);assert.equal(x.releases,1);
 }
});
test('lease shrink refresh cancels in-flight work; restored expiry does not revive old historical view',async()=>{
 const x=fixture(),d=deferred(x.f),pending=x.s.review(x.input(),d.a);await d.ready();
 x.state.leaseExpiresAtMs=x.f.clock.value+5;assert.equal(x.s.refresh(),true);x.f.clock.value+=5;
 assert.equal(x.s.refresh(),false);const r=await pending;d.release();x.state.leaseExpiresAtMs=x.f.context.expiresAtMs;
 assert.equal(r.current,false);assert.equal(x.s.consume(r).current,false);assert.equal(x.releases,1);
});
test('new collection attempt is not a business-reverification ledger and stale prior result cannot override latest',async()=>{
 const x=fixture(),d=deferred(x.f),old=x.s.review(x.input(),d.a);await d.ready();
 const f=bootcampFixture({evidenceRevision:2,runId:'recollected-run'});x.state.context=f.context;
 const lease={isCurrent:()=>true,readBody:()=>f.text,release(){}};
 const latest=await x.s.review({context:f.context,decisionRef:null,messageFormat:2,lease},reflectionMock(f));d.release();
 assert.equal((await old).current,false);assert.equal(x.s.consume(latest).current,true);assert.equal(Object.hasOwn(latest,'businessReverificationUsed'),false);
 assert.throws(()=>x.s.consume(structuredClone(latest)),/E6_VIEW_REQUIRED/);
});
test('source unavailable, no-issue/negative review, missing/uncertain/conflict, model timeout and paid guard remain separate',async()=>{
 const x=fixture({unavailable:true}),r=await x.s.review(x.input(),reflectionMock(x.f));assert.equal(r.observation.contentStatus,'CHECKED');assert.equal(r.observation.verifiedEvidenceCondition,'UNKNOWN');
 const base=bootcampFixture(),noIssue='문제는 없었고 빈 목록과 한 원소 입력을 점검했습니다.';
 for(const options of [{text:base.text+'\n수업은 실망스러웠습니다.'},{text:base.text.replace(base.quotes['problem-solving-process'],noIssue),quotes:{'problem-solving-process':noIssue}}]){
   const normal=fixture(options),result=await normal.s.review(normal.input(),reflectionMock(normal.f));assert.equal(result.observation.contentStatus,'CHECKED');}
 for(const state of ['MISSING','UNCERTAIN','CONFLICT']){const y=fixture(),a=reflectionMock(y.f,{'learning-takeaway':{state,evidence:null}});
   const result=await y.s.review(y.input(),a);assert.equal(result.observation.topics[2].state,state);assert.equal(result.observation.topics[2].originalEvidenceLocator,null);}
 const z=fixture(),a=reflectionMock(z.f);a.observe=()=>new Promise(()=>{});const timed=await z.s.review(z.input(),a,{timeoutMs:5});assert.equal(timed.observation.topics[0].reasonCode,'TIMED_OUT');
 const paid=fixture(),b=reflectionMock(paid.f);b.execution='ACTUAL';await assert.rejects(()=>paid.s.review(paid.input(),b),/E6_MOCK_REQUIRED/);assert.equal(paid.reads,0);
});
