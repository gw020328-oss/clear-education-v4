export function normalizeWalletError(error) {
  const raw=String(error?.code||error?.shortMessage||error?.message||'');
  if(raw.includes('ACTION_REJECTED')||raw.includes('4001'))return withCode(error,'ACTION_REJECTED');
  if(raw.includes('4100')||/locked|unauthori[sz]ed/i.test(raw))return withCode(error,'WALLET_LOCKED');
  if(raw.includes('CALL_EXCEPTION'))return withCode(error,'TRANSACTION_REVERTED');
  return error;
}
export async function waitForFinalReceipt(transaction) {
  try { const receipt=await transaction.wait();if(!receipt)throw withCode(new Error(),'RECEIPT_UNAVAILABLE');if(receipt.status!==1)throw withCode(new Error(),'TRANSACTION_REVERTED');return receipt; }
  catch(error){
    if(error?.code==='TRANSACTION_REPLACED'){
      if(error.cancelled)throw withCode(error,'TRANSACTION_CANCELLED');
      if(!error.receipt)throw withCode(error,'RECEIPT_UNAVAILABLE');
      if(error.receipt.status!==1)throw withCode(error,'TRANSACTION_REVERTED');
      return error.receipt;
    }
    if(error?.receipt?.status===0)throw withCode(error,'TRANSACTION_REVERTED');
    if(['TRANSACTION_REVERTED','TRANSACTION_CANCELLED','RECEIPT_UNAVAILABLE'].includes(error?.code))throw error;
    throw withCode(error,'RECEIPT_UNAVAILABLE');
  }
}
function withCode(error,code){try{error.code=code;return error}catch{const wrapped=new Error(code);wrapped.code=code;wrapped.cause=error;return wrapped}}
