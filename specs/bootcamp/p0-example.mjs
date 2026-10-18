// New invented fixtures only. No real account, certificate, proof, Moodle numeric ID or keys.
import {readFileSync} from 'node:fs';
import {bytesDigest} from '../../src/product-workflow/contract.mjs';
import {P0_POLICY,P0_GATES,BOOTCAMP_CONTRACT,p0Hash,p0PolicyHash,referenceP0Decision} from './p0-contract.mjs';
export function bootcampP0Example(){
 const reflection=JSON.parse(readFileSync(new URL('./reflection-example.json',import.meta.url)));
 const participantId='participant-demo-a',applicationId='application-demo-a',time=1900000000;
 const evidence=P0_POLICY.criteria.map((c,i)=>({version:BOOTCAMP_CONTRACT,evidenceId:'evidence-demo-'+(i+1),evidenceRevision:1,participantId,applicationId,
  policyHash:p0PolicyHash(P0_POLICY),criterionId:c.criterionId,capability:c.capability,dataMode:'SYNTHETIC_FIXTURE',
  source:{provider:i===3?'synthetic-reclaim':'synthetic-moodle',instanceRef:'isolated-demo',recordRef:'synthetic-record-'+(i+1),accountBindingRef:'synthetic-account-map'},
  acquiredAt:time,verifiedAt:time+1,facts:{capability:c.capability,targetLogicalId:c.targetLogicalId,...(i===0?{completionState:'COMPLETED',completionMode:'AUTOMATIC',completionRuleHash:p0Hash('SYNTHETIC-RULE','activity'),sourceCompletedAt:null}:i===1?{submissionState:'SUBMITTED',sourceSubmittedAt:null}:i===2?{originalBodyHash:bytesDigest(Buffer.from(reflection.text,'utf8')),topics:c.predicate.topics.map(topicId=>{const quote=reflection.topicQuotes[topicId],start=reflection.text.indexOf(quote);return {topicId,state:'PRESENT',originalEvidenceLocator:{sourceId:'synthetic-original-reflection',start,end:start+quote.length,quoteHash:bytesDigest(Buffer.from(quote,'utf8'))}};}),observationRunId:'reflection-run-demo',observationProfileHash:p0Hash('SYNTHETIC-PROFILE','reflection')}:
   {certificateName:'Python (Basic)',issuerStatus:'test_passed',accountProofHash:p0Hash('SYNTHETIC-PROOF','account'),certificateProofHash:p0Hash('SYNTHETIC-PROOF','certificate'),sourceUsernameHash:p0Hash('SYNTHETIC-USERNAME','learner-demo'),certificateIdHash:p0Hash('SYNTHETIC-CERTIFICATE','certificate-demo'),claimOwnerHash:p0Hash('SYNTHETIC-OWNER','owner-demo'),accountProofIssuedAt:time,certificateProofIssuedAt:time,achievementAt:null})},sourceVersion:'synthetic-source.1',sourceHash:p0Hash('SYNTHETIC-SOURCE',c.criterionId),
  runtimeMappingHash:p0Hash('SYNTHETIC-MAPPING','logical-only-no-real-ids'),requestHash:p0Hash('SYNTHETIC-REQUEST',c.criterionId),
  verification:{sourceStatus:'MOCK_VERIFIED',participantBinding:'VERIFIED',requestBinding:'VERIFIED',integrity:'VERIFIED',freshness:'VERIFIED'},condition:'MET',
  rawLocator:{recordRef:'synthetic-raw-'+(i+1),fieldPath:i===3?'/certificate/status':'/source/state',expiresAt:time+1800},previousEvidenceId:null,gates:P0_GATES}));
 const decision=referenceP0Decision({participantId,applicationId,evidence,evaluatedAt:time+2});
 const allocation={applicationId,targetDecisionHash:decision.decisionHash,recipientRef:decision.recipientRef,allocationId:'allocation-demo',status:'FULLY_ALLOCATED',amountAtoms:P0_POLICY.amount.amountAtoms};
 const consent={version:BOOTCAMP_CONTRACT,consentId:'consent-demo',targetDecisionId:decision.decisionId,targetDecisionRevision:decision.decisionRevision,
  targetDecisionHash:decision.decisionHash,actorRef:participantId,actorRole:'PARTICIPANT',recordedAt:time+3,reason:'AGREE_SAME_RESULT',evidenceRefs:[]};
 const objection={version:BOOTCAMP_CONTRACT,requestId:'objection-demo',targetDecisionId:decision.decisionId,targetDecisionRevision:decision.decisionRevision,
  targetDecisionHash:decision.decisionHash,actorRef:participantId,recordedAt:time+3,reason:'SOURCE_VERSION_MISMATCH',evidenceRefs:[],processingStatus:'RECEIVED',validityStatus:'UNASSESSED',deadlineExtensionAllowed:false};
 const payout={version:BOOTCAMP_CONTRACT,applicationId,targetDecisionId:decision.decisionId,targetDecisionRevision:decision.decisionRevision,targetDecisionHash:decision.decisionHash,
  recipientRef:'recipient-demo-a',amountAtoms:P0_POLICY.amount.amountAtoms,allocationId:allocation.allocationId,idempotencyKey:'payout-demo',txState:'NOT_SUBMITTED',gates:P0_GATES};
 return {reflection,policy:P0_POLICY,participantId,applicationId,time,evidence,decision,allocation,consent,objection,payout};
}
