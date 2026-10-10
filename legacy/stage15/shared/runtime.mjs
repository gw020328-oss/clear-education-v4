// Browser/Node shared encoding. Must exactly match the v3 Solidity config layout.
// The EIP-712 domain additionally binds the chain, contract address and version.
export const CONFIG_TYPE = 'RuntimeConfig(uint32 version,address token,address sponsor,address verifier,uint256 amount,uint32 requiredReceipts,uint64 start,uint64 due,uint64 claimUntil)';
export const acceptanceTypes = {TermsAcceptance: [
  {name:'termsHash',type:'bytes32'}, {name:'runtimeConfigHash',type:'bytes32'},
  {name:'learner',type:'address'}, {name:'acceptedAt',type:'uint64'}
]};
export const receiptTypes = {Receipt: [
  {name:'termsHash',type:'bytes32'}, {name:'learner',type:'address'},
  {name:'session',type:'uint32'}, {name:'completedAt',type:'uint64'}
]};
export const domain = plan => ({name:'RefundRights',version:'3',chainId:plan.nativeTerms.chainId,verifyingContract:plan.nativeTerms.vaultAddress});
export function runtimeConfig(plan) {
  if(plan.contractVersion!==3)throw Error('CONTRACT_VERSION');
  const t=plan.nativeTerms;
  if (!Array.isArray(t.submissionIds) || t.submissionIds.length!==4 || t.submissionIds.some((x,i)=>x!==i)) throw Error('UNSUPPORTED_RECEIPT_CONFIG');
  return {version:3,token:t.token,sponsor:t.sponsor,verifier:t.issuer,amount:t.amount,requiredReceipts:4,start:t.start,due:t.due,claimUntil:t.claimUntil};
}
export function createRuntime(ethers) {
  const abi=ethers.AbiCoder.defaultAbiCoder();
  const hashConfig=c=>ethers.keccak256(abi.encode(
    ['bytes32','uint32','address','address','address','uint256','uint32','uint64','uint64','uint64'],
    [ethers.id(CONFIG_TYPE),c.version,c.token,c.sponsor,c.verifier,c.amount,c.requiredReceipts,c.start,c.due,c.claimUntil]
  ));
  const runtimeConfigHash=plan=>hashConfig(runtimeConfig(plan));
  const acceptanceValue=plan=>({termsHash:plan.termsHash,runtimeConfigHash:runtimeConfigHash(plan),learner:plan.nativeTerms.recipient,acceptedAt:plan.nativeTerms.enrolledAt});
  return {hashConfig,runtimeConfigHash,acceptanceValue};
}
