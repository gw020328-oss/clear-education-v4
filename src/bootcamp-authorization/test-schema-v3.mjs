import {freeze} from '../policy/values.mjs';
import {DOMAIN_FIELDS,MESSAGE_FIELDS as V2_FIELDS,GATES} from './schema.mjs';
export {DOMAIN_FIELDS,GATES};
export const VERSION='clear-bootcamp-test-payment-authorization.3';
export const PRIMARY_TYPE='BootcampTestPaymentAuthorizationV3';
export const DOMAIN_NAME='ClearBootcampTestPayment';
export const DOMAIN_VERSION='3';
export const PROFILE_ID='clear-hackathon-test-operations.1';
export const PROFILE_COMMIT='67b6a0731f97df98fda7820ab24ed85a57796a83';
export const PROFILE_HASH='0x47a18b20a02a8acf89160c50601b8a2625bcae432292d9cf6d4644af0a2fdb98';
export const MESSAGE_FIELDS=freeze([...V2_FIELDS,
 {name:'operationsPolicyHash',type:'bytes32'}, {name:'procedureId',type:'bytes32'},
 {name:'firstReviewStartedAt',type:'uint64'}, {name:'decisionPublishedAt',type:'uint64'},
 {name:'sourceValidUntilExclusive',type:'uint64'}, {name:'revalidationCount',type:'uint8'},
]);
export const TYPES=freeze({[PRIMARY_TYPE]:MESSAGE_FIELDS});
export const PROPOSAL=freeze({version:VERSION,encodingRevision:1,status:'E2_PROPOSAL_REQUIRES_COMMON_CONSUMER_ACCEPTANCE',profileId:PROFILE_ID,profileCommit:PROFILE_COMMIT,profileHash:PROFILE_HASH,primaryType:PRIMARY_TYPE,
 domainFields:DOMAIN_FIELDS,messageFields:MESSAGE_FIELDS,domainName:DOMAIN_NAME,domainVersion:DOMAIN_VERSION,instanceIdEncoding:'DOMAIN_SALT',
 deadlineRecordVersion:'clear-bootcamp-test-first-accept-window.3',routes:{'1':'CURRENT_MUTUAL_APP_CONSENT','2':'CURRENT_DECISION_FULL_120_SECONDS'},
 confirmationSeconds:'120',maxRevalidations:'1',totalReviewSeconds:'600',fixedAmountAtoms:'100000000',tokenDecimals:'6',
 acceptedRightClaimExpiry:null,acceptedRightRequiresCurrentSigner:false,authorizationEpochScope:'APPLICATION',gates:GATES});
