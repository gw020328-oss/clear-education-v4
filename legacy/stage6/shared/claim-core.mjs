import { AMOUNT, createValidation } from './validation.mjs';

export const vaultAbi=[
  'function token() view returns(address)','function sponsor() view returns(address)','function verifier() view returns(address)','function termsHash() view returns(bytes32)',
  'function start() view returns(uint256)','function due() view returns(uint256)','function claimUntil() view returns(uint256)','function amount() view returns(uint256)',
  'function totalReserved() view returns(uint256)','function enrolled(address) view returns(bool)','function settled(address) view returns(bool)',
  'function acceptedAt(address) view returns(uint64)','function consentDigest(address) view returns(bytes32)',
  'function claim(address learner,(bytes32 termsHash,address learner,uint32 session,uint64 completedAt)[] receipts,bytes[] signatures)',
  'event Paid(address indexed learner,address indexed submitter,uint256 amount)'
];
export const tokenAbi=['function balanceOf(address) view returns(uint256)','event Transfer(address indexed from,address indexed to,uint256 value)'];

export function createClaimCore(E){
  const V=createValidation(E);
  const identity=trusted=>V.canonical({chainId:trusted.domain.chainId,genesisHash:trusted.deployment.genesisHash,blockNumber:trusted.deployment.blockNumber,blockHash:trusted.deployment.blockHash,vaultCodeHash:trusted.deployment.vaultCodeHash,tokenCodeHash:trusted.deployment.tokenCodeHash,token:trusted.terms.token,vault:trusted.domain.verifyingContract,sponsor:trusted.terms.sponsor,verifier:trusted.terms.issuer,termsHash:trusted.termsHash,start:trusted.terms.start,due:trusted.terms.due,claimUntil:trusted.terms.claimUntil,amount:trusted.terms.amount});
  async function chainTime(provider){return Number((await provider.send('eth_getBlockByNumber',['latest',false])).timestamp);}
  async function verifyDeployment(provider,trusted){
    V.validateTrust(trusted);const chainId=Number(await provider.send('eth_chainId',[]));V.need(chainId===trusted.domain.chainId,'CHAIN_MISMATCH');
    const genesis=await provider.send('eth_getBlockByNumber',['0x0',false]),block=await provider.send('eth_getBlockByNumber',['0x'+trusted.deployment.blockNumber.toString(16),false]);
    V.need(genesis?.hash===trusted.deployment.genesisHash&&block?.hash===trusted.deployment.blockHash,'DEPLOYMENT_MISMATCH');
    const vaultCode=await provider.send('eth_getCode',[trusted.domain.verifyingContract,'latest']),tokenCode=await provider.send('eth_getCode',[trusted.terms.token,'latest']);
    V.need(vaultCode!=='0x'&&E.keccak256(vaultCode)===trusted.deployment.vaultCodeHash,'VAULT_CODE_MISMATCH');V.need(tokenCode!=='0x'&&E.keccak256(tokenCode)===trusted.deployment.tokenCodeHash,'TOKEN_CODE_MISMATCH');
    const vault=new E.Contract(trusted.domain.verifyingContract,vaultAbi,provider);
    for(const [method,expected] of Object.entries({token:trusted.terms.token,sponsor:trusted.terms.sponsor,verifier:trusted.terms.issuer}))V.need(E.getAddress(await vault[method]())===E.getAddress(expected),'CONTRACT_CONFIG_MISMATCH');
    V.need(await vault.termsHash()===trusted.termsHash,'CONTRACT_CONFIG_MISMATCH');for(const k of ['start','due','claimUntil','amount'])V.need(await vault[k]()===BigInt(trusted.terms[k]),'CONTRACT_CONFIG_MISMATCH');
    return {vault,token:new E.Contract(trusted.terms.token,tokenAbi,provider),identity:identity(trusted),chainId};
  }
  async function inspectClaim(provider,trusted,packet){
    const checked=V.validateEvidence(packet,trusted,packet.recipient,await chainTime(provider)),{vault,token,...deployment}=await verifyDeployment(provider,trusted);
    V.need(await vault.enrolled(checked.recipient)&&!await vault.settled(checked.recipient),'NOT_CLAIMABLE');V.need(await vault.consentDigest(checked.recipient)===checked.consentDigest&&await vault.acceptedAt(checked.recipient)===BigInt(packet.acceptance.acceptedAt),'CONSENT_NOT_RECORDED');
    const reserve=await vault.totalReserved(),balance=await token.balanceOf(vault.target);V.need(reserve>=AMOUNT&&balance>=reserve,'RESERVE_NOT_CONFIRMED');return {...checked,vault,token,reserve,balance,...deployment};
  }
  const args=packet=>[packet.recipient,packet.submissions.map(v=>v.receipt),packet.submissions.map(v=>v.signature)];
  async function estimateCost(vault,signer,packet,address){
    const connected=vault.connect(signer),gas=await connected.claim.estimateGas(...args(packet)),fees=await signer.provider.getFeeData(),price=fees.maxFeePerGas??fees.gasPrice;V.need(price!==null,'GAS_PRICE_UNAVAILABLE');
    const cost=gas*price,balance=await signer.provider.getBalance(address);V.need(balance>=cost,'INSUFFICIENT_GAS');return {gas,price,cost,balance};
  }
  async function verifyPaidReceipt(provider,trusted,packet,sender,receipt){
    V.need(receipt&&receipt.status===1,'TRANSACTION_REVERTED');const {vault,token}=await verifyDeployment(provider,trusted),recipient=E.getAddress(packet.recipient);V.need(receipt.to&&E.getAddress(receipt.to)===E.getAddress(vault.target),'WRONG_TRANSACTION_TARGET');
    const paid=receipt.logs.filter(l=>E.getAddress(l.address)===E.getAddress(vault.target)).map(l=>{try{return vault.interface.parseLog(l)}catch{return null}}).find(l=>l?.name==='Paid');V.need(paid&&E.getAddress(paid.args.learner)===recipient&&E.getAddress(paid.args.submitter)===E.getAddress(sender)&&paid.args.amount===AMOUNT,'PAYMENT_EVENT');
    const transfer=receipt.logs.filter(l=>E.getAddress(l.address)===E.getAddress(token.target)).map(l=>{try{return token.interface.parseLog(l)}catch{return null}}).find(l=>l?.name==='Transfer'&&E.getAddress(l.args.from)===E.getAddress(vault.target)&&E.getAddress(l.args.to)===recipient&&l.args.value===AMOUNT);V.need(transfer,'PAYMENT_TRANSFER_EVENT');V.need(await vault.settled(recipient),'PAYMENT_NOT_SETTLED');
    const balance=await token.balanceOf(recipient,{blockTag:receipt.blockNumber});V.need(balance>=AMOUNT,'PAYMENT_BALANCE');return {transactionHash:receipt.hash,blockNumber:receipt.blockNumber,recipient,submitter:E.getAddress(sender),paidUnits:AMOUNT.toString(),afterUnits:balance.toString()};
  }
  return {...V,identity,chainTime,verifyDeployment,inspectClaim,args,estimateCost,verifyPaidReceipt};
}
