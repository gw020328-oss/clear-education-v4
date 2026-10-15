import { exampleBinding } from '../../specs/m1/examples.mjs';

// Test-operator registry, obtained out of band, never from a REST reply.
export function registryForFixture(compiled, fixture) {
  const binding=exampleBinding(compiled),sb={...fixture.config.sourceBinding,...fixture.config.accounts[String(fixture.users.one)]};
  const learning=compiled.policy.learningRules[0],period=compiled.policy.requirements.find(r=>r.requirementId==='learning').period;
  return {binding,sourceBinding:sb,sourceVersions:{clearwatch:'2026101501',clearapi:'2026101502'},period,dateVersion:learning.dateAttributionRuleVersion,
    rawBinding:{institutionId:sb.institutionId,providerInstanceId:sb.providerInstanceId,courseId:sb.courseId,cohortId:compiled.policy.cohortId,
      applicationId:binding.applicationId,learnerRef:'local-test-one',subjectRef:binding.subjectRef,accountBindingId:sb.accountBindingId,
      accountBindingVersion:sb.accountBindingVersion,policyHash:compiled.policyHash,policyVersion:compiled.policy.policyVersion,timeZone:'Asia/Seoul',bindingAssurance:'SOURCE_ACCOUNT_CONTROL_VERIFIED'},
    inventory:{activitySetVersion:fixture.config.inventoryVersion,activitySetHash:learning.activitySetHash,mappingVersion:'local-clearwatch-map.1',providerRuleVersion:learning.metricRuleVersion,
      capabilities:{effectiveTime:true,mediaCoverage:true,normalClose:true,creditDay:true,officialProgress:false,speedCompliance:false,currentRevision:true,atomicExport:true,correctionHistory:true}},
    activityMappings:fixture.config.activities};
}
export function localExpectation(registry, facts, pin, approvedCorrection=false) {
  return {...registry,observationLowerBound:pin.observationLowerBound,sourceRevision:pin.revision,factsHash:facts.snapshot.normalizedDigest,
    verification:{authenticity:'LOCAL_API_AUTHENTICATED',subject:'LOCAL_TEST_ACCOUNT_BOUND',semantics:'LOCAL_LAB_MEANING',
      completeness:'LOCAL_CURRENT_EXPORT_COMPLETE',correction:pin.cause==='OBSERVED_CHANGE'?'UNKNOWN':'CURRENT'},
    ...(approvedCorrection?{approvedCorrectionRevision:pin.revision}:{})};
}
