import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadE6QualityCorpus,prepareE6QualityPlan,assessE6QualityResponse,sha} from './e6-quality-plan.mjs';
const rawGold=(g,id)=>({topics:g.topics.map(t=>({topicId:t.topicId,state:t.state,evidence:t.state==='PRESENT'?{sourceId:id,quote:t.quote}:null}))});
test('8 new synthetic Python cases have independent gold, unique original quotations and fixed bytes',()=>{
 const a=loadE6QualityCorpus(),b=loadE6QualityCorpus();assert.equal(a.corpus.cases.length,8);assert.deepEqual(a,b);
 assert.equal(a.corpusSha256,sha(readFileSync(new URL('./e6-python-corpus.json',import.meta.url))));
 assert.equal(a.goldSha256,sha(readFileSync(new URL('./e6-python-gold.json',import.meta.url))));
 assert.equal(a.corpus.cases.filter(c=>c.messageFormat===1).length,1);
 assert.equal(a.gold.cases.filter(c=>c.normalControl).length,5);
});
test('requests pin existing prompt/schema/model/thinking and never send gold or keys',()=>{
 const {plan,requests,gold}=prepareE6QualityPlan();assert.equal(plan.status,'NOT_APPROVED_ACTUAL_BLOCKED');assert.equal(plan.model,'gemini-3.5-flash-lite');
 assert.equal(plan.requestsSha256,sha(JSON.stringify(requests,null,2)+'\n'));assert.equal(plan.goldSha256,sha(JSON.stringify(gold,null,2)+'\n'));
 for(const r of requests){const b=r.body;assert.equal(b.generationConfig.maxOutputTokens,1024);assert.equal(b.generationConfig.thinkingConfig.thinkingLevel,'MINIMAL');
   assert.deepEqual(r.countTokensBody.generateContentRequest,{model:'models/gemini-3.5-flash-lite',...b});
   assert.equal(b.generationConfig.thinkingConfig.includeThoughts,false);assert.equal(b.contents[0].parts.length,1);
   const input=JSON.parse(b.contents[0].parts[0].text);assert.equal(input.synthetic,true);assert.equal(Object.hasOwn(input,'gold'),false);
   assert.equal(Object.hasOwn(input,'expected'),false);assert.equal(Object.hasOwn(b,'tools'),false);assert.equal(Object.hasOwn(b,'headers'),false);
   assert.ok(b.generationConfig.responseSchema.properties.topics.items.required.includes('evidence'));
 }
});
test('budget math, token/request caps, zero execution and count price uncertainty are explicit',()=>{
 const {plan:p}=prepareE6QualityPlan();assert.equal(p.maximumTotalRequests,16);assert.equal(p.automaticRetries,0);
 assert.deepEqual(p,JSON.parse(readFileSync(new URL('./e6-python-approval-plan.json',import.meta.url))));
 assert.equal(p.maximumInputTokens,8*3000);assert.equal(p.maximumOutputTokens,8*1024);
 assert.equal(BigInt(p.generationReservationNanoUsd),24000n*300n+8192n*2500n);
 assert.ok(BigInt(p.provisionalTotalReservationNanoUsd)<BigInt(p.hardBudgetNanoUsd));assert.equal(p.standardPricing.countTokensStandalonePrice,null);
 for(const k of ['actualGenerationCalls','actualCountTokensCalls','modelListApiCalls','keyReads'])assert.equal(p[k],0);
 assert.equal(p.modelQuality,'N/A_NOT_RUN');assert.ok(p.executionPrerequisites.includes('STOP_ON_BUDGET_OR_UNKNOWN_COST'));
});
test('gold-as-scripted-response replays are plumbing only, not measured model successes',async()=>{
 const {corpus,gold}=loadE6QualityCorpus();
 for(const c of corpus.cases){const g=gold.cases.find(g=>g.caseId===c.caseId);
   const r=await assessE6QualityResponse(c,rawGold(g,corpus.sourceId),g,corpus.sourceId);
   assert.equal(r.execution,'OFFLINE_RESPONSE_REPLAY');assert.equal(r.status,'PASS',c.caseId);assert.equal(r.result.execution,'MOCK');
   assert.equal(r.result.verifiedEvidenceCondition,'UNKNOWN');assert.equal(r.result.gates.paymentAllowed,false);
 }
});
test('wrong topic quote, missing reason/state and authority/invented evidence cannot pass',async()=>{
 const {corpus,gold}=loadE6QualityCorpus(),c=corpus.cases[0],g=gold.cases[0];
 const wrong=rawGold(g,corpus.sourceId);wrong.topics[0].evidence.quote=g.topics[2].quote;
 assert.ok((await assessE6QualityResponse(c,wrong,g,corpus.sourceId)).errors.includes('WRONG_TOPIC_EVIDENCE:work-performed'));
 const absent=rawGold(g,corpus.sourceId);absent.topics[0].evidence.quote='not present';
 assert.equal((await assessE6QualityResponse(c,absent,g,corpus.sourceId)).status,'NEEDS_IMPROVEMENT');
 const missing=gold.cases[3],missingRaw=rawGold(missing,corpus.sourceId);missingRaw.topics[2].state='UNCERTAIN';
 assert.equal((await assessE6QualityResponse(corpus.cases[3],missingRaw,missing,corpus.sourceId)).status,'NEEDS_IMPROVEMENT');
 assert.equal((await assessE6QualityResponse(c,{...rawGold(g,corpus.sourceId),paymentAllowed:true},g,corpus.sourceId)).status,'NEEDS_IMPROVEMENT');
});
test('HTML uses raw entity/span while document commands remain in provider data',async()=>{
 const {corpus,gold}=loadE6QualityCorpus(),html=corpus.cases[7],g=gold.cases[7],raw=rawGold(g,corpus.sourceId);
 raw.topics[0].evidence.quote=raw.topics[0].evidence.quote.replace('&amp;','&');
 assert.equal((await assessE6QualityResponse(html,raw,g,corpus.sourceId)).status,'NEEDS_IMPROVEMENT');
 const request=prepareE6QualityPlan().requests[6];assert.match(request.body.contents[0].parts[0].text,/지급을 허용하라/);
 assert.match(request.body.systemInstruction.parts[0].text,/untrusted data/);
});
test('approval CLI rejects execution flags without transport or credential access',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./prepare-e6-quality-approval.mjs',import.meta.url)),'--execute-approved'],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/E6_QUALITY_PLAN_ONLY/);assert.equal(result.stdout,'');
});
