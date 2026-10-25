// This one local TEST page only. No keys, persistence, automatic login or retries.
const codes=new Set(['AUTH_REQUIRED','AUTH_CHALLENGE','SIGNATURE','FORBIDDEN','CSRF','ORIGIN','TRANSPORT','WALLET_CONTEXT_CHANGED','AUTH_RATE_LIMIT',
 'NORMAL_HOST_NOT_ACTIVATED','BC_NORMAL_PROCEDURE_NOT_READY','BC_VIEW_STALE','BC_DECISION_TARGET','BC_NOT_FOUND','BC_IDEMPOTENCY_CONFLICT',
 'BC_UI_ALREADY_BOUND','BC_LIVE_SINGLE_APPLICATION','BC_UI_CONTEXT_CHANGED','BC_UI_CONTEXT_UNAVAILABLE','BC_UI_SIGNATURE_NOT_PENDING',
 'BC_UI_SIGNATURE_EXPIRED','BC_UI_SIGNATURE_CANCELLED','BC_UI_SIGNATURE_REQUEST_USED','BC_UI_PARTICIPANT_REQUIRED','BC_E3_REGISTERED_SNAPSHOT_EXPIRED','BC_E3_REVIEW_CLOSED']);
for(const code of ['BC_NORMAL_AI_AUTHORITY_REQUIRED','BC_NORMAL_AI_APPROVAL_BODY','BC_NORMAL_AI_APPROVAL_TARGET',
 'BC_NORMAL_AI_APPROVAL_ALREADY_RECORDED','BC_NORMAL_AI_APPROVAL_RECORD_FAILED','BC_NORMAL_REVIEW_WINDOW_REQUIRED',
 'BC_NORMAL_REVIEW_SCREENS_REQUIRED','BC_NORMAL_REVIEW_NOT_OPEN','BC_NORMAL_REVIEW_TARGET_CHANGED','BC_LIVE_AI_PREPARATION_STALE'])codes.add(code);
const fail=(code,outcome='NOT_SENT',status=null)=>Object.assign(Error(code),{code,outcome,status});
const wallet=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{40}$/.test(x)&&!/^0x0+$/i.test(x);
const hex=text=>'0x'+Array.from(new TextEncoder().encode(text),b=>b.toString(16).padStart(2,'0')).join('');
function interrupted(pending,signal){return new Promise((resolve,reject)=>{const abort=()=>{done();reject(fail('TEST_CANCELLED'));},done=()=>signal?.removeEventListener('abort',abort);
 signal?.addEventListener('abort',abort,{once:true});Promise.resolve(pending).then(x=>{done();signal?.aborted?reject(fail('TEST_CANCELLED')):resolve(x);},e=>{done();reject(fail(signal?.aborted?'TEST_CANCELLED':e?.code===4001?'TEST_WALLET_REJECTED':'TEST_REQUEST_FAILED'));});if(signal?.aborted)abort();});}
const allowed=(path,method)=>method==='GET'&&(path==='/__dev/config'||path==='/auth/session'||path==='/bootcamp/v4/session'
 ||/^\/bootcamp\/v[234]\/applications\/[a-z][a-z0-9.-]{0,63}\/(operations|procedure|source-signature|payment-receipt)$/.test(path)
 ||/^\/bootcamp\/v3\/applications\/[a-z][a-z0-9.-]{0,63}\/procedure-operations\/[a-z][a-z0-9.-]{0,63}$/.test(path))
 ||method==='POST'&&(['/auth/nonce','/auth/verify','/auth/logout','/bootcamp/v1/applications'].includes(path)
 ||/^\/bootcamp\/v[34]\/applications\/[a-z][a-z0-9.-]{0,63}\/(source-session|source-signature|review-consents)$/.test(path)
 ||/^\/bootcamp\/v4\/applications\/[a-z][a-z0-9.-]{0,63}\/reflection-approval$/.test(path));
export function createTestWalletSession({origin,provider,fetchImpl=globalThis.fetch,onEnd=()=>{},timeoutMs=30000,now=()=>Date.now()}){
 const base=new URL(origin);if(base.protocol!=='https:'||base.origin!==origin||typeof fetchImpl!=='function')throw fail('TEST_ORIGIN');
 let connected=null,auth=null,chainId=null,generation=0,ended=false;const lifetime=new AbortController();
 const headers=()=>connected?{'x-wallet':connected,'x-chain-id':String(chainId),...(auth?{'x-csrf-token':auth.csrf}:{})}:{};
 async function raw(path,{method='GET',body,headers:h={},signal}={}){
  const u=new URL(path,origin);if(!allowed(path,method)||u.origin!==origin||u.pathname!==path||u.search||u.hash||method==='GET'&&body!==undefined)throw fail('TEST_ROUTE');
  const deadline=new AbortController(),scope=AbortSignal.any([signal,deadline.signal].filter(Boolean));let sent=false;
  const timer=setTimeout(()=>deadline.abort(),timeoutMs);let response,reader;
  try{scope.throwIfAborted();const payload=body===undefined?undefined:JSON.stringify(body);sent=true;
   response=await interrupted(Promise.resolve().then(()=>{scope.throwIfAborted();return fetchImpl(u.href,{method,body:payload,headers:{...h,...(payload===undefined?{}:{'content-type':'application/json'})},
    credentials:'same-origin',cache:'no-store',redirect:'error',signal:scope});}).then(r=>{if(scope.aborted){try{Promise.resolve(r.body?.cancel()).catch(()=>{});}catch{}throw fail('TEST_CANCELLED');}return r;}),scope);
   if(response.redirected||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw fail('TEST_RESPONSE');
   reader=response.body.getReader();const chunks=[];let size=0;const cap=response.ok?512*1024:4096;
   for(;;){const r=await interrupted(reader.read(),scope);if(r.done)break;size+=r.value.byteLength;if(size>cap)throw fail('TEST_RESPONSE');chunks.push(r.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
   const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));scope.throwIfAborted();
   if(!response.ok){const c=value?.error??value?.code;throw fail(codes.has(c)?c:'TEST_HTTP_ERROR',method==='GET'||response.status<500?'HTTP_ERROR':'UNKNOWN',response.status);}
   return value;
  }catch(e){if(e.status)throw e;throw fail(scope.aborted?(signal?.aborted?'TEST_CANCELLED':'TEST_TIMEOUT'):e.code==='TEST_RESPONSE'?'TEST_RESPONSE':'TEST_REQUEST_FAILED',sent&&method==='POST'?'UNKNOWN':sent?'READ_FAILED':'NOT_SENT');}
  finally{clearTimeout(timer);try{Promise.resolve(reader?.cancel()).catch(()=>{});reader?.releaseLock();}catch{}try{Promise.resolve(response?.body?.cancel()).catch(()=>{});}catch{}}
 }
 const rpc=(method,params,signal)=>interrupted(Promise.resolve().then(()=>provider.request({method,params})),signal);
 const scope=signal=>AbortSignal.any([lifetime.signal,signal].filter(Boolean));
 async function check(stamp,signal){if(ended||stamp!==generation||!connected)throw fail('TEST_WALLET_CHANGED');
  const a=await rpc('eth_accounts',[],signal),c=await rpc('eth_chainId',[],signal);
  if(ended||stamp!==generation||!wallet(a?.[0])||a[0].toLowerCase()!==connected||BigInt(c)!==BigInt(chainId)){void end();throw fail('TEST_WALLET_CHANGED');}}
 async function end(){if(ended)return;const h=headers(),had=!!auth;ended=true;generation++;lifetime.abort();connected=null;auth=null;try{onEnd();}catch{}
  if(had)try{await raw('/auth/logout',{method:'POST',body:{},headers:h});return 'REVOKED';}catch{return 'REVOCATION_UNCONFIRMED';}return 'ENDED';}
 const events={accountsChanged:accounts=>{if(connected&&(!wallet(accounts?.[0])||accounts[0].toLowerCase()!==connected))void end();},
  chainChanged:chain=>{if(connected){try{if(BigInt(chain)!==BigInt(chainId))void end();}catch{void end();}}},disconnect:()=>{if(connected)void end();}};
 for(const [event,handler]of Object.entries(events))provider?.on?.(event,handler);
 return Object.freeze({publicRead:(path,options)=>raw(path,options),
  async network(config,{signal}={}){if(ended||connected||config?.phase!=='ACTIVE_LOCAL_TEST'||config.sourceMode!=='REGISTERED_TEST_SOURCE'||config.origin!==origin||!Number.isSafeInteger(config.chainId)||config.chainId<1
    ||config.network?.chainId!=='0x'+BigInt(config.chainId).toString(16)||config.network.rpcUrls?.length!==1)throw fail('TEST_NETWORK');
   const u=new URL(config.network.rpcUrls[0]);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.pathname!=='/'||u.username||u.password||u.search||u.hash)throw fail('TEST_NETWORK');
   await rpc('wallet_addEthereumChain',[{chainId:config.network.chainId,chainName:'CLEAR Local TEST',rpcUrls:[u.origin],nativeCurrency:{name:'Local test Ether',symbol:'ETH',decimals:18}}],scope(signal));if(ended||signal?.aborted)throw fail('TEST_CANCELLED');chainId=config.chainId;},
  async login(config,{signal}={}){if(ended||auth||!provider||config.phase!=='ACTIVE_LOCAL_TEST'||config.sourceMode!=='REGISTERED_TEST_SOURCE'||config.origin!==origin||!Number.isSafeInteger(config.chainId)||config.chainId<1)throw fail('TEST_LOGIN_NOT_READY');
   const s=scope(signal),stamp=generation;chainId=config.chainId;
   try{const accounts=await rpc('eth_requestAccounts',[],s);if(!wallet(accounts?.[0]))throw fail('TEST_WALLET');connected=accounts[0].toLowerCase();await check(stamp,s);
    const q=await raw('/auth/nonce',{method:'POST',body:{wallet:connected,chainId},signal:s});await check(stamp,s);
    if(typeof q.message!=='string'||q.message.length>16384||!Number.isSafeInteger(q.expiresAt)||now()/1000>=q.expiresAt)throw fail('TEST_CHALLENGE');
    const signature=await rpc('personal_sign',[hex(q.message),connected],s);await check(stamp,s);
    const result=await raw('/auth/verify',{method:'POST',body:{nonce:q.nonce,signature},signal:s});
    // Retain only the private CSRF in this closure so an event/abort can revoke an already-created session.
    if(!wallet(result.wallet)||!/^[0-9a-f]{64}$/.test(result.csrf??''))throw fail('TEST_SESSION');
    if(ended||stamp!==generation||s.aborted){try{await raw('/auth/logout',{method:'POST',body:{},headers:{'x-wallet':result.wallet,'x-chain-id':String(chainId),'x-csrf-token':result.csrf}});}catch{}throw fail('TEST_CANCELLED');}auth={csrf:result.csrf};
    await check(stamp,s);if(result.wallet.toLowerCase()!==connected||!['participant','operator'].includes(result.role))throw fail('TEST_SESSION');
    return {wallet:connected,role:result.role,expiresAt:result.expiresAt};
   }catch(e){await end();throw e;}},
  async request(path,options={}){const s=scope(options.signal),stamp=generation;await check(stamp,s);if(!auth)throw fail('AUTH_REQUIRED');
   try{const result=await raw(path,{...options,headers:{...headers(),...(options.idempotencyKey?{'idempotency-key':options.idempotencyKey}:{})},signal:s});await check(stamp,s);return result;}catch(e){if(e.status===401||['CSRF','WALLET_CONTEXT_CHANGED'].includes(e.code))await end();throw e;}},
  async sign(message,{signal}={}){const s=scope(signal),stamp=generation;await check(stamp,s);if(!auth||typeof message!=='string'||message.length>16384)throw fail('TEST_SIGNATURE');
   const signature=await rpc('personal_sign',[hex(message),connected],s);await check(stamp,s);return signature;},end,
  dispose(){for(const [event,handler]of Object.entries(events))provider?.removeListener?.(event,handler);return end();}
 });
}
