import {requireRule as check} from '../policy/values.mjs';
// Owner-only single intent. The caller retains its runtime lease and decides
// when to run it; HTTP receipt alone never invokes a signer or asserts inclusion.
export async function executeReviewChainChange({store,bridge,serviceContext,runtimeHandle,context,applicationId,kind,operationId,key,waitReceipt}){
 const plan=await store.execution.planCorrection(context,applicationId,{kind,operationId});
 const intentId=store.execution.enqueue(context,applicationId,plan.body,key).receipt.intentId;
 const handle=store.execution.acquire(serviceContext,intentId,{owner:runtimeHandle.owner,generation:runtimeHandle.generation,leaseSeconds:60});
 store.execution.bindRuntimeIntent(serviceContext,runtimeHandle,handle);
 const request=await bridge.prepare(runtimeHandle,handle,bridge.inspect(runtimeHandle,handle));
 await bridge.seal(runtimeHandle,handle,request.binding);const found=await bridge.lookup(runtimeHandle,handle,request.binding);
 await bridge.adopt(runtimeHandle,handle,request.binding);await bridge.dispatch(runtimeHandle,handle,request.binding);
 await waitReceipt(found.envelope.txHash);
 const result=await bridge.recover(runtimeHandle,handle,request.binding);
 check(result.completion?.status==='INCLUDED','BC_E5_CORRECTION_NOT_INCLUDED');
 return {plan,intentId,...result,finalized:false};
}
