// Public invented addresses only: no private keys, signatures or actual claims.
import {syntheticRecipe} from '../../src/hackerrank-evidence/recipes.mjs';
import {hash} from '../../src/hackerrank-evidence/values.mjs';
import {POLICY_HASH,CRITERION,requestHash,requestMessage} from '../../src/hackerrank-evidence/request.mjs';
export function integrationVector(){
 const recipe=syntheticRecipe();
 const trustConfig={version:'clear-hackerrank-trust.1',status:'REVIEWED',dataMode:'SYNTHETIC_FIXTURE',approvalRef:'synthetic-vector-only',sourceReview:'SYNTHETIC_ONLY',contextReview:'SYNTHETIC_ONLY',audience:'synthetic-bootcamp-verifier',notBefore:1899996400,expiresAt:1900003600,signers:['0x'+'33'.repeat(20)],epochs:[1],recipe,privacyKeyId:'synthetic-key.1'};
 const request={version:'clear-hackerrank-request.1',audience:trustConfig.audience,participantId:'participant-orchid',participantWallet:'0x'+'11'.repeat(20),applicationId:'application-orchid',criterionId:CRITERION,policyHash:POLICY_HASH,runtimeMappingHash:hash('SYNTHETIC_MAPPING','bootcamp'),recipeHash:hash('RECIPE',recipe),trustConfigHash:hash('TRUST',trustConfig),expectedClaimOwner:'0x'+'22'.repeat(20),nonce:'0x'+'a1'.repeat(32),issuedAt:1899999990,expiresAt:1900000890,selectedCertificateId:null};
 const contexts=Object.fromEntries(['account','certificate'].map(role=>[role,{clearSchema:'clear-hackerrank-context.1',clearRequestHash:requestHash(request),clearSourceRole:role,clearRecipeHash:request.recipeHash}]));
 return {scope:'UNSIGNED_SYNTHETIC_HASH_VECTOR_ONLY',usableForClaim:false,ready:false,trustConfig,request,requestHash:requestHash(request),nonceHash:hash('NONCE',request.nonce),participantApprovalMessage:requestMessage(request),clientContexts:contexts};
}
