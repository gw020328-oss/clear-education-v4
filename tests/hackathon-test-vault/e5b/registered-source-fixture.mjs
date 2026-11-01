// Real live-mode consumers; invented Moodle records and loopback self-Attestor HTTPS.
// The one AI HTTP response and approval are test doubles, with a dummy key only.
// No external service, browser login, actual human approval or user-wallet signature.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {startSelfAttestorTest} from '../../../tools/local-attestor-review/host.mjs';
import {prepareHackerRankSource} from '../../../src/hackerrank-evidence/prepared-source.mjs';
import {createLiveReclaimConsumer} from '../../../src/bootcamp/reclaim-live-consumer.mjs';
import {createLiveMoodleConsumer} from '../../../src/bootcamp/moodle-live-consumer.mjs';
import {prepareFirstNormalReflectionPacket,runManagedNormalReflection} from '../../ai-review-precheck/first-normal-reflection-entry.mjs';
import {openManagedNormalReflectionRun} from '../../../tools/bootcamp/normal-reflection-run.mjs';
import {atomicPrivate} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {NORMAL_REFLECTION_MODEL,NORMAL_REFLECTION_COST_ACK} from '../../../src/document-precheck/review/fixed-normal-reflection.mjs';
import {p0Hash,P0_POLICY} from '../../../specs/bootcamp/p0-contract.mjs';
import {bootcampP0Example} from '../../../specs/bootcamp/p0-example.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function registeredSourceFixture(t){
 process.env.CLEAR_LOCKED='1';const attestor=await startSelfAttestorTest({syntheticHttps:true});t.after(()=>attestor.close());
 const connection=await attestor.openClient(),source=prepareHackerRankSource({trustConfig:attestor.trust({audience:'registered-mode-rehearsal',privacyKeyId:'synthetic-only-key'}),commitmentKey:randomBytes(32),selectedCertificateId:'synthetic-python-orchid',client:connection.client,routeClient:connection.client,readCookies:async()=> 'session=SYNTHETIC_ONLY'});t.after(()=>source.close());
 const mappingHash=p0Hash('LIVE-MODE-SYNTHETIC-INPUTS',{pins:source.pins(),moodle:'INVENTED',ai:'INTERCEPTED_HTTP',wallets:'TEST_EOA'}),example=bootcampP0Example(),stats={ai:0,hr:0,moodle:0};
 const savedKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='synthetic-test-not-a-real-key';t.after(()=>{if(savedKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=savedKey;});
 const originalFetch=globalThis.fetch;t.mock.method(globalThis,'fetch',async(url,options)=>{
  const u=new URL(url);
  if(u.hostname==='generativelanguage.googleapis.com'){
   assert.equal(u.href,'https://generativelanguage.googleapis.com/v1beta/models/'+NORMAL_REFLECTION_MODEL+':generateContent');
   assert.equal(options.headers['x-goog-api-key'],'synthetic-test-not-a-real-key');assert.equal(++stats.ai,1);
   const input=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);assert.equal(input.source.text,example.reflection.text);
   const output={topics:Object.entries(example.reflection.topicQuotes).map(([topicId,quote])=>({topicId,state:'PRESENT',evidence:{sourceId:input.source.sourceId,quote}}))};
   return Response.json({modelVersion:NORMAL_REFLECTION_MODEL,usageMetadata:{promptTokenCount:300,candidatesTokenCount:200,totalTokenCount:500,serviceTier:'standard'},candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify(output)}]}}]});
  }
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname),'unexpected external fetch');return originalFetch(url,options);
 });
 return {mappingHash,selfAttestor:attestor.profile,stats,sourceFactory({now,participant,operator,runtime}){
  const began=now(),ends=began+900,lease={available:true,authExpiresAt:ends,rawExpiresAt:ends,queryExpiresAt:ends};
  const codeState={head:'a'.repeat(40),clean:true},day=new Date().toISOString().slice(0,10),hostName='synthetic-'+randomUUID().slice(0,18),root=fileURLToPath(new URL('../../../',import.meta.url)),hostDir=join(root,'var/bootcamp-normal-host',hostName);
  mkdirSync(hostDir,{recursive:true,mode:0o700});
  atomicPrivate(join(hostDir,'run.used.json'),{version:'clear-bootcamp-normal-host-one-run.2',hostName,runId:'normal-run-'+randomUUID(),code:codeState});
  atomicPrivate(join(hostDir,'host.json'),{participantWallet:participant.address.toLowerCase(),operatorWallet:operator.address.toLowerCase(),origin:'https://synthetic.example.invalid',privacyKeyId:'synthetic-only'});
  const managed=openManagedNormalReflectionRun(hostName);
  const reflection=async args=>{
   const packet=prepareFirstNormalReflectionPacket({...args,text:await args.lease.readBody(),leaseExpiresAtMs:args.context.expiresAtMs}),binding=managed.bind({packet,context:args.context});
   // Invented authorization, confined to this test's random run and mocked network.
   const approval={version:'clear-e6-paid-wire-v3-user-approval.3',scope:'FIRST_NORMAL_REFLECTION_ONE',approvedOn:day,codeHead:codeState.head,planHash:packet.planHash,contextHash:packet.contextHash,runBindingHash:binding.bindingHash,
    authorization:{kind:'DIRECT_HUMAN_FRESH_NORMAL_ONE',evidenceSha256:randomBytes(32).toString('hex')},maxGenerationCalls:1,maxCountCalls:0,automaticRetries:0,continuations:0,keySourceFallbacks:0,modelFallbacks:0,freeFallbacks:0,keySourceId:'clear-e6-existing-server-gemini-env.1',costAcknowledgment:NORMAL_REFLECTION_COST_ACK,
    pricingReview:{reviewedOn:day,officialSource:'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite',inputNanoUsdPerToken:'300',outputIncludingThinkingNanoUsdPerToken:'2500',basis:'PUBLIC_PRICE_REVIEW_NOT_BILLING_AUTHENTICATION',evidenceSha256:'c'.repeat(64)}};
   return runManagedNormalReflection(managed,{...args,packet,approval,codeState,day,currentCodeState:()=>codeState,currentDay:()=>day,currentApprovalHash:()=>hash(approval)});
  };
  const completion={state:1,timecompleted:began-10,overrideby:null,hascompletion:true,isautomatic:true,istrackeduser:true,uservisible:true,details:[{rulename:'completionview',rulevalue:{status:1,description:'View'}}]};
  const responses={core_webservice_get_site_info:{userid:6,version:'2024100715'},core_course_get_contents:[{id:0,modules:[{id:3,instance:8,modname:'page',completion:2,completiondata:completion},{id:4,instance:9,modname:'assign',completion:0},{id:5,instance:10,modname:'forum',completion:0}]}],
   core_completion_get_activities_completion_status:{statuses:[{...completion,cmid:3,instance:8,modname:'page',tracking:2}],warnings:[]},mod_assign_get_assignments:{courses:[{id:2,assignments:[{id:9,cmid:4,course:2,teamsubmission:0,timemodified:began-20}]}],warnings:[]},
   mod_assign_get_submission_status:{lastattempt:{submissionsenabled:true,submission:{id:20,userid:6,groupid:0,assignment:9,attemptnumber:0,status:'submitted',timecreated:began-20,timemodified:began-10}},warnings:[]},mod_forum_get_forums_by_courses:[{id:10,course:2}],mod_forum_get_forum_discussions:{discussions:[{id:41,discussion:42,userid:6}],warnings:[]},
   mod_forum_get_discussion_post:{post:{id:41,discussionid:42,author:{id:6},subject:'Synthetic reflection',message:example.reflection.text,messageformat:2,timecreated:began-20,timemodified:began-10,capabilities:{view:true},isdeleted:false,isprivatereply:false},warnings:[]}};
  const producers=Object.fromEntries(P0_POLICY.criteria.slice(0,3).map((c,i)=>[c.criterionId,createLiveMoodleConsumer({criterionId:c.criterionId,sourceValiditySeconds:900,now,resolveLease:()=>lease,modelVersion:NORMAL_REFLECTION_MODEL,reviewReflection:reflection,
   withReader:async fn=>fn({async call(method){assert.ok(method in responses);stats.moodle++;return structuredClone(responses[method]);}}),
   resolvePin:r=>({environmentRef:'synthetic-moodle',runRef:'synthetic-run',sourceVersion:'moodle-4.5.15-215f4438',apiVersion:'2024100715',fixtureReportHash:p0Hash('SYNTHETIC','moodle'),courseId:2,participantMapping:{participantId:r.participantId,applicationId:r.applicationId,moodleUserId:6,accountBindingRef:'synthetic-account',revision:1},target:{targetLogicalId:c.targetLogicalId,cmId:i+3,instanceId:i+8,module:['page','assign','forum'][i],selectedPostId:i===2?41:null},completionSetupReceiptHash:i===0?p0Hash('SYNTHETIC','setup'):null})})]));
  producers['python-basic-certificate']=createLiveReclaimConsumer({selfAttestor:attestor.profile,pins:source.pins,resolveLease:()=>lease,now,collectLease:async(request,options)=>{stats.hr++;assert.equal(request.runtimeMappingHash,runtime.runtimeMappingHash);assert.equal(request.participantWallet,participant.address.toLowerCase());return source.collectLease(request,{...options,signRequest:m=>participant.signMessage(m)});}});
  return {producers,resolveSource:r=>producers[r.criterionId]?.resolveSource(r)??null};
 }};
}
