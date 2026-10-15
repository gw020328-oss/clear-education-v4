import { open, readFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Acquire before reading any remaining budget. No PID-based automatic recovery:
// a killed runner leaves its lock for explicit offline reconciliation.
export async function withEvaluationLease(directory, action) {
  const path=new URL('execution.lock',directory),token=randomUUID();let handle;
  try{handle=await open(path,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw new Error('EVALUATION_BUSY_OR_RECOVERY_REQUIRED');throw new Error('EVALUATION_LOCK_FAILED');}
  try{
    await handle.writeFile(JSON.stringify({version:'clear-evaluation-lease.1',token,pid:process.pid}));await handle.sync();await handle.close();handle=null;
    return await action();
  }finally{
    if(handle)await handle.close().catch(()=>{});
    // Never remove a replaced lock. Release failure requires offline recovery.
    const held=JSON.parse(await readFile(path,'utf8'));
    if(held.token!==token)throw new Error('EVALUATION_LOCK_OWNERSHIP');
    await unlink(path);
  }
}

// A checkpoint is committed by same-directory rename before paid dispatch.
// On any failure callers throw/stop; no request may follow a failed checkpoint.
export async function atomicEvaluationCheckpoint(target,value) {
  const temporary=new URL('.ledger-'+randomUUID()+'.tmp',new URL('.',target));let handle;
  try{
    handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(value,null,2));await handle.sync();await handle.close();handle=null;
    await rename(temporary,target);
    const directory=await open(new URL('.',target),'r');try{await directory.sync();}finally{await directory.close();}
  }catch{throw new Error('EVALUATION_CHECKPOINT_FAILED');}
  finally{if(handle)await handle.close().catch(()=>{});await unlink(temporary).catch(()=>{});}
}
