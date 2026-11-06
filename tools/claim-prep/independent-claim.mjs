// Independent claim of an ACCEPTED right on an owned local TEST chain.
//
// Uses only chain RPC + public vault/token addresses. It does not open the
// CLEAR store, API, session, signing service or bridge, so it can run while
// the CLEAR web/API process is stopped. It never prints or writes a key.
//
// Library: independentClaim({provider, vaultAbi, vaultAddress, tokenAddress, applicationId, caller, duplicateTransaction})
// CLI (main integrator only, against an owned e5 environment that is RUNNING):
//   ./tools/node tools/claim-prep/independent-claim.mjs \
//     --checkout <repo that owns private/hackathon-e5> --environment e5-<uuid> \
//     --application 0x<chainApplicationId> [--duplicate-transaction]
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {Contract,Interface,JsonRpcProvider,Wallet,keccak256} from 'ethers';

export const CLAIM_PREP_VERSION='clear-claim-prep-independent-claim.1';
const AMOUNT=100000000n;
const STATE={NONE:0n,QUEUED:1n,RESERVED:2n,REVIEW:3n,TERMINATED:4n,ACCEPTED:5n,SETTLED:6n};
const TOKEN_ABI=['function balanceOf(address) view returns (uint256)','event Transfer(address indexed from,address indexed to,uint256 value)'];
const ensure=(ok,code)=>{if(!ok)throw Error(code);};
const b32=v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v)&&v!=='0x'+'00'.repeat(32);
const lower=a=>a.toLowerCase();
const accountingOf=async vault=>{const x=await vault.accounting();return Object.fromEntries(['B','R','O','A','U','S','surplus'].map(k=>[k,x[k].toString()]));};
const reason=error=>{
 const text=[error?.reason,error?.shortMessage,error?.info?.error?.message,error?.error?.message,error?.message].filter(Boolean).join(' ');
 const m=/(ACCEPTED_RIGHT_REQUIRED|STORED_RIGHT|REENTRANCY|ACCOUNTING|TOKEN_TRANSFER|EXACT_TRANSFER)/.exec(text);return m?m[1]:'REVERTED_UNKNOWN_REASON';
};

async function snapshot({vault,token,applicationId,recipient}){
 const [application,right,accounting,recipientAtoms,vaultAtoms]=await Promise.all([
  vault.application(applicationId),vault.acceptedRight(applicationId),accountingOf(vault),
  token.balanceOf(recipient),token.balanceOf(vault.target)]);
 return {state:application.state,version:application.version,settledAt:right.settledAt,accounting,recipientAtoms,vaultAtoms};
}

/** Claim once from an arbitrary caller and verify the fixed-recipient transfer and duplicate rejection. */
export async function independentClaim({provider,vaultAbi,vaultAddress,tokenAddress,applicationId,caller,duplicateTransaction=false}){
 ensure(b32(applicationId),'CLAIM_PREP_APPLICATION_ID');
 const callerAddress=lower(await caller.getAddress());
 const vault=new Contract(vaultAddress,vaultAbi,caller),token=new Contract(tokenAddress,TOKEN_ABI,provider);
 const claimInputs=new Interface(vaultAbi).getFunction('claim').inputs.map(i=>i.type);
 ensure(claimInputs.length===1&&claimInputs[0]==='bytes32','CLAIM_PREP_ABI_RECIPIENT_PARAMETER');
 // 1. Read the stored right. The recipient comes from chain state, never from the caller.
 const app=await vault.application(applicationId),right=await vault.acceptedRight(applicationId);
 ensure(app.state===STATE.ACCEPTED,'CLAIM_PREP_NOT_ACCEPTED');
 const recipient=lower(right.recipient);
 ensure(recipient===lower(app.recipient)&&lower(right.token)===lower(tokenAddress)&&right.amountAtoms===AMOUNT&&right.allocationId===app.allocationId&&b32(right.allocationId),'CLAIM_PREP_STORED_RIGHT');
 const before=await snapshot({vault,token,applicationId,recipient});
 // 2. Preflight as eth_call from the same caller, then one real transaction.
 await vault.claim.staticCall(applicationId);
 const sent=await vault.claim(applicationId),receipt=await sent.wait();
 ensure(receipt&&receipt.status===1,'CLAIM_PREP_CLAIM_NOT_INCLUDED');
 ensure(lower(receipt.from)===callerAddress&&lower(receipt.to)===lower(vaultAddress),'CLAIM_PREP_RECEIPT_TARGET');
 const after=await snapshot({vault,token,applicationId,recipient});
 // 3. Exact effects: recipient +100 TEST, vault -100 TEST, B/R/O -100 TEST, surplus unchanged.
 const tokenIface=new Interface(TOKEN_ABI),transfers=receipt.logs.filter(l=>lower(l.address)===lower(tokenAddress)).map(l=>tokenIface.parseLog(l)).filter(Boolean);
 ensure(transfers.length===1&&lower(transfers[0].args.from)===lower(vaultAddress)&&lower(transfers[0].args.to)===recipient&&transfers[0].args.value===AMOUNT,'CLAIM_PREP_TRANSFER_LOG');
 const settledLogs=receipt.logs.filter(l=>lower(l.address)===lower(vaultAddress)).map(l=>{try{return vault.interface.parseLog(l);}catch{return null;}}).filter(l=>l?.name==='RightSettled');
 ensure(settledLogs.length===1&&settledLogs[0].args.applicationId===applicationId&&lower(settledLogs[0].args.recipient)===recipient&&settledLogs[0].args.amountAtoms===AMOUNT,'CLAIM_PREP_SETTLED_EVENT');
 ensure(after.state===STATE.SETTLED&&after.settledAt>0n,'CLAIM_PREP_STATE');
 ensure(after.recipientAtoms-before.recipientAtoms===AMOUNT&&before.vaultAtoms-after.vaultAtoms===AMOUNT,'CLAIM_PREP_BALANCE');
 for(const k of ['B','R','O'])ensure(BigInt(before.accounting[k])-BigInt(after.accounting[k])===AMOUNT,'CLAIM_PREP_ACCOUNTING_'+k);
 ensure(before.accounting.surplus===after.accounting.surplus,'CLAIM_PREP_SURPLUS_CHANGED');
 // 4. Duplicate: eth_call must revert; optionally one real transaction that must fail without moving TEST.
 let duplicateStatic=null;try{await vault.claim.staticCall(applicationId);}catch(error){duplicateStatic=reason(error);}
 ensure(duplicateStatic==='ACCEPTED_RIGHT_REQUIRED','CLAIM_PREP_DUPLICATE_STATIC_ACCEPTED');
 let duplicateTx=null;
 if(duplicateTransaction){
  // Explicit gas skips estimateGas so the node includes the failing transaction.
  const tx=await vault.claim(applicationId,{gasLimit:300000n});let r;
  try{r=await tx.wait();}catch(error){r=error?.receipt??await provider.getTransactionReceipt(tx.hash);}
  ensure(r&&r.status===0,'CLAIM_PREP_DUPLICATE_TX_NOT_REVERTED');
  const again=await snapshot({vault,token,applicationId,recipient});
  ensure(again.recipientAtoms===after.recipientAtoms&&again.vaultAtoms===after.vaultAtoms&&again.state===STATE.SETTLED&&JSON.stringify(again.accounting)===JSON.stringify(after.accounting),'CLAIM_PREP_DUPLICATE_MOVED_FUNDS');
  duplicateTx={txHash:r.hash,blockNumber:r.blockNumber,status:r.status,testBalanceUnchanged:true};
 }
 const s=x=>({state:x.state.toString(),accounting:x.accounting,recipientAtoms:x.recipientAtoms.toString(),vaultAtoms:x.vaultAtoms.toString()});
 return Object.freeze({version:CLAIM_PREP_VERSION,evidenceKind:'REAL_TRANSACTION_LOCAL_TEST_CHAIN',applicationId,vaultAddress:lower(vaultAddress),tokenAddress:lower(tokenAddress),
  caller:callerAddress,callerIsRecipient:callerAddress===recipient,recipient,amountAtoms:AMOUNT.toString(),
  claim:{txHash:receipt.hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,status:receipt.status},
  before:s(before),after:s(after),duplicate:{staticCall:'REJECTED:'+duplicateStatic,transaction:duplicateTx},production:false});
}

const test=v=>(Number(BigInt(v)/10000n)/100).toLocaleString('ko-KR')+' TEST';
const short=v=>v.slice(0,6)+'…'+v.slice(-4);
/** Human summary for a demo terminal. Same facts as the JSON report, nothing secret. */
export function summaryKo(r){
 return ['[독립 청구 · CLEAR 서버 없이 체인 RPC만 사용]',
  '청구한 주소: '+short(r.caller)+' (역할 없음, 수령인과 '+(r.callerIsRecipient?'같음':'다름')+')',
  '받는 학생 지갑: '+short(r.recipient)+' (ACCEPT 때 체인에 저장된 주소)',
  '지급 거래: '+r.claim.txHash+' (블록 '+r.claim.blockNumber+', 성공)',
  '학생 잔액: '+test(r.before.recipientAtoms)+' → '+test(r.after.recipientAtoms),
  '금고 잔액: '+test(r.before.vaultAtoms)+' → '+test(r.after.vaultAtoms),
  '권리 상태: '+(r.before.state==='5'?'수락됨(청구 대기)':r.before.state)+' → '+(r.after.state==='6'?'지급 완료':r.after.state),
  '중복 청구: '+(r.duplicate.staticCall.startsWith('REJECTED')?'거부됨':'확인 필요')+(r.duplicate.transaction?' · 실제 중복 거래도 실패, 잔액 변화 없음':'')].join('\n');
}

function args(argv){
 const out={duplicateTransaction:false};
 for(let i=0;i<argv.length;i++){const k=argv[i];
  if(k==='--duplicate-transaction')out.duplicateTransaction=true;
  else if(k==='--summary-ko')out.summaryKo=true;
  else if(['--checkout','--environment','--application'].includes(k)&&argv[i+1])out[k.slice(2)]=argv[++i];
  else throw Error('CLAIM_PREP_USAGE');}
 ensure(out.environment&&/^e5-[0-9a-f-]{36}$/.test(out.environment)&&b32(out.application??''),'CLAIM_PREP_USAGE');return out;
}
async function main(){
 const a=args(process.argv.slice(2)),checkout=resolve(a.checkout??new URL('../..',import.meta.url).pathname);
 // Use the owning checkout's environment module: its ENV_ROOT, owner labels and key pins.
 const env=await import(pathToFileURL(join(checkout,'src/hackathon-test-vault/e5/environment.mjs')).href);
 const {buildExecutionV2}=await import(pathToFileURL(join(checkout,'tests/hackathon-test-vault/execution-v2-build.mjs')).href);
 const m=env.loadRuntime(a.environment);ensure(m.version==='clear-e5-test-runtime.2'&&m.production===false,'CLAIM_PREP_RUNTIME');
 ensure(env.environmentStatus(a.environment).running===true,'CLAIM_PREP_CHAIN_NOT_RUNNING');
 const provider=new JsonRpcProvider(m.endpoint,undefined,{cacheTimeout:-1,batchMaxCount:1});provider.pollingInterval=100;
 try{
  ensure((await provider.getNetwork()).chainId.toString()===m.chainId,'CLAIM_PREP_CHAIN_ID');
  ensure(keccak256(await provider.getCode(m.vaultAddress))===m.vaultCodeHash&&keccak256(await provider.getCode(m.tokenAddress))===m.tokenCodeHash,'CLAIM_PREP_CODE_PIN');
  // No-role key created by the environment; the vault never checks msg.sender in claim().
  const caller=new Wallet(env.ownedTestWallet(a.environment,'anycaller').privateKey,provider);
  const report=await independentClaim({provider,vaultAbi:buildExecutionV2().contract.abi,vaultAddress:m.vaultAddress,tokenAddress:m.tokenAddress,applicationId:a.application,caller,duplicateTransaction:a.duplicateTransaction});
  process.stdout.write(a.summaryKo?summaryKo(report)+'\n':JSON.stringify({...report,environmentId:a.environment,callerRole:'anycaller'},null,1)+'\n');
 }finally{provider.destroy();}
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)main().catch(error=>{process.stderr.write((/^(CLAIM_PREP|E5)_[A-Z0-9_]+$/.test(error.message)?error.message:'CLAIM_PREP_FAILED')+'\n');process.exitCode=1;});
