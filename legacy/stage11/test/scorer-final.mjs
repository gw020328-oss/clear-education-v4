import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {score,fields,compareArms} from '../scoring-v3/score-final.mjs';
const value=(v,spanIds=['S1'])=>({status:'EXTRACTED',value:v,spanIds});
const amount={fixedAmount:{units:'50000000',unit:'TEST'},rate:{numerator:22,denominator:100},multiplier:{numerator:2,denominator:1},cap:null,deductionOrder:['TAX','MULTIPLY']};
const period={kind:'ABSOLUTE',start:2000000000,end:2000000100,unit:'SECONDS',timeZone:'UTC'};
const output={type:'PolicyProposal',sourceId:'SYNTHETIC',sourceDocHash:'0x'+'11'.repeat(32),classification:'POLICY_SUPPORTED',fields:{amount:value(amount),asset:value('TEST'),activities:value(['SUBMIT_0','SUBMIT_1','SUBMIT_2','SUBMIT_3']),completionPeriod:value(period),claimPeriod:value({...period,end:2000000200}),evidenceType:value('SIGNED'),approvalRole:value('ISSUER'),exceptions:value([]),recipient:{status:'NOT_STATED',value:null,spanIds:[]}},unsupportedConditions:[],clarificationQuestions:[]};
const reference={classification:output.classification,fields:structuredClone(output.fields),questionFields:[],unsupportedConditions:[]},source={sourceId:output.sourceId,sourceDocHash:output.sourceDocHash,spans:[{id:'S1',text:'Synthetic fixture: 50 TEST, tax 22%, then multiply by 2; four submissions, UTC deadlines, issuer signing, no exceptions.'},{id:'S2',text:'Unrelated synthetic sentence.'}]};
const results=[];
const test=(id,fn)=>{try{fn();results.push({id,pass:true});}catch(e){results.push({id,pass:false,error:e.message});}};
test('normal-complete',()=>assert.equal(score(output,reference,source).normalPass,true));
for(const v of [null,'','  ','NOT_STATED','none specified','(no value)',[]])test('D01-missing-'+JSON.stringify(v),()=>{const o=structuredClone(output);o.fields.recipient.value=v;assert.equal(score(o,reference,source).normalPass,true);});
const mutate=(fn)=>{const o=structuredClone(output);fn(o);return score(o,reference,source);};
test('D02-unknown-field-asserted',()=>assert.equal(mutate(o=>o.fields.recipient=value('invented wallet')).normalPass,false));
test('D03-22-percent-is-not-times-2',()=>{const s=mutate(o=>{o.fields.amount.value.multiplier=null;});assert.equal(s.fieldResults.amount.correct,false);});
test('operator-replacement',()=>assert.equal(mutate(o=>o.fields.amount.value.multiplier={numerator:22,denominator:100}).normalPass,false));
test('amount-substring',()=>assert.equal(mutate(o=>o.fields.amount.value.fixedAmount.units='150000000').normalPass,false));
test('rate-change',()=>assert.equal(mutate(o=>o.fields.amount.value.rate.numerator=2).normalPass,false));
test('currency-change',()=>assert.equal(mutate(o=>o.fields.amount.value.fixedAmount.unit='KRW').normalPass,false));
test('cap-invented',()=>assert.equal(mutate(o=>o.fields.amount.value.cap={units:'50',unit:'TEST'}).normalPass,false));
test('deduction-order',()=>assert.equal(mutate(o=>o.fields.amount.value.deductionOrder.reverse()).normalPass,false));
test('fake-span-immediate-reject',()=>assert.equal(mutate(o=>o.fields.amount.spanIds=['FAKE']).outcome,'INVALID_EVIDENCE'));
test('existing-span-wrong-semantic-link',()=>assert.equal(mutate(o=>o.fields.amount.spanIds=['S2']).normalPass,false));
test('no-grounding',()=>assert.equal(mutate(o=>o.fields.amount.spanIds=[]).normalPass,false));
test('deadline-plus-one',()=>assert.equal(mutate(o=>o.fields.claimPeriod.value.end++).normalPass,false));
test('zero-denominator',()=>assert.equal(mutate(o=>o.fields.amount.value.rate.denominator=0).outcome,'FORMAT_FAILURE'));
test('format-is-not-safe-abstention',()=>{const r=score({},reference,source);assert.equal(r.safeAbstention,false);assert.equal(r.majorError,true);});
test('execution-authority-field-rejected',()=>assert.equal(mutate(o=>o.runtimeExecutable=true).formatValid,false));
test('explicit-empty-exceptions-not-unknown',()=>assert.equal(mutate(o=>o.fields.exceptions={status:'NOT_STATED',value:null,spanIds:[]}).normalPass,false));
test('source-mismatch',()=>assert.equal(mutate(o=>o.sourceId='OTHER').outcome,'SOURCE_MISMATCH'));
test('correct-supported-unsupported-clarification',()=>{
 for(const classification of ['POLICY_UNSUPPORTED','CLARIFICATION_REQUIRED']){const o=structuredClone(output),r=structuredClone(reference);o.classification=r.classification=classification;
  if(classification==='POLICY_UNSUPPORTED'){o.unsupportedConditions=r.unsupportedConditions=['MEDICAL_DISCRETION'];}
  else{o.clarificationQuestions=[{field:'recipient',text:'수령 대상은 누구인가?'}];r.questionFields=['recipient'];}
  assert.equal(score(o,r,source).safeAbstention,true);
 }
});
test('all-blocked-not-product-success',()=>{const blocked=mutate(o=>o.classification='POLICY_UNSUPPORTED');assert.equal(compareArms([blocked],[blocked]).advantageCandidate,false);});
test('equivalent-property-order',()=>{const o=JSON.parse(JSON.stringify(output,null,4));o.fields=Object.fromEntries(Object.entries(o.fields).reverse());assert.equal(score(o,reference,source).normalPass,true);});
test('all-required-grounding-spans-must-be-present',()=>{const {output:o,reference:r,source:s}=JSON.parse(fs.readFileSync(new URL('../artifacts/scorer-multispan-probe.json',import.meta.url)));assert.equal(score(o,r,s).normalPass,false);o.fields.amount.spanIds=['S1','S3'];assert.equal(score(o,r,s).normalPass,true);});
const dir=fs.mkdtempSync(fileURLToPath(new URL('../artifacts/scorer-',import.meta.url)));
fs.writeFileSync(dir+'/results.json',JSON.stringify({at:new Date().toISOString(),dataKind:'SYNTHETIC_SCORER_UNIT_FIXTURES',passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results,baseFixture:{output,reference,source},modelCalls:0,publicSemanticCases:0},null,2)+'\n');
console.log(JSON.stringify({dir,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length}));if(results.some(r=>!r.pass))process.exitCode=1;
