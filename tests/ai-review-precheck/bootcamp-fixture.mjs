import {bootcampP0Example} from '../../specs/bootcamp/p0-example.mjs';
import {p0Hash,p0PolicyHash} from '../../specs/bootcamp/p0-contract.mjs';
import {bytesDigest} from '../../src/product-workflow/contract.mjs';
import {REFLECTION_CAPABILITY,REFLECTION_TOPICS,REFLECTION_PROFILE_HASH,REFLECTION_PROMPT_VERSION} from '../../src/document-precheck/review/bootcamp-reflection.mjs';
export function bootcampFixture(options={}){
  const example=bootcampP0Example(),clock={value:example.time*1000+1000},text=options.text??example.reflection.text;
  const e=example.evidence.find(e=>e.capability===REFLECTION_CAPABILITY),unavailable=options.unavailable??false;
  const context={version:'clear-bootcamp-observation-context.1',dataScope:'ISOLATED_SYNTHETIC_ACCOUNT',participantId:example.participantId,
    applicationId:example.applicationId,policyHash:p0PolicyHash(example.policy),criterionId:e.criterionId,capability:REFLECTION_CAPABILITY,
    evidenceId:e.evidenceId,evidenceRevision:options.evidenceRevision??1,sourceId:'bootcamp-reflection-original',
    sourceVersion:unavailable?null:'synthetic-reflection-source.1',sourceHash:unavailable?null:p0Hash('SYNTHETIC-REFLECTION-SOURCE',text),
    sourceReceiptHash:unavailable?null:p0Hash('SYNTHETIC-REFLECTION-RECEIPT',text),runtimeMappingHash:e.runtimeMappingHash,requestHash:e.requestHash,
    inputHash:bytesDigest(Buffer.from(text,'utf8')),normalizerVersion:null,normalizedHash:null,
    runId:options.runId??'bootcamp-reflection-run',attempt:options.attempt??1,profileHash:REFLECTION_PROFILE_HASH,modelVersion:'mock-bootcamp-reflection.1',
    promptVersion:REFLECTION_PROMPT_VERSION,issuedAtMs:clock.value-1000,expiresAtMs:clock.value+59000,sourceStatus:unavailable?'UNAVAILABLE':'OBSERVED_TARGET'};
  return {input:{context,text},context,text,clock,example,quotes:{...example.reflection.topicQuotes,...options.quotes}};
}
export function reflectionMock(f,overrides={}){
  let calls=0;
  return {execution:'MOCK',modelVersion:f.context.modelVersion,get calls(){return calls;},async observe(){calls++;
    return {topics:REFLECTION_TOPICS.map(topicId=>({topicId,state:'PRESENT',evidence:{sourceId:f.context.sourceId,quote:f.quotes[topicId]},...overrides[topicId]}))};
  }};
}
