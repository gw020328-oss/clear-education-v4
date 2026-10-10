import {Contract,ContractFactory,TypedDataEncoder,getAddress,getCreateAddress,keccak256} from 'ethers';
import {compile as contracts} from '../../stage6/lib/local.mjs';
import {acceptanceTypes,receiptTypes,SAFE_TOKEN_CODE_HASH} from '../../stage6/lib/evidence.mjs';
import {verifyTypedData} from 'ethers';
import {canonical,need,signature} from './core.mjs';

const domain=p=>({name:'RefundRights',version:'2',chainId:p.nativeTerms.chainId,verifyingContract:p.nativeTerms.vaultAddress});
async function now(provider){return Number((await provider.send('eth_getBlockByNumber',['latest',false])).timestamp);}
export async function deployBound(compiler,bundle,provider,sponsor){
 const plan=compiler(bundle,await now(provider)),t=plan.nativeTerms;
 need(Number(await provider.send('eth_chainId',[]))===t.chainId,'CHAIN_BINDING');
 need((await sponsor.getAddress()).toLowerCase()===t.sponsor,'SPONSOR_BINDING');
 const nonce=Number(await provider.send('eth_getTransactionCount',[t.sponsor,'pending']));
 need(getCreateAddress({from:t.sponsor,nonce}).toLowerCase()===t.vaultAddress,'DEPLOYMENT_ADDRESS');
 need(keccak256(await provider.getCode(t.token))===SAFE_TOKEN_CODE_HASH,'TOKEN_CODE');
 const c=contracts().RefundVault;
 const vault=await new ContractFactory(c.abi,c.evm.bytecode.object,sponsor).deploy(t.token,t.issuer,plan.termsHash,t.start,t.due,t.claimUntil);
 const receipt=await vault.deploymentTransaction().wait();
 need(vault.target.toLowerCase()===t.vaultAddress&&await vault.termsHash()===plan.termsHash,'DEPLOYMENT_BINDING');
 return {plan,vault,anchor:{genesisHash:(await provider.send('eth_getBlockByNumber',['0x0',false])).hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,vaultCodeHash:keccak256(await provider.getCode(vault.target)),transactionHash:receipt.hash}};
}
// Anchor must be retained from this trusted deployment operation, never read from an AI packet.
export async function inspectBound(compiler,bundle,provider,anchor){
 const plan=compiler(bundle,await now(provider)),t=plan.nativeTerms;
 need(Number(await provider.send('eth_chainId',[]))===t.chainId,'CHAIN_BINDING');
 const genesis=await provider.send('eth_getBlockByNumber',['0x0',false]),block=await provider.send('eth_getBlockByNumber',['0x'+anchor.blockNumber.toString(16),false]);
 need(genesis.hash===anchor.genesisHash&&block?.hash===anchor.blockHash,'CHAIN_IDENTITY');
 need(keccak256(await provider.getCode(t.token))===SAFE_TOKEN_CODE_HASH,'TOKEN_CODE');
 need(keccak256(await provider.getCode(t.vaultAddress))===anchor.vaultCodeHash,'VAULT_CODE');
 const vault=new Contract(t.vaultAddress,contracts().RefundVault.abi,provider),token=new Contract(t.token,contracts().TestToken.abi,provider);
 for(const [k,v]of Object.entries({token:t.token,sponsor:t.sponsor,verifier:t.issuer}))need((await vault[k]()).toLowerCase()===v,'VAULT_CONFIG');
 need(await vault.termsHash()===plan.termsHash,'VAULT_TERMS_HASH');
 for(const k of ['start','due','claimUntil','amount'])need(await vault[k]()===BigInt(t[k]),'VAULT_CONFIG');
 return {plan,vault,token};
}
export async function enrollBound(compiler,bundle,provider,anchor,sponsor,participant){
 const {plan,vault,token}=await inspectBound(compiler,bundle,provider,anchor),t=plan.nativeTerms;
 need((await participant.getAddress()).toLowerCase()===t.recipient,'RECIPIENT');
 const acceptance={termsHash:plan.termsHash,learner:t.recipient,acceptedAt:t.enrolledAt},sig=await participant.signTypedData(domain(plan),acceptanceTypes,acceptance);
 const before=await token.balanceOf(t.vaultAddress);
 await (await token.connect(sponsor).approve(t.vaultAddress,BigInt(t.amount))).wait();
 const receipt=await (await vault.connect(sponsor).enroll(t.recipient,t.enrolledAt,sig)).wait();
 need(receipt.status===1&&await vault.enrolled(t.recipient)&&await token.balanceOf(t.vaultAddress)===before+BigInt(t.amount),'ENROLLMENT');
 return {...acceptance,signature:sig};
}
export async function makeReceipts(plan,issuer,completedAt){
 return Promise.all([0,1,2,3].map(async session=>{const receipt={termsHash:plan.termsHash,learner:plan.nativeTerms.recipient,session,completedAt};return {receipt,signature:await issuer.signTypedData(domain(plan),receiptTypes,receipt)};}));
}
export async function claimBound(compiler,bundle,provider,anchor,submitter,acceptance,receipts){
 const {plan,vault,token}=await inspectBound(compiler,bundle,provider,anchor),t=plan.nativeTerms,time=await now(provider);
 need(Array.isArray(receipts)&&receipts.length===4,'COUNT');
 signature(acceptance.signature);const av={termsHash:acceptance.termsHash,learner:acceptance.learner,acceptedAt:acceptance.acceptedAt};
 need(canonical(av)===canonical({termsHash:plan.termsHash,learner:t.recipient,acceptedAt:t.enrolledAt}),'ACCEPTANCE');
 need(verifyTypedData(domain(plan),acceptanceTypes,av,acceptance.signature).toLowerCase()===t.recipient,'CONSENT');
 need(await vault.consentDigest(t.recipient)===TypedDataEncoder.hash(domain(plan),acceptanceTypes,av),'CONSENT_DIGEST');
 need(await vault.enrolled(t.recipient)&&!await vault.settled(t.recipient),'NOT_CLAIMABLE');
 const reserved=await vault.totalReserved();need(reserved>=BigInt(t.amount)&&await token.balanceOf(t.vaultAddress)>=reserved,'UNDERFUNDED');
 const seen=new Set();for(const item of receipts){
  const r=item.receipt;signature(item.signature);
  need(r.termsHash===plan.termsHash&&r.learner===t.recipient&&Number.isInteger(r.session)&&r.session>=0&&r.session<4&&!seen.has(r.session),'RECEIPT_SCOPE');seen.add(r.session);
  need(Number.isSafeInteger(r.completedAt)&&r.completedAt>=t.start&&r.completedAt<=t.due&&r.completedAt<=time,'RECEIPT_TIME');
  need(verifyTypedData(domain(plan),receiptTypes,r,item.signature).toLowerCase()===t.issuer,'ISSUER');
 }
 const transaction=await vault.connect(submitter).claim(t.recipient,receipts.map(x=>x.receipt),receipts.map(x=>x.signature)),receipt=await transaction.wait();
 need(receipt.status===1,'REVERT');const paid=receipt.logs.filter(l=>getAddress(l.address)===getAddress(vault.target)).map(l=>{try{return vault.interface.parseLog(l)}catch{return null}}).find(l=>l?.name==='Paid');
 const transfer=receipt.logs.filter(l=>getAddress(l.address)===getAddress(token.target)).map(l=>{try{return token.interface.parseLog(l)}catch{return null}}).find(l=>l?.name==='Transfer'&&l.args.from.toLowerCase()===t.vaultAddress&&l.args.to.toLowerCase()===t.recipient&&l.args.value===BigInt(t.amount));
 need(paid?.args.learner.toLowerCase()===t.recipient&&paid.args.submitter.toLowerCase()===(await submitter.getAddress()).toLowerCase()&&paid.args.amount===BigInt(t.amount)&&transfer&&await vault.settled(t.recipient)&&await token.balanceOf(t.recipient,{blockTag:receipt.blockNumber})>=BigInt(t.amount),'PAYMENT_NOT_VERIFIED');
 return {transactionHash:receipt.hash,blockNumber:receipt.blockNumber,recipient:t.recipient,paidUnits:t.amount,termsHash:plan.termsHash,status:'PAID_LOCAL_TEST_ONLY'};
}
