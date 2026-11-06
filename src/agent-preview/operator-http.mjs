// Opt-in handler factory only. A owns mounting, authentication and native grants.
import {strictJson} from '../hackerrank-evidence/values.mjs';
import {OPERATOR_PREVIEW_VERSION,operatorPreviewFailure} from './operator-relay.mjs';

const faults=new WeakMap();
function reject(code,status=400){const error=new Error(code);faults.set(error,{code,status});throw error;}
const check=(ok,code,status)=>{if(!ok)reject(code,status);};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function envelope(code){return {version:OPERATOR_PREVIEW_VERSION,scope:'PRECONFIGURATION_ONLY',
  automaticEligibility:false,paymentAllowed:false,stage:'FAILED',failure:{kind:'RELAY',code}};}
function wait(promise,signal){return new Promise((resolve,reject)=>{
  const cell={resolve,reject};resolve=reject=null;
  const done=(ok,value)=>{const fn=ok?cell.resolve:cell.reject;if(!fn)return;cell.resolve=cell.reject=null;
    signal.removeEventListener('abort',abort);fn(value);};
  const abort=()=>done(false,signal.reason);
  Promise.resolve(promise).then(v=>done(true,v),e=>done(false,e));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
});}
function assertFence(fence,signal){check(!signal.aborted,'PREVIEW_CANCELLED',409);
  check(typeof fence?.assertCurrent==='function','PREVIEW_UNAVAILABLE',503);
  const value=fence.assertCurrent();if(value&&typeof value.then==='function'){Promise.resolve(value).catch(()=>{});reject('PREVIEW_UNAVAILABLE',503);}}

/**
 * runCommand({request,context,command,signal}, work) MUST reserve the existing
 * native command for exactly method/path/body, run work({assertCurrent}) under
 * that reservation, assert before commit, and finish/fail using A's current
 * command scope. No replacement lease, cookie or default implementation exists.
 */
export function createOperatorPreviewHandler({enabled=false,origin,authentication,relay,runCommand}={}){
  let expected;try{expected=new URL(origin);}catch{}
  const configured=enabled===true&&expected?.protocol==='https:'&&expected.origin===origin
    &&typeof authentication?.authorizeWorkflow==='function'&&typeof runCommand==='function'
    &&['prepare','generate','execute','publish'].every(k=>typeof relay?.[k]==='function');
  let pending=0;
  function authorize(context){let actor;
    try{actor=authentication.authorizeWorkflow(context,true);}catch{reject('PREVIEW_AUTH_REQUIRED',403);}
    if(actor&&typeof actor.then==='function'){Promise.resolve(actor).catch(()=>{});reject('PREVIEW_UNAVAILABLE',503);}
    check(actor?.role==='operator','PREVIEW_FORBIDDEN',403);
  }
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    const controller=new AbortController(),signal=controller.signal;let counted=false;
    const abort=()=>controller.abort(),close=()=>{if(!res.writableEnded)abort();};
    req.on('aborted',abort);res.on('close',close);
    const timer=setTimeout(abort,45000);timer.unref?.();
    try{
      check(configured,'PREVIEW_UNAVAILABLE',503);
      check(req.socket?.encrypted===true&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress),'PREVIEW_TRANSPORT',403);
      check(req.headers.host===expected.host&&req.headers.origin===expected.origin
        &&(!req.headers['sec-fetch-site']||req.headers['sec-fetch-site']==='same-origin'),'PREVIEW_ORIGIN',403);
      check(req.method==='POST','PREVIEW_METHOD',405);
      const route=/^\/bootcamp\/preview\/(prepare|generate|execute)$/.exec(req.url);
      check(route,'PREVIEW_NOT_FOUND',404);
      const cookies=(typeof req.headers.cookie==='string'?req.headers.cookie:'').split(';').map(v=>v.trim())
        .filter(v=>v.startsWith('__Host-clear-session='));
      check(cookies.length===1&&/^__Host-clear-session=[a-f0-9]{64}$/.test(cookies[0]),'PREVIEW_AUTH_REQUIRED',401);
      const chain=req.headers['x-chain-id'];
      check(typeof chain==='string'&&/^[1-9][0-9]{0,15}$/.test(chain)&&Number.isSafeInteger(Number(chain))
        &&typeof req.headers['x-wallet']==='string'&&/^0x[a-fA-F0-9]{40}$/.test(req.headers['x-wallet'])
        &&typeof req.headers['x-csrf-token']==='string'&&/^[a-f0-9]{64}$/.test(req.headers['x-csrf-token']),'PREVIEW_AUTH_REQUIRED',403);
      const context=Object.freeze({token:cookies[0].slice('__Host-clear-session='.length),wallet:req.headers['x-wallet'],
        chainId:Number(chain),csrf:req.headers['x-csrf-token']});
      authorize(context); // Current session and CSRF before any upload bytes.
      check(req.headers['content-type']==='application/json'&&req.headers['content-encoding']===undefined,'PREVIEW_CONTENT_TYPE',415);
      check(pending<8,'PREVIEW_BUSY',429);pending++;counted=true;
      const chunks=[];let size=0;const iterator=req[Symbol.asyncIterator]();
      for(;;){const next=await wait(iterator.next(),signal);if(next.done)break;
        check(Buffer.isBuffer(next.value),'PREVIEW_JSON');size+=next.value.length;check(size<=16384,'PREVIEW_BODY_LIMIT',413);chunks.push(next.value);}
      let body;try{body=strictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)),16384);}catch{reject('PREVIEW_JSON');}
      freeze(body);authorize(context);check(!signal.aborted,'PREVIEW_CANCELLED',409);
      const command=freeze({method:'POST',path:req.url,body});let invoked=false,result;
      await wait(Promise.resolve().then(()=>runCommand({request:req,context,command,signal},async fence=>{
        check(!invoked,'PREVIEW_ALREADY_USED',409);invoked=true;assertFence(fence,signal);
        const value=await relay[route[1]](context,body,{signal,assertCurrent:()=>assertFence(fence,signal)});
        assertFence(fence,signal);result=value;return value;
      })),signal);
      check(invoked&&result!==undefined,'PREVIEW_UNAVAILABLE',503);authorize(context);check(!signal.aborted,'PREVIEW_CANCELLED',409);
      if(result.stage==='FAILED'&&result.failure?.kind==='D_HTTP'){
        res.writeHead(result.failure.status);res.end(JSON.stringify(result));
      }else{
        await relay.publish(context,result,{signal},body=>{res.writeHead(200);res.end(body);});
      }
    }catch(error){
      const fault=faults.get(error),body=fault?envelope(fault.code):operatorPreviewFailure(error);
      const code=body.failure.code,status=fault?.status??(code==='PREVIEW_UNAVAILABLE'?503:code==='PREVIEW_FORBIDDEN'?403
        :code==='PREVIEW_AUTH_REQUIRED'?401:code==='PREVIEW_REJECTED'?400:409);
      if(!res.headersSent&&!res.destroyed){res.writeHead(status);res.end(JSON.stringify(body));}else if(!res.writableEnded)res.destroy();
    }finally{controller.abort();clearTimeout(timer);if(counted)pending--;req.removeListener('aborted',abort);res.removeListener('close',close);}
  };
}
