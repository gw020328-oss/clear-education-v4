import * as ethers from 'ethers';
import { createValidation, AMOUNT, SCHEMA, STATEMENT, EXPIRY, receiptTypes, acceptanceTypes, EvidenceError, MAX_EVIDENCE_BYTES, MAX_JSON_DEPTH, SAFE_TOKEN_CODE_HASH } from '../shared/validation.mjs';

const V = createValidation(ethers);
export { AMOUNT, SCHEMA, STATEMENT, EXPIRY, receiptTypes, acceptanceTypes, EvidenceError, MAX_EVIDENCE_BYTES, MAX_JSON_DEPTH, SAFE_TOKEN_CODE_HASH };
export const { need, canonical, parseEvidenceText, validateTerms, termsHash, validateTrust, validateAcceptance, validateEvidence } = V;

export async function acceptTerms(trusted, wallet, time, reviewedTermsHash) {
  V.validateTrust(trusted); V.need(Number.isSafeInteger(time) && time >= 0, 'INTEGER');
  V.need(reviewedTermsHash === trusted.termsHash, 'TERMS_NOT_CONFIRMED');
  const value={termsHash:trusted.termsHash,learner:await wallet.getAddress(),acceptedAt:time};
  const result={...value,signature:await wallet.signTypedData(trusted.domain,acceptanceTypes,value)};
  V.validateAcceptance(result,trusted,value.learner,time,{registration:true}); return result;
}
export async function issueReceipt(trusted, issuer, learner, session, completedAt, time) {
  V.validateTrust(trusted); V.need(Number.isSafeInteger(session)&&session>=0&&Number.isSafeInteger(completedAt)&&Number.isSafeInteger(time),'INTEGER');
  V.need(ethers.getAddress(await issuer.getAddress())===ethers.getAddress(trusted.terms.issuer),'ISSUER');
  V.need(session<4&&completedAt>=trusted.terms.start&&completedAt<=trusted.terms.due&&completedAt<=time,'RECEIPT_TIME_SCOPE');
  const receipt={termsHash:trusted.termsHash,learner,session,completedAt};
  return {receipt,signature:await issuer.signTypedData(trusted.domain,receiptTypes,receipt)};
}
export function makeEvidence(trusted, acceptance, submissions) {
  return structuredClone({schemaVersion:SCHEMA,terms:trusted.terms,termsHash:trusted.termsHash,domain:trusted.domain,recipient:acceptance.learner,acceptance,submissions});
}
