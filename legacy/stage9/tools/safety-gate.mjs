import {validateSchema} from './validate-schema.mjs';
export const criticalFields=['refundAmount','recipient','requiredEvidence','completionDeadline','claimDeadline','approvalActor','exceptions'];
// C's predeclared local policy, not semantic entailment or on-chain verification.
export function safetyGate(output, packet, schema) {
  const structure=validateSchema(output,schema);
  if(structure.length)return {output:null,executable:false,errors:structure,kind:'STRUCTURE_ERROR'};
  const errors=[];
  const ids=new Set(packet.spans.map(s=>s.spanId));
  const fail=rule=>errors.push({rule});
  if(output.sourceId!==packet.sourceId)fail('SOURCE_MISMATCH');
  for(const link of output.evidenceSpans)if(!ids.has(link.spanId))fail('UNKNOWN_SPAN');
  for(const f of criticalFields)for(const id of output[f].spanIds)if(!ids.has(id))fail('UNKNOWN_SPAN');
  if(output.executable) {
    if(output.classification!=='SUPPORTED'||output.unsupportedConditions.length||output.clarificationQuestions.length)fail('UNRESOLVED');
    for(const f of criticalFields){
      const v=output[f];
      if(v.status!=='SUPPORTED'||v.value===null||!v.spanIds.length)fail('UNRESOLVED_'+f);
      if(v.spanIds.some(id=>!output.evidenceSpans.some(x=>x.field===f&&x.spanId===id)))fail('UNLINKED_'+f);
    }
    if(output.refundAmount.value!=='50'||output.refundAmount.unit!=='TEST'||output.refundAmount.basis!=='FIXED')fail('AMOUNT_PROFILE');
    const address=v=>typeof v==='string'&&/^0x[0-9a-fA-F]{40}$/.test(v)&&!/^0x0{40}$/.test(v);
    if(output.recipient.kind!=='ADDRESS'||!address(output.recipient.value))fail('RECIPIENT_PROFILE');
    if(output.approvalActor.kind!=='ISSUER_ADDRESS'||!address(output.approvalActor.value))fail('ISSUER_PROFILE');
    if(output.requiredEvidence.kind!=='SIGNED_SUBMISSIONS'||JSON.stringify([...(output.requiredEvidence.value??[])].sort())!==JSON.stringify(['SUBMISSION_0','SUBMISSION_1','SUBMISSION_2','SUBMISSION_3']))fail('EVIDENCE_PROFILE');
    const deadline=v=>typeof v.value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(v.value)&&Number.isFinite(Date.parse(v.value))&&typeof v.timeZone==='string'&&v.timeZone.length>0;
    if(!deadline(output.completionDeadline)||!deadline(output.claimDeadline)||Date.parse(output.completionDeadline.value)>Date.parse(output.claimDeadline.value))fail('DEADLINE_PROFILE');
    if(output.exceptions.completeness!=='EXPLICIT_NONE'||!Array.isArray(output.exceptions.value)||output.exceptions.value.length)fail('EXCEPTIONS_PROFILE');
  }
  return {output:{...output,executable:output.executable&&!errors.length},executable:output.executable&&!errors.length,errors,kind:errors.length?'POLICY_BLOCK':'UNCHANGED'};
}
