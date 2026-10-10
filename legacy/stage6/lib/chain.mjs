import { Contract, getAddress, keccak256 } from 'ethers';
import { AMOUNT, canonical, need, validateAcceptance, validateEvidence, validateTrust } from './evidence.mjs';

export const vaultAbi=[
  'function token() view returns(address)','function sponsor() view returns(address)','function verifier() view returns(address)','function termsHash() view returns(bytes32)',
  'function start() view returns(uint256)','function due() view returns(uint256)','function claimUntil() view returns(uint256)','function amount() view returns(uint256)',
  'function totalReserved() view returns(uint256)','function enrolled(address) view returns(bool)','function settled(address) view returns(bool)',
  'function acceptedAt(address) view returns(uint64)','function consentDigest(address) view returns(bytes32)',
  'function enroll(address learner,uint64 time,bytes consent)','function claim(address learner,(bytes32 termsHash,address learner,uint32 session,uint64 completedAt)[] receipts,bytes[] signatures)',
  'function reclaimExpired(address learner)','event Paid(address indexed learner,address indexed submitter,uint256 amount)'
];
export const tokenAbi=['function balanceOf(address) view returns(uint256)','event Transfer(address indexed from,address indexed to,uint256 value)'];
export async function chainTime(provider){return Number((await provider.send('eth_getBlockByNumber',['latest',false])).timestamp);}
export function deploymentIdentity(trusted){return canonical({chainId:trusted.domain.chainId,genesisHash:trusted.deployment.genesisHash,blockNumber:trusted.deployment.blockNumber,blockHash:trusted.deployment.blockHash,vaultCodeHash:trusted.deployment.vaultCodeHash,tokenCodeHash:trusted.deployment.tokenCodeHash,token:trusted.terms.token,vault:trusted.domain.verifyingContract,sponsor:trusted.terms.sponsor,verifier:trusted.terms.issuer,termsHash:trusted.termsHash,start:trusted.terms.start,due:trusted.terms.due,claimUntil:trusted.terms.claimUntil,amount:trusted.terms.amount});}
export async function verifyDeployment(provider,trusted){
  validateTrust(trusted);
  const chainId=Number(await provider.send('eth_chainId',[])); need(chainId===trusted.domain.chainId,'CHAIN_MISMATCH');
  const genesis=await provider.send('eth_getBlockByNumber',['0x0',false]);
  const block=await provider.send('eth_getBlockByNumber',['0x'+trusted.deployment.blockNumber.toString(16),false]);
  need(genesis?.hash===trusted.deployment.genesisHash&&block?.hash===trusted.deployment.blockHash,'DEPLOYMENT_MISMATCH');
  const vaultCode=await provider.send('eth_getCode',[trusted.domain.verifyingContract,'latest']);
  const tokenCode=await provider.send('eth_getCode',[trusted.terms.token,'latest']);
  need(vaultCode!=='0x'&&keccak256(vaultCode)===trusted.deployment.vaultCodeHash,'VAULT_CODE_MISMATCH');
  need(tokenCode!=='0x'&&keccak256(tokenCode)===trusted.deployment.tokenCodeHash,'TOKEN_CODE_MISMATCH');
  const vault=new Contract(trusted.domain.verifyingContract,vaultAbi,provider);
  for(const [method,expected] of Object.entries({token:trusted.terms.token,sponsor:trusted.terms.sponsor,verifier:trusted.terms.issuer})) need(getAddress(await vault[method]())===getAddress(expected),'CONTRACT_CONFIG_MISMATCH');
  need(await vault.termsHash()===trusted.termsHash,'CONTRACT_CONFIG_MISMATCH');
  for(const key of ['start','due','claimUntil','amount']) need(await vault[key]()===BigInt(trusted.terms[key]),'CONTRACT_CONFIG_MISMATCH');
  return {vault,token:new Contract(trusted.terms.token,tokenAbi,provider),identity:deploymentIdentity(trusted),chainId};
}
export async function enrollFunded(provider,trusted,sponsor,acceptance,recipient){
  const digest=validateAcceptance(acceptance,trusted,recipient,await chainTime(provider),{registration:true});
  const {vault,token}=await verifyDeployment(provider,trusted); need(getAddress(await sponsor.getAddress())===getAddress(trusted.terms.sponsor),'SPONSOR');
  const before=await token.balanceOf(vault.target),receipt=await (await vault.connect(sponsor).enroll(recipient,acceptance.acceptedAt,acceptance.signature)).wait();
  need(receipt.status===1&&await vault.enrolled(recipient),'ENROLLMENT_NOT_CONFIRMED'); need(await vault.consentDigest(recipient)===digest,'CONSENT_NOT_RECORDED');
  const after=await token.balanceOf(vault.target); need(after===before+AMOUNT&&after>=await vault.totalReserved(),'RESERVE_NOT_CONFIRMED');
  return {transactionHash:receipt.hash,consentDigest:digest,depositUnits:AMOUNT.toString()};
}
export async function inspectEnrollment(provider,trusted,recipient){
  const {vault}=await verifyDeployment(provider,trusted);
  return {enrolled:await vault.enrolled(recipient),settled:await vault.settled(recipient),acceptedAt:Number(await vault.acceptedAt(recipient)),consentDigest:await vault.consentDigest(recipient)};
}
export async function inspectClaim(provider,trusted,packet,recipient){
  const result=validateEvidence(packet,trusted,recipient,await chainTime(provider)),{vault,token}=await verifyDeployment(provider,trusted);
  need(await vault.enrolled(recipient)&&!await vault.settled(recipient),'NOT_CLAIMABLE');
  need(await vault.consentDigest(recipient)===result.consentDigest&&await vault.acceptedAt(recipient)===BigInt(packet.acceptance.acceptedAt),'CONSENT_NOT_RECORDED');
  const reserve=await vault.totalReserved(),balance=await token.balanceOf(vault.target); need(reserve>=AMOUNT&&balance>=reserve,'RESERVE_NOT_CONFIRMED');
  return {...result,vault,token,reserveUnits:reserve.toString(),balanceUnits:balance.toString()};
}
export function claimArguments(packet){return [packet.recipient,packet.submissions.map(s=>s.receipt),packet.submissions.map(s=>s.signature)];}
export async function verifyPaidReceipt(provider,trusted,packet,submitter,receipt){
  need(receipt&&receipt.status===1,'TRANSACTION_REVERTED');
  const {vault,token}=await verifyDeployment(provider,trusted),recipient=getAddress(packet.recipient);
  need(getAddress(receipt.to)===getAddress(vault.target),'WRONG_TRANSACTION_TARGET');
  const paid=receipt.logs.filter(l=>getAddress(l.address)===getAddress(vault.target)).map(l=>{try{return vault.interface.parseLog(l)}catch{return null}}).find(l=>l?.name==='Paid');
  need(paid&&getAddress(paid.args.learner)===recipient&&getAddress(paid.args.submitter)===getAddress(submitter)&&paid.args.amount===AMOUNT,'PAYMENT_EVENT');
  const transfer=receipt.logs.filter(l=>getAddress(l.address)===getAddress(token.target)).map(l=>{try{return token.interface.parseLog(l)}catch{return null}}).find(l=>l?.name==='Transfer'&&getAddress(l.args.from)===getAddress(vault.target)&&getAddress(l.args.to)===recipient&&l.args.value===AMOUNT);
  need(transfer,'PAYMENT_TRANSFER_EVENT'); need(await vault.settled(recipient),'PAYMENT_NOT_SETTLED');
  const balance=await token.balanceOf(recipient,{blockTag:receipt.blockNumber}); need(balance>=AMOUNT,'PAYMENT_BALANCE');
  return {transactionHash:receipt.hash,blockNumber:receipt.blockNumber,recipient,submitter:getAddress(submitter),paidUnits:AMOUNT.toString(),afterUnits:balance.toString()};
}
export async function claimRefund(provider,trusted,submitter,packet,recipient=packet.recipient){
  const {vault}=await inspectClaim(provider,trusted,packet,recipient),who=await submitter.getAddress();
  const transaction=await vault.connect(submitter).claim(...claimArguments(packet)),receipt=await transaction.wait();
  return verifyPaidReceipt(provider,trusted,packet,who,receipt);
}
