import {isIP} from 'node:net';
import {RuleError,exactKeys,requireRule as check} from '../policy/values.mjs';

// Opt-in handler only; no listener, auth deployment or existing route changes.
export function createBootcampHandler(store,{allowLoopbackHttpForTests=false,normalUi=null}={}){
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
      const v2=req.url.startsWith('/bootcamp/v2/'),v3=req.url.startsWith('/bootcamp/v3/'),v4=req.url.startsWith('/bootcamp/v4/');
      if(v2||v3||v4)store.authorizeOperations(context,req.method==='POST');else store.policy(context);
      let body;
      if(req.method==='POST'){
        check(req.headers['content-type']==='application/json','BC_HTTP_CONTENT_TYPE');const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;check(size<=4096,'BC_HTTP_BODY_SIZE');chunks.push(chunk);}
        try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new RuleError('BC_HTTP_JSON');}
      }
      const path=req.url,key=req.headers['idempotency-key'];let result;
      if(v4){
        const m=/^\/bootcamp\/v4\/applications\/([a-z][a-z0-9.-]{0,63})\/(source-session|source-signature)$/.exec(path);
        check(normalUi&&m,'BC_NOT_FOUND');const [,a,resource]=m;
        if(req.method==='GET'&&resource==='source-signature')result=normalUi.pendingSignature(context,a);
        else if(req.method==='POST'&&resource==='source-signature')result=normalUi.submitSignature(context,a,body);
        else if(req.method==='POST'&&resource==='source-session'){exactKeys(body,[],'BC_UI_SESSION_BODY');result=normalUi.bindParticipant(context,a);}
        else check(false,'BC_NOT_FOUND');
      }
      else if(v3){
        const m=/^\/bootcamp\/v3\/applications\/([a-z][a-z0-9.-]{0,63})\/(procedure|review-publications|review-consents|review-objections|objection-assessments|review-revalidations|unsigned-preparations|termination-intents|procedure-operations)(?:\/([a-z][a-z0-9.-]{0,63}))?$/.exec(path);
        check(m,'BC_NOT_FOUND');const [,a,resource,target]=m;
        if(req.method==='GET'){
          if(!target&&resource==='procedure')result=store.getProcedure(context,a);
          else if(target&&resource==='procedure-operations')result=store.getProcedureOperation(context,a,target);
          else check(false,'BC_NOT_FOUND');
        }else if(!target){
          const methods={'review-publications':'publishReview','review-consents':'recordReviewConsent','review-objections':'submitReviewObjection',
            'objection-assessments':'assessReviewObjection','review-revalidations':'recordReviewRevalidation','unsigned-preparations':'prepareReviewAuthorization','termination-intents':'requestReviewTermination'};
          check(methods[resource],'BC_NOT_FOUND');result=store[methods[resource]](context,a,body,key);
        }else check(false,'BC_NOT_FOUND');
      }
      else if(v2){
        if(path==='/bootcamp/v2/operations'||path.startsWith('/bootcamp/v2/operations?')){
          check(req.method==='GET','BC_HTTP_METHOD');const u=new URL(path,expected);
          check([...u.searchParams.keys()].every(k=>['limit','after','sequence'].includes(k))
            &&[...u.searchParams.keys()].length===new Set(u.searchParams.keys()).size,'BC_PAGE');
          const numeric=(key,fallback)=>{const v=u.searchParams.get(key);if(v===null)return fallback;check(/^(0|[1-9][0-9]{0,14})$/.test(v),'BC_PAGE');return Number(v);};
          result=store.listOperations(context,{limit:numeric('limit',20),after:u.searchParams.get('after'),expectedLedgerSequence:numeric('sequence',null)});
        }else{
          const m=/^\/bootcamp\/v2\/applications\/([a-z][a-z0-9.-]{0,63})\/(operations|metric-events|consent-requests|objections|actions|operation-receipts|source-requests|source-collection)(?:\/([a-z][a-z0-9.-]{0,63}))?$/.exec(path);
          check(m,'BC_NOT_FOUND');const [,a,resource,target]=m;
          if(req.method==='GET'){
            if(!target&&resource==='operations')result=store.getOperationsProjection(context,a);
            else if(!target&&resource==='metric-events')result=store.getMetricEvents(context,a);
            else if(target&&resource==='actions')result=store.getAction(context,a,target);
            else if(target&&resource==='operation-receipts')result=store.getR2Operation(context,a,target);
            else if(target&&resource==='source-requests')result=store.getRequest(context,a,target,{bridge:true});
            else check(false,'BC_NOT_FOUND');
          }else if(!target){
            if(resource==='consent-requests')result=store.requestConsent(context,a,body,key);
            else if(resource==='objections')result=store.fileObjection(context,a,body,key);
            else if(resource==='source-requests')result=store.issueBridgeRequest(context,a,body,key);
            else if(resource==='source-collection'){
              check(pending<8,'BC_HTTP_BUSY');pending++;counted=true;result=await store.collectBridge(context,a,body,key,{signal:controller.signal});
              result=store.getR2Operation(context,a,result.record.operationId);
            }else check(false,'BC_NOT_FOUND');
          }else check(false,'BC_NOT_FOUND');
        }
      }
      else if(path==='/bootcamp/v1/policy'&&req.method==='GET')result=store.policy(context);
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
            result=store.getOperation(context,applicationId,result.record.operationId);
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
