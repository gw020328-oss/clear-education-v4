import {isIP} from 'node:net';
import {RuleError,requireRule as check} from '../policy/values.mjs';

// Opt-in handler only; no listener, auth deployment or existing route changes.
export function createBootcampHandler(store,{allowLoopbackHttpForTests=false}={}){
  const expected=new URL(store.origin);check(expected.protocol==='https:','BC_HTTP_ORIGIN');let pending=0;
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    let counted=false;const controller=new AbortController(),abort=()=>controller.abort();
    req.on('aborted',abort);res.on('close',()=>{if(!res.writableEnded)abort();});
    try{
      const remote=req.socket.remoteAddress,loopback=remote==='127.0.0.1'||remote==='::1'||remote==='::ffff:127.0.0.1';
      check(isIP(remote??'')&&loopback,'TRANSPORT');
      check(req.socket.encrypted===true||allowLoopbackHttpForTests,'TRANSPORT');
      check(req.headers.host===expected.host&&req.headers.origin===expected.origin,'ORIGIN');
      check(['GET','POST'].includes(req.method),'BC_HTTP_METHOD');
      const cookies=(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith('__Host-clear-session='));
      check(cookies.length===1&&/^__Host-clear-session=[0-9a-f]{64}$/.test(cookies[0]),'AUTH_REQUIRED');
      const chain=req.headers['x-chain-id'];
      const context={token:cookies[0].slice('__Host-clear-session='.length),wallet:req.headers['x-wallet'],
        chainId:typeof chain==='string'&&/^[1-9][0-9]{0,15}$/.test(chain)?Number(chain):null,csrf:req.headers['x-csrf-token']??null};
      // Reject unauthorized uploads before reading their bytes. All bodies here
      // are bounded commands; there is no proof/text/verified receipt endpoint.
      store.policy(context);
      let body;
      if(req.method==='POST'){
        check(req.headers['content-type']==='application/json','BC_HTTP_CONTENT_TYPE');const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;check(size<=4096,'BC_HTTP_BODY_SIZE');chunks.push(chunk);}
        try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new RuleError('BC_HTTP_JSON');}
      }
      const path=req.url,key=req.headers['idempotency-key'];let result;
      if(path==='/bootcamp/v1/policy'&&req.method==='GET')result=store.policy(context);
      else if(path==='/bootcamp/v1/applications'&&req.method==='POST')result=store.createApplication(context,body,key);
      else{
        const m=/^\/bootcamp\/v1\/applications\/([a-z][a-z0-9.-]{0,63})(?:\/(requests|collect|invalidations|cancel|operations|decisions|evidence)(?:\/([a-z][a-z0-9.-]{0,63}))?)?$/.exec(path);
        check(m,'BC_NOT_FOUND');const [,applicationId,resource,target]=m;
        if(req.method==='GET'){
          if(!resource)result=store.getApplication(context,applicationId);
          else if(target&&resource==='requests')result=store.getRequest(context,applicationId,target);
          else if(target&&resource==='operations')result=store.getOperation(context,applicationId,target);
          else if(target&&resource==='decisions')result=store.getDecision(context,applicationId,target);
          else if(target&&resource==='evidence')result=store.getEvidence(context,applicationId,target);
          else check(false,'BC_NOT_FOUND');
        }else if(!target){
          if(resource==='requests')result=store.issueRequest(context,applicationId,body,key);
          else if(resource==='invalidations')result=store.invalidate(context,applicationId,body,key);
          else if(resource==='cancel')result=store.cancel(context,applicationId,body,key);
          else if(resource==='collect'){
            check(pending<8,'BC_HTTP_BUSY');pending++;counted=true;
            result=await store.collect(context,applicationId,body,key,{signal:controller.signal});
          }else check(false,'BC_NOT_FOUND');
        }else check(false,'BC_NOT_FOUND');
      }
      res.writeHead(200);res.end(JSON.stringify(result));
    }catch(error){
      const safe=error instanceof RuleError&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'BC_INTERNAL';
      const status=safe==='AUTH_REQUIRED'?401:['FORBIDDEN','CSRF','ORIGIN','TRANSPORT','WALLET_CONTEXT_CHANGED'].includes(safe)?403
        :safe==='BC_NOT_FOUND'?404:safe==='BC_HTTP_BODY_SIZE'?413:safe==='BC_HTTP_BUSY'?429:safe==='BC_INTERNAL'?500:409;
      if(!res.headersSent){res.writeHead(status);res.end(JSON.stringify({error:safe}));}else res.destroy();
    }finally{if(counted)pending--;req.removeListener('aborted',abort);}
  };
}
