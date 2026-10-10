import {Wallet} from 'ethers';
import {sourcePacket,ADAPTER,VERSION,RULES,conditionKeys,signReview,signProvider,signEnrollment,receiptConditions,createCompiler} from '../policy-binding/core.mjs';
export async function fixture({wallets,token='0x3333333333333333333333333333333333333333',start=2000000000,vault='0x5555555555555555555555555555555555555555'}={}){
 const [reviewer,payer,participant,issuer,other]=wallets??Array.from({length:5},()=>Wallet.createRandom());
 const lower=w=>w.address.toLowerCase();
 const c={courseId:'refund-course-001',amount:'50000000',asset:{symbol:'TEST',decimals:6,token:token.toLowerCase()},activities:{kind:'SIGNED_SUBMISSIONS',ids:[0,1,2,3]},periods:{start,due:start+86400,claimUntil:start+172800,timeZone:'UTC'},evidenceType:'EIP712_RECEIPT_V2',issuers:[lower(issuer)],approvalRole:'DESIGNATED_ISSUER_NO_NEW_PAYMENT_APPROVAL',exceptions:[],recipientRule:'ENROLLED_FIXED_WALLET',oneTime:true,rules:{...RULES}};
 const text=`합성 정책: refund-course-001. 50 TEST, 6자리, 토큰 ${c.asset.token}. 제출 번호 0,1,2,3의 EIP-712 RefundRights v2 서명 네 개. 발급자 ${c.issuers[0]}의 확인 외 새 지급 승인 없음. 시작 ${start}, 완료 ${c.periods.due}, 청구 ${c.periods.claimUntil}, UTC Unix 초 및 마감 포함. 가입한 고정 지갑으로 한 번 지급. 예외 없음. 조건 변경 불가, 기한 전 취소 불가, 기한 후 sponsor 반환만 가능.`;
 const source=sourcePacket(text,[{id:'S1',start:0,end:text.length,text}]);
 const payload={type:'ReviewedPolicySpec',sourceDocumentHash:source.sourceDocumentHash,sourceSpanDigest:source.sourceSpanDigest,citations:Object.fromEntries(conditionKeys.map(k=>[k,['S1']])),adapterId:ADAPTER,adapterVersion:VERSION,conditions:c,unsupportedConditions:[],clarificationQuestions:[],reviewer:lower(reviewer),reviewedAt:start,reviewStatus:'APPROVED'};
 const reviewed=await signReview(payload,reviewer);
 const trust={reviewers:[lower(reviewer)],payers:[lower(payer)],activePolicies:{[source.sourceDocumentHash]:reviewed.policySpecHash},sources:{[source.sourceDocumentHash]:source},chainId:31337,token:c.asset.token};
 const enrollment=async(w=participant,vaultAddress=vault)=>{
  const provider=await signProvider({type:'ProviderCommitment',policySpecHash:reviewed.policySpecHash,adapterId:ADAPTER,adapterVersion:VERSION,payer:lower(payer),amount:c.amount,asset:c.asset,issuers:c.issuers,start:c.periods.start,due:c.periods.due,claimUntil:c.periods.claimUntil,chainId:31337,vaultAddress:vaultAddress.toLowerCase(),rules:c.rules},payer);
  const enrollment=await signEnrollment({type:'ParticipantEnrollment',policySpecHash:reviewed.policySpecHash,recipient:lower(w),enrolledAt:start,start:c.periods.start,due:c.periods.due,claimUntil:c.periods.claimUntil,chainId:31337,vaultAddress:vaultAddress.toLowerCase(),receiptConditions:receiptConditions(c)},w);
  return {reviewed,provider,enrollment};
 };
 return {reviewer,payer,participant,issuer,other,source,payload,trust,compiler:createCompiler(trust),bundle:await enrollment(),enrollment,start,c};
}
