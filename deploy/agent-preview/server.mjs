import http from 'node:http';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {validateConfig,readSecret,check} from './config.mjs';
import {openStore} from './store.mjs';
import {authenticate} from './auth.mjs';
import {createService} from './service.mjs';

const routes=new Map([['/v1/preview/prepare','prepare'],['/v1/preview/generate','generate'],['/v1/preview/execute','execute']]);
const publicErrors=new Set(['AUTH_REQUIRED','HOST_REJECTED','SERVER_TO_SERVER_ONLY','REQUEST_REPLAY',
  'INVALID_FIELDS','ACTOR_SCOPE','SOURCE_INVALID','APPROVAL_INVALID','APPROVAL_REQUIRED_OR_SPENT','BUSY','DRAFT_LIMIT',
  'INPUT_TOKEN_LIMIT','DRAFT_STALE_OR_UNREVIEWED','DRAFT_NOT_READY','PLAN_REJECTED','ACTUAL_TOOL_NOT_ENABLED',
  'OBSERVATION_ADAPTER_NOT_ACCEPTED','OBSERVATION_INVALID','BODY_LIMIT','CONTENT_TYPE','ROUTE_NOT_FOUND',
  'GEMINI_RATE_LIMIT','GEMINI_BILLING_ERROR','GEMINI_HTTP_FAILURE','GEMINI_NETWORK_FAILURE','GEMINI_REQUEST_ABORTED']);
function send(res,status,value) {
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'",'connection':'close'});
  res.end(JSON.stringify(value));
}
export function createServer({config,secret,store,service,clock=Date.now}) {
  let inflight=0;
  const server=http.createServer({maxHeaderSize:8192,requestTimeout:10000,headersTimeout:10000},async(req,res)=>{
    let entered=false;
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
      send(res,200,await service[routes.get(req.url)](value));
    } catch(e) {
      const code=publicErrors.has(e.message)?e.message:'REQUEST_REJECTED';
      const status=['AUTH_REQUIRED','HOST_REJECTED','SERVER_TO_SERVER_ONLY','ACTOR_SCOPE'].includes(code)?403:
        code==='ROUTE_NOT_FOUND'?404:code==='BODY_LIMIT'?413:code==='BUSY'?429:
        code==='OBSERVATION_ADAPTER_NOT_ACCEPTED'?503:422;
      if(!res.headersSent) send(res,status,{version:'clear-external-preview-error.1',code,paymentAllowed:false});
    } finally {if(entered)inflight--;}
  });
  server.maxConnections=16;
  server.timeout=55000;
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  try {
    check(process.version==='v24.21.0','RUNTIME_VERSION');
    const config=validateConfig(JSON.parse(readFileSync(process.env.CLEAR_PREVIEW_CONFIG,'utf8')));
    const secret=readSecret(config.sharedSecretFile,/^[a-f0-9]{64}$/),store=openStore(config.databasePath);
    const service=createService({config,store}),server=createServer({config,secret,store,service});
    // Container deployments use host networking; only the TLS proxy reaches this loopback listener.
    server.listen(config.port,'127.0.0.1',()=>console.log(JSON.stringify({event:'LISTENING',port:config.port,
      scope:'PRECONFIGURATION_ONLY',actualObservationEnabled:false,paymentAllowed:false})));
    for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>{
      server.close(()=>{service.close();store.close();process.exit(0);});
      setTimeout(()=>process.exit(1),55000).unref();
    });
  } catch {console.error('PREVIEW_START_FAILED');process.exitCode=1;}
}
