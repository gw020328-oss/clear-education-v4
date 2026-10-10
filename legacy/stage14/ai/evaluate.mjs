import fs from 'node:fs';
import {root,read,save,sha} from '../lib/io.mjs';
import {callGemini,budget} from './client.mjs';
import {cases,fields,expected,reviewFromDraft,reviewErrors,validateDraft} from '../policy/product.mjs';
const results=[];
for(const c of cases){const records=fs.readdirSync(root+'/artifacts/ai').filter(f=>/^attempt-\d+\.json$/.test(f)).map(f=>read('artifacts/ai/'+f));let r=records.find(r=>r.caseId===c.id&&!r.smoke);if(!r)r=await callGemini(c.source,{caseId:c.id});
 const d=r.parsed,valid=r.status==='VALID',missing=c.id==='missing'?['issuer','deadline']:c.id==='conflict'?['amount']:[];
 const record={caseId:c.id,liveResultStatus:r.status,actualModel:r.actualModel,httpNumber:r.number,jsonSchemaSuccess:valid,sourceSpanMatch:valid&&validateDraft(d,c.source).length===0,requiredFieldsExtracted:valid?fields.filter(f=>d.fields[f].value!==null).length:0,expectedMissingOrConflictFields:missing,missingOrConflictDetected:valid&&missing.every(f=>d.fields[f].value===null&&d.ambiguities.some(a=>a.field===f)),inventedUnsupportedFields:valid?missing.filter(f=>d.fields[f].value!==null):null,manualTemplateInputFields:10,aiReviewFields:valid?10:null,fieldsNeedingHumanInputOrCorrection:valid?fields.filter(f=>d.fields[f].value!==expected[f]).length:null,apiProcessingTimeMs:r.latencyMs??null,humanTimeMeasured:false,compileBeforeApproval:'BLOCKED',reviewAfterConfirmation:valid?reviewErrors({...reviewFromDraft(d),confirmed:true},c.source):null};results.push(record);
 console.log(JSON.stringify({caseId:c.id,status:r.status,missingOrConflictDetected:record.missingOrConflictDetected,...budget()}));
}
save('artifacts/ai/product-evaluation.json',{at:new Date().toISOString(),cases:results,budget:budget(),humanParticipants:0,noUserBenefitClaim:true});
const examples=cases.map(c=>{const records=fs.readdirSync(root+'/artifacts/ai').filter(f=>/^attempt-\d+\.json$/.test(f)).map(f=>read('artifacts/ai/'+f));const r=records.find(r=>r.caseId===c.id&&r.status==='VALID');return r?{id:c.id,source:c.source,draft:r.parsed,provenance:'RECORDED_GEMINI_RESPONSE',attempt:r.number}:null;}).filter(Boolean);
save('ai/cached-examples.json',{examples});save('ai/cache-checksum.json',{path:'ai/cached-examples.json',sha256:sha(fs.readFileSync(root+'/ai/cached-examples.json'))});
