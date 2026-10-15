import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:https';
import { check, privateDirectory, writeJson, readJson, lock } from '../dev/files.mjs';
import { createCertificates, loadTls } from '../dev/tls.mjs';
import { loadPublicAssets } from '../dev/public-assets.mjs';
import { createApplicationService } from '../application/service.mjs';
import { createApplicationHandler } from '../application/http.mjs';
import { createWorkflowHttpService } from './http-service.mjs';
import { sourceHttpExample } from '../../specs/m3/source-http-example.mjs';
import { studentHttpExamplePolicies } from '../../specs/m3/student-http-example.mjs';
import { createStudentWorkflowService, STUDENT_HTTP_VERSION } from './student-http-service.mjs';
const marker='CLEAR_SYNTHETIC_SOURCE_HTTP_1';
function validate(c){
 check(c.marker===marker&&c.captureMode==='MOCK','MVP_DEV_CONFIG');
 const u=new URL(c.origin);check(u.protocol==='https:'&&u.hostname==='127.0.0.1'&&u.origin===c.origin&&Number(u.port)>=1024,'MVP_DEV_CONFIG');
 check(Number.isSafeInteger(c.chainId)&&c.chainId>0&&Number.isSafeInteger(c.fixtureEpoch)&&c.fixtureEpoch>0,'MVP_DEV_CONFIG');
 return c;
}
export function initializeSourceDevelopment({directory,port=9443,chainId=431701,operator,participant}){
 check(Number.isInteger(port)&&port>=1024&&port<=65535,'MVP_DEV_PORT');
 mkdirSync(directory,{mode:0o700});const root=privateDirectory(directory);
 const fingerprint=createCertificates(root),config=validate({marker,captureMode:'MOCK',origin:'https://127.0.0.1:'+port,chainId,operator,participant,
  instanceId:'0x'+randomBytes(32).toString('hex'),fixtureEpoch:Math.floor(Date.now()/1000),fingerprint});
 // Validate roles/addresses without creating or opening any user database.
 const authDirectory=join(root,'authentication');mkdirSync(authDirectory,{mode:0o700});
 const service=createApplicationService({directory:authDirectory,origin:config.origin,chainId,instanceId:config.instanceId,participants:[participant],operators:[operator]});service.close();
 writeJson(join(root,'source-http.json'),config);return {origin:config.origin,chainId,captureMode:'MOCK',participant,operator};
}
export async function startSourceDevelopment({directory,webRoot,studentPolicies=studentHttpExamplePolicies()}){
 const root=privateDirectory(directory),config=validate(readJson(join(root,'source-http.json'))),release=lock(root);
 let authentication,workflow,studentWorkflow,server;const pending=new Set();
 const publicConfig={version:'clear-mvp-source-http.1',origin:config.origin,chainId:config.chainId,captureMode:'MOCK',operator:config.operator,participant:config.participant,
  dataMode:'SYNTHETIC',paymentAllowed:false,policyPublished:false,identityVerified:false,
  studentHttpVersion:STUDENT_HTTP_VERSION,studentApplicationHttpImplemented:true,studentSubmissionHttpImplemented:false};
 try{
  authentication=createApplicationService({directory:join(root,'authentication'),origin:config.origin,chainId:config.chainId,instanceId:config.instanceId,participants:[config.participant],operators:[config.operator]});
  workflow=createWorkflowHttpService({directory:join(root,'source-workflow'),authentication,instanceId:'mvp-'+config.instanceId.slice(2,18),...sourceHttpExample(config.fixtureEpoch)});
  studentWorkflow=createStudentWorkflowService({directory:join(root,'student-workflow'),authentication,instanceId:'mvp-'+config.instanceId.slice(2,18),policies:studentPolicies});
  const api=createApplicationHandler(authentication,{workflow,studentWorkflow}),assets=webRoot&&existsSync(webRoot)?loadPublicAssets(resolve(webRoot)):new Map();
  const expected=new URL(config.origin);
  const handler=async(req,res)=>{
   if(/^\/(auth|mvp|applications|policies|runtimes)(?:\/|\?|$)/.test(req.url))return api(req,res);
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Referrer-Policy','no-referrer');
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
   if(req.headers.host!==expected.host||(req.headers.origin&&req.headers.origin!==config.origin)||(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))) {res.writeHead(403,{'Content-Type':'application/json'});res.end('{"code":"ORIGIN"}');return;}
   if(req.method==='GET'&&req.url==='/__dev/config'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(publicConfig));return;}
   const path=req.url.split('?')[0],asset=assets.get(path)??(/^\/ui\/[a-zA-Z0-9/_-]*$/.test(path)?assets.get('/'):undefined);
   if(['GET','HEAD'].includes(req.method)&&asset){res.writeHead(200,{'Content-Type':asset.type});res.end(req.method==='HEAD'?undefined:asset.body);return;}
   res.writeHead(404,{'Content-Type':'application/json'});res.end('{"code":"NOT_FOUND"}');
  };
  server=createServer({...loadTls(root,config.fingerprint),requestTimeout:10000,headersTimeout:10000,maxHeaderSize:8192},(req,res)=>{
   const task=Promise.resolve(handler(req,res));pending.add(task);task.catch(()=>{if(!res.headersSent){res.writeHead(500,{'Content-Type':'application/json'});res.end('{"code":"INTERNAL_ERROR"}');}else res.destroy();}).finally(()=>pending.delete(task));
  });server.maxConnections=32;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(expected.port),'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
 }catch(error){studentWorkflow?.close();workflow?.close();authentication?.close();release();throw error;}
 let closing;
 return {config:publicConfig,close(){return closing??=(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await Promise.allSettled([...pending]);studentWorkflow.close();workflow.close();authentication.close();release();})();}};
}
