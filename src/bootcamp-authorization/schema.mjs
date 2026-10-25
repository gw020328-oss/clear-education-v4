import {freeze} from '../policy/values.mjs';
export const VERSION='clear-bootcamp-payment-authorization.2';
export const PRIMARY_TYPE='BootcampPaymentAuthorizationV2';
export const DOMAIN_NAME='ClearBootcampPayment';
export const DOMAIN_VERSION='2';
export const DOMAIN_FIELDS=freeze([
 ['name','string'],['version','string'],['chainId','uint256'],['verifyingContract','address'],['salt','bytes32'],
].map(([name,type])=>({name,type})));
export const MESSAGE_FIELDS=freeze([
 ['applicationId','bytes32'],['policyHash','bytes32'],['runtimeMappingHash','bytes32'],
 ['decisionId','bytes32'],['decisionRevision','uint64'],['decisionHash','bytes32'],
 ['recipient','address'],['token','address'],['amountAtoms','uint256'],['allocationId','bytes32'],
 ['consentSetHash','bytes32'],['deadlinePolicyHash','bytes32'],['eligibilityRoute','uint8'],
 ['nonce','bytes32'],['issuedAt','uint64'],['expiresAt','uint64'],['signerKeyId','bytes32'],['authorizationEpoch','uint64'],
].map(([name,type])=>({name,type})));
export const TYPES=freeze({[PRIMARY_TYPE]:MESSAGE_FIELDS});
export const ROUTES=freeze({BOTH_PARTIES_SAME_DECISION_CONSENT:'1',NO_VALID_OBJECTION_AFTER_FIXED_DEADLINE:'2'});
export const GATES=freeze({usableForIssuance:false,paymentAllowed:false,productionEnabled:false,grant:'HOLD',outbox:'HOLD',independentClaim:'NO_GO'});
export const OPEN_GATES=freeze(['G2_DEADLINE_AND_UNRESOLVED_OWNERSHIP','G3_ROLES_AND_KEY_LIFECYCLE','G4_OBLIGATION_ALLOCATION_ORDER','G5_CHAIN_FINALITY_AND_GAS','G6_ACTUAL_SOURCE_AND_P3_ACCEPTANCE']);
export const PROPOSAL=freeze({version:VERSION,encodingRevision:1,status:'PROPOSED_NOT_COMMON_TYPE_FREEZE',primaryType:PRIMARY_TYPE,domainFields:DOMAIN_FIELDS,messageFields:MESSAGE_FIELDS,domainName:DOMAIN_NAME,domainVersion:DOMAIN_VERSION,instanceIdEncoding:'DOMAIN_SALT',routes:ROUTES,fixedAmountAtoms:'100000000',tokenDecimals:'6',authorizationEpochScope:'APPLICATION',gates:GATES});
