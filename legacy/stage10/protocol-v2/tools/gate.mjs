import {validateSchema} from '../../../stage9/tools/validate-schema.mjs';
import {runtimeGate} from './runtime-gate.mjs';
export function applyGate(output,input,schema){
 const errors=validateSchema(output,schema);
 if(errors.length)return {output:null,policyAccepted:false,runtimeExecutable:false,errors,kind:'SCHEMA_ERROR'};
 const ids=new Set(input.spans.map(x=>x.spanId));
 if(output.sourceId!==input.sourceId)errors.push({rule:'SOURCE_MISMATCH'});
 for(const [field,v]of Object.entries(output.policyFields)){
  if(v.spanIds.some(id=>!ids.has(id)))errors.push({field,rule:'UNKNOWN_SPAN'});
  if(v.status!=='NOT_STATED'&&(!v.spanIds.length||!v.text))errors.push({field,rule:'UNLINKED_VALUE'});
 }
 if(output.policyLabel==='POLICY_SUPPORTED'){
  for(const f of ['amount','activities','claimPeriod'])if(output.policyFields[f].status!=='EXTRACTED')errors.push({field:f,rule:'UNRESOLVED_CORE'});
  if(Object.values(output.policyFields).some(x=>x.status==='AMBIGUOUS')||output.unsupportedReasons.length)errors.push({rule:'CONTRADICTORY_POLICY_LABEL'});
 }
 const policyAccepted=output.policyLabel==='POLICY_SUPPORTED'&&!errors.length;
 const runtime=runtimeGate(input.runtime??null);
 return {output:{...output,policyLabel:errors.length&&output.policyLabel==='POLICY_SUPPORTED'?'CLARIFICATION_REQUIRED':output.policyLabel,runtimeExecutable:policyAccepted&&output.runtimeExecutable&&runtime.runtimeExecutable},policyAccepted,runtimeExecutable:policyAccepted&&output.runtimeExecutable&&runtime.runtimeExecutable,errors,runtime,kind:errors.length?'POLICY_BLOCK':'VALID'};
}
