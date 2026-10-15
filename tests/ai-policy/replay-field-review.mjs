// Replay stored synthetic model responses. Does not import transport or read a key.
import { readFile } from 'node:fs/promises';
import { reviewFields } from '../../src/ai-policy/field-review.mjs';
const cases=[];
for(const filename of ['gemini-pilot-result.json','gemini-comparison-result.json']){
 const report=JSON.parse(await readFile(new URL('../../docs/ai-vision/'+filename,import.meta.url),'utf8'));
 const original=report.attempts.find(item=>item.caseId==='T04'&&item.result);
 const reviewed=reviewFields({fields:original.result.fields,questions:original.result.questions,flags:original.result.flags},original.result.fields.map(field=>field.fieldId));
 cases.push({sourceFile:filename,sourceModel:report.model,sourcePromptVersion:report.promptVersion,fixtureHash:original.fixtureHash,caseId:original.caseId,
  observedScore:original.result.fields.find(field=>field.fieldId==='score').value,
  consumedScore:reviewed.fields.find(field=>field.fieldId==='score').value,review:reviewed});
}
console.log(JSON.stringify({kind:'OFFLINE_SYNTHETIC_ACTUAL_RESPONSE_REPLAY',actualModelCalls:0,livePromptV3Evaluated:false,cases},null,2));
if(cases.some(item=>item.consumedScore!==null))process.exitCode=1;
