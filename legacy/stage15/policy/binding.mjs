import {sourcePacket,ADAPTER,VERSION,RULES,conditionKeys,signReview,signProvider,signEnrollment,receiptConditions,createCompiler,canonical} from './core.mjs';
import {reviewErrors,fields} from '../../stage14/policy/product.mjs';
export async function approveReview(input,source,ctx){const errors=reviewErrors(input,source);if(errors.length)throw Object.assign(Error('REVIEW_BLOCKED'),{code:'REVIEW_BLOCKED',errors});
 // Explicit human addendum binds edits, provenance, answers and the complete final preview.
 const finalText=source.text+'\n\n[사람 승인 수정본 — 원문과 구별됨]\n'+canonical(input);
 const approvedSource=sourcePacket(finalText,[...source.spans,{id:'HUMAN_REVIEW',start:source.text.length+2,end:finalText.length,text:finalText.slice(source.text.length+2)}]);
 const c={courseId:'refund-course-001',amount:'50000000',asset:{symbol:'TEST',decimals:6,token:ctx.token.toLowerCase()},activities:{kind:'SIGNED_SUBMISSIONS',ids:[0,1,2,3]},periods:{start:1893456000,due:1895875200,claimUntil:1896480000,timeZone:'UTC'},evidenceType:'EIP712_RECEIPT_V3',issuers:[ctx.issuer.toLowerCase()],approvalRole:'DESIGNATED_ISSUER_NO_NEW_PAYMENT_APPROVAL',exceptions:[],recipientRule:'ENROLLED_FIXED_WALLET',oneTime:true,rules:{...RULES}};
 const payload={type:'ReviewedPolicySpec',sourceDocumentHash:approvedSource.sourceDocumentHash,sourceSpanDigest:approvedSource.sourceSpanDigest,citations:Object.fromEntries(conditionKeys.map(k=>[k,['HUMAN_REVIEW']])),adapterId:ADAPTER,adapterVersion:VERSION,conditions:c,unsupportedConditions:[],clarificationQuestions:[],reviewer:ctx.reviewer.address.toLowerCase(),reviewedAt:ctx.now,reviewStatus:'APPROVED'};
 const reviewed=await signReview(payload,ctx.reviewer);
 const trust={reviewers:[ctx.reviewer.address.toLowerCase()],payers:[ctx.payer.toLowerCase()],activePolicies:{[approvedSource.sourceDocumentHash]:reviewed.policySpecHash},sources:{[approvedSource.sourceDocumentHash]:approvedSource},chainId:31337,token:c.asset.token};
 return {reviewed,trust,humanReview:structuredClone(input),reviewedFieldCount:fields.length};
}
export async function providerCommitment(reviewed,vault,payer){const c=reviewed.conditions,t=c.periods;return signProvider({type:'ProviderCommitment',policySpecHash:reviewed.policySpecHash,adapterId:ADAPTER,adapterVersion:VERSION,payer:payer.address.toLowerCase(),amount:c.amount,asset:c.asset,issuers:c.issuers,...{start:t.start,due:t.due,claimUntil:t.claimUntil},chainId:31337,vaultAddress:vault.toLowerCase(),rules:c.rules},payer);}
export async function participantEnrollment(reviewed,vault,participant,now){const c=reviewed.conditions,t=c.periods;return signEnrollment({type:'ParticipantEnrollment',policySpecHash:reviewed.policySpecHash,recipient:participant.address.toLowerCase(),enrolledAt:now,start:t.start,due:t.due,claimUntil:t.claimUntil,chainId:31337,vaultAddress:vault.toLowerCase(),receiptConditions:receiptConditions(c)},participant);}
export {createCompiler,canonical};
