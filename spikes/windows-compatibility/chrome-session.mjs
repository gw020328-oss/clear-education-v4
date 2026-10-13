// CDP transport failures and actual process exit are separate observations.
export async function probeChromeSession(child,{requestTimeoutMs=10000,exitWaitMs=5000}={}) {
  const checks=[];const add=(id,status)=>checks.push({id,status});
  let seq=0,buffer=Buffer.alloc(0),transportClosed=false,exited=false,exitCode,exitSignal;
  const pending=new Map();
  const fail=()=>{transportClosed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('CHROME_CLOSED'));}pending.clear();};
  child.on('error',fail);
  child.on('exit',(code,signal)=>{exited=true;exitCode=code;exitSignal=signal;fail();});
  for(const stream of [child.stdio[3],child.stdio[4]])stream.on('error',fail);
  child.stdio[4].on('data',chunk=>{
    if(transportClosed)return;
    buffer=Buffer.concat([buffer,chunk]);if(buffer.length>1024*1024){fail();return;}
    for(let end;(end=buffer.indexOf(0))>=0;){
      let msg;try{msg=JSON.parse(buffer.subarray(0,end));}catch{fail();return;}
      buffer=buffer.subarray(end+1);const p=pending.get(msg.id);if(!p)continue;
      pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(new Error('CDP_ERROR')):p.resolve(msg.result);
    }
  });
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
    if(transportClosed){reject(new Error('CHROME_CLOSED'));return;}
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP_TIMEOUT'));},requestTimeoutMs);
    pending.set(id,{resolve,reject,timer});
    child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');
  });
  try {
    await send('Browser.getVersion');add('chrome-private-pipe','PASS');
    await send('Browser.setDownloadBehavior',{behavior:'deny'});
    const {targetId}=await send('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    const result=await send('Runtime.evaluate',{expression:'6*7',returnByValue:true},sessionId);
    add('chrome-synthetic-cdp-roundtrip',result.result.value===42?'PASS':'FAIL');
    await send('Browser.close').catch(()=>{});
    const deadline=Date.now()+exitWaitMs;
    while(!exited&&Date.now()<deadline)await new Promise(r=>setTimeout(r,Math.min(50,exitWaitMs)));
    add('chrome-normal-exit',exited&&exitCode===0&&!exitSignal?'PASS':'FAIL');
  } catch {add('chrome-pipe-execution','FAIL');}
  finally {
    // A closed/erroring pipe does not prove the process exited. The Job host
    // separately confirms every descendant is gone before deleting the profile.
    if(!exited)child.kill();fail();child.stdio[3].destroy();child.stdio[4].destroy();
  }
  return checks;
}
