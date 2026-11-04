import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:https';
import {mkdtempSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createMoodleFrontDoor,createMoodleFrontDoorPolicy} from '../../tools/bootcamp/moodle-front-door.mjs';
import {createNativeMoodleUpstream,nativeMoodleRoutes} from '../../tools/bootcamp/moodle-native-upstream.mjs';

async function fixture(t,options={}){
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'clear-moodle-upstream-')));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const tls=loadTls(dir,createCertificates(dir)),ca=readFileSync(join(dir,'ca.pem'));
 let behavior=(req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('Moodle');},handler;
 const seen=[],upstream=createServer(tls,(req,res)=>{seen.push({path:req.url,headers:req.headers});behavior(req,res);});
 const publicServer=createServer(tls,(req,res)=>handler(req,res));
 for(const s of [upstream,publicServer]){await new Promise(r=>s.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>{s.close(r);s.closeAllConnections();}));}
 const origin='https://127.0.0.1:'+publicServer.address().port,controller=new AbortController();
 const proxy=createNativeMoodleUpstream({origin,connectionPort:upstream.address().port,ca,signal:controller.signal,...options});
 t.after(()=>proxy.close());
 handler=createMoodleFrontDoor({policy:createMoodleFrontDoorPolicy({origin,routes:nativeMoodleRoutes}),
  handleA:()=>assert.fail('No A route'),handleC:proxy.handle,rpcUrl:'http://127.0.0.1:19999'});
 const send=(path='/login/index.php',body,headers={})=>new Promise((resolve,reject)=>{
  const req=request(origin+path,{ca,method:body===undefined?'GET':'POST',headers:{origin,'sec-fetch-site':'same-origin',
   cookie:'MoodleSession=synthetic-moodle; __Host-clear-session=synthetic-clear',...headers}},res=>{
   let raw='';res.on('data',x=>raw+=x);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:raw}));res.on('error',reject);
  });req.on('error',reject);req.end(body);
 });
 return {origin,seen,send,proxy,controller,setBehavior:f=>{behavior=f;}};
}
test('fixed TLS upstream keeps Moodle identity, nonce and response protections',async t=>{
 const x=await fixture(t);
 x.setBehavior((req,res)=>{res.writeHead(200,{'content-type':'text/html',
  'set-cookie':'MoodleSession=fresh; Path=/; Secure; HttpOnly; SameSite=Lax'});res.end(req.headers['x-clear-document-nonce']);});
 const r=await x.send('/local/clearbridge/index.php?id=2');
 assert.equal(r.status,200);assert.match(r.body,/^[A-Za-z0-9+/]{32}$/);
 assert(r.headers['content-security-policy'].includes("'nonce-"+r.body+"'"));
 assert.equal(x.seen[0].headers.host,new URL(x.origin).host);
 assert.equal(x.seen[0].headers.cookie,'MoodleSession=synthetic-moodle');
 assert.equal(r.headers['cache-control'],'no-store');
 for(const path of ['/local/clearbridge/authority.php','/local/clearbridge/login_authority.php','/onboarding','/operator'])
  assert.equal((await x.send(path)).status,403);
 assert.equal(x.seen.length,1);
});
test('upstream cannot redirect outside Moodle or set CLEAR cookies',async t=>{
 const x=await fixture(t);
 x.setBehavior((req,res)=>{res.writeHead(302,{location:'https://external.invalid/'});res.end();});
 assert.equal((await x.send()).status,403);assert.equal(x.seen.length,1);
 x.setBehavior((req,res)=>{res.writeHead(302,{location:x.origin+'/course/view.php?id=2'});res.end();});
 const r=await x.send();assert.equal(r.status,302);assert.equal(r.headers.location,'/course/view.php?id=2');assert.equal(x.seen.length,2);
 x.setBehavior((req,res)=>{res.writeHead(200,{'set-cookie':'__Host-clear-session=bad; Path=/; Secure; HttpOnly; SameSite=Strict'});res.end();});
 assert.equal((await x.send()).status,403);
});
test('request and response lengths, deadline and owner cancellation fail closed',async t=>{
 const x=await fixture(t,{requestLimit:32,responseLimit:32,timeoutMs:100});
 assert.equal((await x.send('/login/index.php','x'.repeat(33),{'content-length':'33'})).status,403);assert.equal(x.seen.length,0);
 x.setBehavior((req,res)=>{res.writeHead(200,{'content-length':'33'});res.end('x'.repeat(33));});
 assert.equal((await x.send()).status,403);
 x.setBehavior(()=>{});assert.equal((await x.send()).status,403);
 const pending=x.send();setTimeout(()=>x.controller.abort(),20);assert.equal((await pending).status,403);
 const count=x.seen.length;assert.equal((await x.send()).status,403);assert.equal(x.seen.length,count);
});
test('untrusted upstream certificate is refused without forwarding a request',async t=>{
 const x=await fixture(t,{ca:Buffer.from('not a trusted certificate')});
 assert.equal((await x.send()).status,403);assert.equal(x.seen.length,0);
});
test('native inventory allows no asset POST, private authority, OAuth or legacy documents',()=>{
 const origin='https://127.0.0.1:9477',p=createMoodleFrontDoorPolicy({origin,routes:nativeMoodleRoutes});
 const req=(url,method='GET')=>({url,method,socket:{encrypted:true},headers:{host:'127.0.0.1:9477',origin,'sec-fetch-site':'same-origin'}});
 for(const path of ['/theme/styles.php/boost/1/all','/lib/requirejs.php/1/core/first.js']){
  assert.equal(p.classify(req(path)).owner,'C');assert.throws(()=>p.classify(req(path,'POST')));
 }
 assert.throws(()=>p.classify(req('/login/index.php?privy_oauth_code=synthetic')));
});
test('installed Moodle cached strings, session-aware AJAX and navigation pass their own query inventory',async t=>{
 const x=await fixture(t),args=encodeURIComponent(JSON.stringify([{index:0,methodname:'core_get_string',
  args:{stringid:'confirm',component:'moodle',lang:'ko'}}]));
 const paths=[
  '/lib/ajax/service-nologin.php?info=core_get_string&cachekey=1&args='+args+'&nosessionupdate=true',
  '/lib/ajax/getnavbranch.php?id=courses&type=0&instance=2',
 ];
 for(const path of paths)assert.equal((await x.send(path)).status,200);
 assert.equal((await x.send('/lib/ajax/service.php?sesskey=synthetic&info=core_get_string&nosessionupdate=true','[]')).status,200);
 assert.equal(x.seen.length,3);assert.equal(x.seen[0].path,paths[0]);
 for(const path of [paths[0]+'&args=duplicate',paths[1]+'&type=1',paths[0]+'&unexpected=1',
  '/lib/ajax/service.php?args='+args,'/lib/ajax/getnavbranch.php?sesskey=synthetic',
  '/lib/ajax/service-nologin.php?sesskey=synthetic'])assert.equal((await x.send(path)).status,403);
 assert.equal(x.seen.length,3);
});
