import {requireRule as check} from './vendor/b-peer/contract.mjs';

// B-owned DTO proposal supplied by HQ on 2026-11-04. OFFLINE engines must
// provide a separate test adapter; these serializers never relabel mock results.
export const peerReceipts=Object.freeze({
  id:'clear-preview-peer-receipts.1',
  ready:true,
  context(value) {return {version:'clear-preview-context-receipt.1',...value};},
  draft({input,proposal,actualModelCall,modelProvenance}) {
    check(actualModelCall===true && modelProvenance==='ACTUAL_GEMINI_HTTP','RECEIPT_PROVENANCE');
    return {version:'clear-preview-peer-draft.1',input,proposal,modelProvenance,actualModelCall};
  },
  review(value) {return {version:'clear-preview-review-receipt.1',...value};},
  observation({observation,modelExecution}) {
    check(modelExecution==='ACTUAL','RECEIPT_PROVENANCE');
    return {version:'clear-preview-observation-receipt.1',observation,modelProvenance:'ACTUAL_GEMINI_HTTP',
      observationProvenance:'B_VERIFIED_MOODLE',dataMode:'SYNTHETIC_ONLY',automaticEligibility:false,paymentAllowed:false};
  }
});
