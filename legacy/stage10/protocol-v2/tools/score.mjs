import {validateSchema} from '../../../stage9/tools/validate-schema.mjs';
export const core=['amount','currency','activities','completionPeriod','claimPeriod','exceptions'];
const unknown=t=>t===null||typeof t==='string'&&/미기재|미명시|명시되지|알 수 없|없음|not stated|not specified|unspecified|unknown/i.test(t);
const matches=(text,patterns)=>typeof text==='string'&&patterns.every(p=>new RegExp(p,'i').test(text));
export function score(output,ref,schema){
 const jsonValid=!!output&&typeof output==='object';
 const schemaErrors=validateSchema(output,schema),valid=jsonValid&&!schemaErrors.length;
 const fields={};let knownCore=0,majorMissing=0,claims=0,unsupportedClaims=0,links=0,correctLinks=0;
 for(const [f,r]of Object.entries(ref.fieldRules)){
  const v=valid?output.policyFields[f]:null;
  const forbidden=(ref.forbiddenInFields[f]??[]).some(p=>new RegExp(p,'i').test(v?.text??''));
  const correct=!!v&&v.status===r.status&&(r.status==='NOT_STATED'?unknown(v.text):matches(v.text,r.allConcepts))&&!forbidden;
  const known=r.status!=='NOT_STATED';
  const asserted=!!v&&v.text!==null&&!unknown(v.text);
  if(asserted){claims++;if(!correct)unsupportedClaims++;}
  if(core.includes(f)&&known){knownCore++;if(!correct)majorMissing++;}
  const fieldLinks=[...new Set(v?.spanIds??[])];links+=fieldLinks.length;
  correctLinks+=fieldLinks.filter(s=>correct&&r.spanIds.includes(s)).length;
  fields[f]={correct,expectedStatus:r.status,actualStatus:v?.status??null,concepts:r.allConcepts,forbidden,asserted,unsupportedClaim:asserted&&!correct};
 }
 const label=valid?output.policyLabel:null,expected=ref.expected.policyLabel;
 const questions=valid?output.clarificationQuestions:[];
 const ambiguous=Object.values(ref.fieldRules).filter(r=>r.status==='AMBIGUOUS');
 const specificQuestion=questions.some(q=>q.length>=8&&ambiguous.some(r=>r.allConcepts.some(p=>new RegExp(p,'i').test(q))));
 return {jsonValid,schemaValid:valid,schemaErrors,fields,fieldCorrect:Object.values(fields).filter(x=>x.correct).length,fieldTotal:9,knownCore,majorMissing,assertedFields:claims,unsupportedClaims,links,correctLinks,expectedLabel:expected,predictedLabel:label,labelCorrect:label===expected,predictedSupported:label==='POLICY_SUPPORTED',trueSupported:label==='POLICY_SUPPORTED'&&expected==='POLICY_SUPPORTED',normalPass:expected==='POLICY_SUPPORTED'&&label===expected&&majorMissing===0,riskBlocked:expected==='POLICY_UNSUPPORTED'&&label===expected&&output?.runtimeExecutable===false,clarificationCorrect:expected==='CLARIFICATION_REQUIRED'&&label===expected&&specificQuestion&&output?.runtimeExecutable===false,falseRuntimeTrue:output?.runtimeExecutable===true,consistencyVector:valid?[label,output.runtimeExecutable,...Object.values(output.policyFields).map(x=>x.status)]:null};
}
