// On cancellation the unresolved provider promise retains an emptied cell, not
// the service continuation. A noncooperative adapter can retain its own arguments;
// physical erasure of third-party memory is not promised.
export function awaitAbortable(promise,signal) {
  return new Promise((resolve,reject)=>{
    const cell={resolve,reject};resolve=null;reject=null;
    const finish=(ok,value)=>{
      const fn=ok?cell.resolve:cell.reject;
      if(!fn)return;
      cell.resolve=null;cell.reject=null;
      signal.removeEventListener('abort',abort);
      fn(value);
    };
    const abort=()=>finish(false,signal.reason??new Error('REQUEST_ABORTED'));
    Promise.resolve(promise).then(value=>finish(true,value),error=>finish(false,error));
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted)abort();
  });
}
