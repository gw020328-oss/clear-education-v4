import http from 'node:http';
import {check} from './config.mjs';
import {authenticate} from './auth.mjs';

const routes=new Map([['/v1/preview/prepare','prepare'],['/v1/preview/generate','generate'],['/v1/preview/execute','execute']]);
const publicErrors=new Set(['AUTH_REQUIRED','HOST_REJECTED','SERVER_TO_SERVER_ONLY','REQUEST_REPLAY',
  'INVALID_FIELDS','ACTOR_SCOPE','SOURCE_INVALID','APPROVAL_INVALID','APPROVAL_REQUIRED_OR_SPENT','APPROVAL_EXPIRED','BUSY','DRAFT_LIMIT',
  'INPUT_TOKEN_LIMIT','DRAFT_STALE_OR_UNREVIEWED','DRAFT_NOT_READY','PLAN_REJECTED','ACTUAL_TOOL_NOT_ENABLED',
  'OBSERVATION_ADAPTER_NOT_ACCEPTED','OBSERVATION_INVALID','BODY_LIMIT','CONTENT_TYPE','ROUTE_NOT_FOUND',
  'GEMINI_RATE_LIMIT','GEMINI_BILLING_ERROR','GEMINI_HTTP_FAILURE','GEMINI_NETWORK_FAILURE','GEMINI_REQUEST_ABORTED',
  // Fixed post-reply validation codes (no provider text): the model replied but the reply was not accepted.
  'MODEL_CLAUSE_COVERAGE','MODEL_CLAUSE_FIELDS','MODEL_SOURCE_SPAN','MODEL_QUESTION','MODEL_CAPABILITY','MODEL_CAPABILITY_MISMATCH','GEMINI_CANDIDATES','GEMINI_RESPONSE_PARTS','GEMINI_RESPONSE_SCHEMA','GEMINI_RESPONSE_INVALID','GEMINI_KEY_MISSING']);
function send(res,status,value) {
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'",'connection':'close'});
  res.end(JSON.stringify(value));
}
export function createServer({config,secret,store,service,clock=Date.now}) {
  let inflight=0;
  const server=http.createServer({maxHeaderSize:8192,requestTimeout:10000,headersTimeout:10000},async(req,res)=>{
    let entered=false;const controller=new AbortController();
    const cancel=()=>{if(!res.writableEnded)controller.abort(new Error('REQUEST_ABORTED'));};
    req.once('aborted',cancel);res.once('close',cancel);
    try {
      check(req.headers.host===new URL(config.publicOrigin).host,'HOST_REJECTED');
      check(inflight<4,'BUSY');inflight++;entered=true;
      check(req.method==='POST' && routes.has(req.url),'ROUTE_NOT_FOUND');
      check(req.headers['content-type']==='application/json' && !req.headers['content-encoding'],'CONTENT_TYPE');
      check(!req.headers['content-length'] || Number(req.headers['content-length'])<=16384,'BODY_LIMIT');
      let size=0;const chunks=[];
      for await(const chunk of req) {size+=chunk.length;check(size<=16384,'BODY_LIMIT');chunks.push(chunk);}
      const body=Buffer.concat(chunks);
      authenticate(req,body,{secret,config,store,now:clock()});
      // Fatal decoding rejects invalid UTF-8; duplicate JSON members are rejected by strictJson.
      const {strictJson}=await import('../../src/hackerrank-evidence/values.mjs');
      const value=strictJson(new TextDecoder('utf-8',{fatal:true}).decode(body),16384);
      const result=await service[routes.get(req.url)](value,{signal:controller.signal});
      if(!res.destroyed)send(res,200,result);
    } catch(e) {
      const code=publicErrors.has(e.message)?e.message:'REQUEST_REJECTED';
      const status=['AUTH_REQUIRED','HOST_REJECTED','SERVER_TO_SERVER_ONLY','ACTOR_SCOPE'].includes(code)?403:
        code==='ROUTE_NOT_FOUND'?404:code==='BODY_LIMIT'?413:code==='BUSY'?429:
        code==='OBSERVATION_ADAPTER_NOT_ACCEPTED'?503:422;
      if(!res.headersSent && !res.destroyed) send(res,status,{version:'clear-external-preview-error.1',code,paymentAllowed:false});
    } finally {req.removeListener('aborted',cancel);res.removeListener('close',cancel);if(entered)inflight--;}
  });
  server.maxConnections=16;
  server.timeout=55000;
  server.on('timeout',socket=>socket.destroy());
  return server;
}
