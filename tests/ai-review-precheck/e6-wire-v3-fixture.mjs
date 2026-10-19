// Synthetic values + official REST spelling. Never a captured provider response.
import {readFileSync} from 'node:fs';
import {loadE6PaidWireV3Bundle} from './e6-paid-wire-v3-plan.mjs';
import {PAID_COST_ACK,EXISTING_PAID_KEY_SOURCE} from './e6-paid-wire-v3-plan.mjs';
const template=JSON.parse(readFileSync(new URL('./e6-rest-wire-fixture-v3.json',import.meta.url)));
export function fixtureV3(){
 const bundle=structuredClone(loadE6PaidWireV3Bundle()),p=bundle.plan,day='2026-10-19',codeState={head:'a'.repeat(40),clean:true};
 const approval={version:'clear-e6-paid-wire-v3-user-approval.3',scope:p.scope,approvedOn:day,codeHead:codeState.head,planHash:p.planHash,
  authorization:{kind:'OFFLINE_TEST_ONLY',evidenceSha256:'b'.repeat(64)},maxGenerationCalls:8,maxCountCalls:0,automaticRetries:0,continuations:0,
  keySourceFallbacks:0,modelFallbacks:0,freeFallbacks:0,keySourceId:EXISTING_PAID_KEY_SOURCE,costAcknowledgment:PAID_COST_ACK,
  pricingReview:{reviewedOn:day,inputNanoUsdPerToken:'300',outputIncludingThinkingNanoUsdPerToken:'2500',officialSource:p.officialPricingSource,
   evidenceSha256:'c'.repeat(64),basis:'OFFLINE_TEST_ONLY'},
  pins:{codeHead:codeState.head,planHash:p.planHash,corpusSha256:p.corpusSha256,goldSha256:p.goldSha256,requestsSha256:p.requestsSha256,usagePolicyHash:p.usagePolicyHash}};
 const response=(id='PY01')=>{const r=structuredClone(template);r.candidates[0].content.parts[0].text=JSON.stringify({topics:bundle.gold.cases.find(g=>g.caseId===id).topics.map(t=>({
   topicId:t.topicId,state:t.state,evidence:t.quote?{sourceId:bundle.corpus.sourceId,quote:t.quote}:null}))});return r;};
 let spent=false,time=0,factories=0;const snapshots=[],calls=[];
 const store={async claim(){if(spent)throw Error('spent');spent=true;},async checkpoint(r){snapshots.push(structuredClone(r));}};
 const transport={execution:'MOCK',async request(model,method,body){
   if(model!=='gemini-3.5-flash-lite'||method!=='generateContent')throw Error('wrong offline scope');
   calls.push(time);return response(JSON.parse(body.contents[0].parts[0].text).caseId);
 }};
 const cfg={bundle,approval,codeState,day,store,transportFactory:()=>{factories++;return transport;},nowMs:()=>time,wait:async ms=>{time+=ms;}};
 return {cfg,response,transport,snapshots,calls,factories:()=>factories};
}
