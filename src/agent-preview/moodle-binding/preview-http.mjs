import { createPreviewAuthenticationHandler, readPreviewAuthenticationContext } from '../../application/http.mjs';
import { strictJson } from '../../hackerrank-evidence/values.mjs';
import { requireRule as check } from './contract.mjs';

// Factory only; no listener, peer activation, proxy trust, file/DB or payment routes.
export function createPreviewHttpHandler({ authentication, contexts, enabled = false, cookieNamespace = 'preview', allowLoopbackHttpForTests = false }) {
  check(typeof enabled === 'boolean', 'PREVIEW_CONFIG');
  const options = {cookieNamespace,allowLoopbackHttpForTests};
  const auth = createPreviewAuthenticationHandler(authentication,options);
  const routes = new Map([['/preview/context','issue'],['/preview/review','review'],['/preview/observe','observe']]);
  if(typeof contexts.generate === 'function') routes.set('/preview/generate', 'generate');
  const send = (res,status,body) => {res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',
    'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'"});res.end(JSON.stringify(body));};
  return async (req,res) => {
    if(!enabled) return send(res,503,{code:'PREVIEW_DISABLED'});
    if(req.url.startsWith('/auth/')) return auth(req,res);
    if(req.method !== 'POST' || !routes.has(req.url)) return send(res,404,{code:'ROUTE'});
    const controller = new AbortController();
    const abort = () => controller.abort(Error('PREVIEW_CLIENT_CLOSED'));
    const closed = () => { if(!res.writableEnded) abort(); };
    req.once('aborted', abort);
    res.once('close', closed);
    try {
      const context = readPreviewAuthenticationContext(authentication,req,options);
      // Deny before reading a body; each context operation rechecks after body I/O too.
      check(authentication.authorizeWorkflow(context,true).role === 'participant','PREVIEW_SELF_ONLY');
      check(req.headers['content-type'] === 'application/json' && !req.headers['content-encoding'],'PREVIEW_CONTENT_TYPE');
      const chunks=[];let size=0;
      for await(const chunk of req) {size+=chunk.length;check(size<=16384,'PREVIEW_SIZE');chunks.push(chunk);}
      const body = strictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)),16384);
      controller.signal.throwIfAborted();
      const result = await contexts[routes.get(req.url)](context,body,{signal:controller.signal});
      if(!res.destroyed) send(res,200,result);
    } catch { if(!res.headersSent && !res.destroyed) send(res,422,{code:'PREVIEW_REJECTED',paymentAllowed:false}); }
    finally { req.removeListener('aborted', abort); res.removeListener('close', closed); }
  };
}
