// The actual host's preparation listener. No auth/store/chain/collector/model is constructed.
import {createServer} from 'node:https';
import {existsSync,readFileSync} from 'node:fs';
import {loadPublicAssets} from '../../src/dev/public-assets.mjs';
import {NORMAL_HOST_VERSION} from '../../src/bootcamp/normal-client.mjs';
import {P0_POLICY,p0PolicyHash} from '../../specs/bootcamp/p0-contract.mjs';
export function createPreparedNormalServer({config:c,tls}){
 const expected=new URL(c.origin),assets=c.webRoot&&existsSync(c.webRoot)?loadPublicAssets(c.webRoot):new Map();
 assets.set('/bootcamp-normal-client.mjs',{type:'text/javascript; charset=utf-8',body:readFileSync(new URL('../../src/bootcamp/normal-client.mjs',import.meta.url))});
 if(!assets.has('/'))assets.set('/',{type:'text/html; charset=utf-8',body:Buffer.from('<!doctype html><html lang="ko"><meta charset="utf-8"><title>CLEAR 실제 실행 준비</title><h1>실행 환경 준비 중</h1><p>아직 지갑 로그인·신청·원천 수집·체인 지급을 시작하지 않았습니다. 프론트 연결과 사용자 입력 확인 뒤 활성화합니다.</p></html>')});
 const publicConfig=Object.freeze({version:NORMAL_HOST_VERSION,origin:c.origin,attestorMode:c.attestorMode??'OFFICIAL',sourceMode:'REGISTERED_TEST_SOURCE',phase:'PREPARED_NOT_ACTIVATED',
  policyHash:p0PolicyHash(P0_POLICY),chainId:null,network:null,applicationId:null,sourceCollectionConfigured:false,reviewConsentHttpImplemented:false,
  executionReceiptHttpImplemented:false,sourceSignatureHttpImplemented:false,signerInstalled:false,actualSourceVerification:null,productionEnabled:false});
 const server=createServer({...tls,requestTimeout:10000,headersTimeout:10000,maxHeaderSize:8192},(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
  const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const valid=loopback&&req.socket.encrypted&&req.headers.host===expected.host&&(!req.headers.origin||req.headers.origin===expected.origin)
   &&(!req.headers['sec-fetch-site']||['same-origin','none'].includes(req.headers['sec-fetch-site']));
  const json=(status,v)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(v));};
  if(!valid)return json(403,{error:'ORIGIN'});
  if(req.method==='GET'&&req.url==='/__dev/config')return json(200,publicConfig);
  if(/^\/(auth|bootcamp)(\/|$)/.test(req.url))return json(503,{error:'NORMAL_HOST_NOT_ACTIVATED'});
  const path=req.url.split('?')[0],a=assets.get(path)??(/^\/ui\/[a-zA-Z0-9/_-]*$/.test(path)?assets.get('/'):undefined);
  if(['GET','HEAD'].includes(req.method)&&a){res.writeHead(200,{'Content-Type':a.type});res.end(req.method==='HEAD'?undefined:a.body);return;}
  json(404,{error:'BC_NOT_FOUND'});
 });server.maxConnections=32;return {server,config:publicConfig};
}
export function listenNormalServer(server,origin){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(new URL(origin).port),'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});}
