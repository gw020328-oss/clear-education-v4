// Setup only: read the exact already-submitted transaction. Never resend/sign.
import {ensure} from './private-storage.mjs';
export async function waitSetupReceipt(provider,txHash,{timeoutMs=15000,pollMs=50}={}){
 ensure(/^0x[0-9a-f]{64}$/.test(txHash),'E5_SETUP_RECEIPT_HASH');
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  let timer,receipt;
  try{
   receipt=await Promise.race([provider.getTransactionReceipt(txHash),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('E5_SETUP_RECEIPT_TIMEOUT')),Math.max(1,deadline-Date.now()));})]);
  }catch(error){
   if(error.message==='E5_SETUP_RECEIPT_TIMEOUT')throw error;
   const indexing=error.code==='UNKNOWN_ERROR'&&error.error?.message==='transaction indexing is in progress'&&error.payload?.method==='eth_getTransactionReceipt'&&error.payload.params?.length===1&&error.payload.params[0]===txHash;
   ensure(indexing,'E5_SETUP_RECEIPT_READ_FAILED');
  }finally{clearTimeout(timer);}
  ensure(Date.now()<deadline,'E5_SETUP_RECEIPT_TIMEOUT');
  if(receipt){ensure(receipt.hash===txHash&&receipt.status===1&&/^0x[0-9a-f]{64}$/.test(receipt.blockHash)&&Number.isSafeInteger(receipt.blockNumber),'E5_SETUP_RECEIPT_INVALID');return receipt;}
  await new Promise(resolve=>setTimeout(resolve,Math.min(pollMs,Math.max(1,deadline-Date.now()))));
 }
 throw Error('E5_SETUP_RECEIPT_TIMEOUT');
}
