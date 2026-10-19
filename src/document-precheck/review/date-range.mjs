import {exactKeys, requireRule as check, freeze} from '../../policy/values.mjs';

// Deterministic primitive only; not an added requirement or receipt verifier.
// Epoch seconds must come from a host-reviewed source projection, never OCR.
// The caller must pin this interpretation in a future agreed policy contract.
export function checkReviewDateRange(value, rule) {
  exactKeys(rule,['basis','from','until','boundaries'],'REVIEW_DATE_RULE');
  check(['OPEN','SYNTHETIC_ASSUMPTION'].includes(rule.basis),'REVIEW_DATE_RULE');
  if (rule.basis === 'OPEN') return freeze({status:'POLICY_OPEN',paymentAllowed:false});
  const epoch = v=>Number.isSafeInteger(v) && v >= 0 && v <= 253402300799;
  check(epoch(rule.from) && epoch(rule.until) && rule.from <= rule.until
    && ['[]','[)','(]','()'].includes(rule.boundaries),'REVIEW_DATE_RULE');
  if (value === null) return freeze({status:'UNDETERMINED',paymentAllowed:false});
  check(epoch(value),'REVIEW_DATE_VALUE');
  const met = (rule.boundaries[0] === '[' ? value >= rule.from : value > rule.from)
    && (rule.boundaries[1] === ']' ? value <= rule.until : value < rule.until);
  return freeze({status:met?'CHECKED':'MISSING',paymentAllowed:false});
}
