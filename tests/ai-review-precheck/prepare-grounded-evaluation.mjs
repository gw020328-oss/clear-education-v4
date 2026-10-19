// Offline only. Does not import a provider transport, read a key or spend approval.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {bytesDigest} from '../../src/product-workflow/contract.mjs';
import {groundLegacyReview} from '../../src/document-precheck/review/grounding.mjs';
import {buildReviewRequestV2,REVIEW_PROMPT_V2} from './request-builder-v2.mjs';
const root=new URL('./',import.meta.url),corpus=JSON.parse(readFileSync(new URL('evaluation-corpus.json',root)));
const actual=JSON.parse(readFileSync(new URL('actual-evaluation-20261016.json',root)));
const oldDirectory=resolve('artifacts/review-precheck-evaluation'),out=resolve('artifacts/review-precheck-grounded-v2');mkdirSync(out,{recursive:true});
const manifest=JSON.parse(readFileSync(resolve(oldDirectory,'manifest.json'))),sha=v=>createHash('sha256').update(v).digest('hex');
if(manifest.corpusSha256!==sha(readFileSync(new URL('evaluation-corpus.json',root))))throw Error('REVIEW_V2_CORPUS_PIN');
const requests=[],gold=[],replay=[];
for(const c of corpus.cases){
  const vision=c.task==='VISION';let imageBase64=null,sources;
  if(vision){
    const bytes=readFileSync(resolve(oldDirectory,c.caseId+'.png'));
    if(sha(bytes)!==manifest.images.find(i=>i.caseId===c.caseId)?.sha256)throw Error('REVIEW_V2_IMAGE_PIN');
    imageBase64=bytes.toString('base64');sources=[{sourceId:'review-image',kind:'IMAGE',bytes,sha256:bytesDigest(bytes)}];
  }else sources=[{sourceId:'review-text',kind:'TEXT',text:c.text}];
  const result=groundLegacyReview(actual.attempts.find(a=>a.caseId===c.caseId).rawObservation,corpus.requestedFieldIds,sources);
  const observed=result.fields[0];
  replay.push({caseId:c.caseId,execution:'OFFLINE_LEGACY_REPLAY',originalModelEvaluationUnchanged:true,...result,
    sourceFixtureComparison:c.sourceFixture?observed.candidateValue!==null&&observed.candidateValue!==c.sourceFixture.value?'CONFLICT':'UNDETERMINED':null});
  requests.push({caseId:c.caseId,body:buildReviewRequestV2({caseId:c.caseId,text:c.text??'SYNTHETIC REVIEW. Read the declared image only.',imageBase64})});
  gold.push({caseId:c.caseId,fieldId:'course-label',state:c.expected===null?c.flags[0]:'OBSERVED',value:c.expected,
    sourceFixture:c.sourceFixture??null,expectedComparison:c.expectedComparison??null});
}
const requestBytes=JSON.stringify(requests,null,2)+'\n',goldBytes=JSON.stringify(gold,null,2)+'\n';
writeFileSync(resolve(out,'requests.json'),requestBytes);writeFileSync(resolve(out,'gold.json'),goldBytes);
writeFileSync(resolve(out,'legacy-replay.json'),JSON.stringify(replay,null,2)+'\n');
const plan={execution:'DRY_RUN_NEW_APPROVAL_REQUIRED',promptVersion:REVIEW_PROMPT_V2,actualApiCalls:0,actualModelCalls:0,
  requestCount:8,maxGenerationCalls:8,maxCountTokensCalls:8,maxOutputTokens:1024,requestedBudgetUsd:'0.05',automaticRetries:0,
  modelProposal:'gemini-3.5-flash-lite',thinkingProposal:'MINIMAL',corpusSha256:manifest.corpusSha256,
  requestsSha256:sha(requestBytes),goldSha256:sha(goldBytes),
  offlineReplay:{normalCandidatesRetained:replay.filter(r=>['RT01','RT02','RV01'].includes(r.caseId)&&r.fields[0].state==='OBSERVED_ONLY').length,
    nullsWithUnknownReasonAndSupplement:replay.filter(r=>r.fields[0].reason==='REASON_NOT_PROVIDED'&&r.fields[0].supplement).length,
    exactOriginalTextSpans:replay.filter(r=>r.fields[0].locationStatus==='EXACT_SUBMITTED_TEXT').length,
    fixtureConflict:replay.find(r=>r.caseId==='RV04').sourceFixtureComparison},
  realModelV2Tested:false};
writeFileSync(resolve(out,'plan.json'),JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify(plan,null,2));
