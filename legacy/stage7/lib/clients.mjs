import * as E from 'ethers';
import { performance } from 'node:perf_hooks';
import { createClaimCore } from '../../stage6/shared/claim-core.mjs';
import { readEvidence } from '../../stage6/lib/files.mjs';
import { sha } from './process.mjs';
export const core=createClaimCore(E);
export async function centralClaim(url,packet){
  const start=performance.now(),inputEvidenceSha256=sha(JSON.stringify(packet));
  try{
    const res=await fetch(url+'/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(packet),signal:AbortSignal.timeout(5000)});
    const v=await res.json();if(!res.ok)throw Object.assign(new Error(),{code:v.code});
    const state=await(await fetch(url+'/status?recipient='+packet.recipient,{signal:AbortSignal.timeout(5000)})).json();
    if(state.paidUnits!=='50000000'||!state.settled||state.reserveUnits!=='0')throw Object.assign(new Error(),{code:'PAYMENT_NOT_CONFIRMED'});
    return {success:true,code:null,inputEvidenceSha256,elapsedMs:performance.now()-start,acceptedToConfirmedMs:v.acceptedToConfirmedMs,paidUnits:state.paidUnits,receiptId:v.receiptId};
  }catch(e){return {success:false,code:e.code||'EXECUTOR_UNREACHABLE',inputEvidenceSha256,elapsedMs:performance.now()-start,acceptedToConfirmedMs:null};}
}
export async function onchainClaim(provider,manifest,packet,signer,{rawRace=false}={}){
  const start=performance.now(),inputEvidenceSha256=sha(JSON.stringify(packet));let sentAt=null,hash=null;
  try{
    const checked=await core.inspectClaim(provider,manifest,packet);
    if(!rawRace)await core.estimateCost(checked.vault,signer,packet,await signer.getAddress());
    const tx=await checked.vault.connect(signer).claim(...core.args(packet),...(rawRace?[{gasLimit:400000}]:[]));
    hash=tx.hash;sentAt=performance.now();const receipt=await tx.wait();
    const paid=await core.verifyPaidReceipt(provider,manifest,packet,await signer.getAddress(),receipt);
    return {success:true,code:null,inputEvidenceSha256,elapsedMs:performance.now()-start,acceptedToConfirmedMs:performance.now()-sentAt,...paid,gasUsed:receipt.gasUsed.toString()};
  }catch(e){return {success:false,code:e.code||'RPC_UNREACHABLE',inputEvidenceSha256,elapsedMs:performance.now()-start,acceptedToConfirmedMs:sentAt?performance.now()-sentAt:null,transactionHash:hash,gasUsed:e.receipt?.gasUsed?.toString()??null};}
}
export function localProvider(url){const req=new E.FetchRequest(url);req.timeout=2500;const p=new E.JsonRpcProvider(req,31337,{staticNetwork:true,cacheTimeout:-1});p.pollingInterval=20;return p;}
