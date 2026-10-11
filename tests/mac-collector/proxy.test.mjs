import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareRoot, createSession, removeSession} from '../../src/mac-collector/storage.mjs';
import {startChrome, stopRecordedBrowser} from '../../src/mac-collector/chrome.mjs';

test('real Chrome routes HTTPS through the supplied loopback proxy and fails without a direct fallback',{skip:process.platform!=='darwin',timeout:30000},async t=>{
  const root=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'clear-proxy-'));await fs.chmod(root,0o700);await prepareRoot(root,{synthetic:true});
  const session=await createSession(root);let browser;const seen=[];
  const sockets=new Set();const server=http.createServer((_req,res)=>{res.writeHead(403);res.end();});
  server.on('connection',socket=>{sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>sockets.delete(socket));});
  server.on('connect',(req,socket)=>{seen.push(req.url);socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{try{await browser?.close();await stopRecordedBrowser(session.path);await removeSession(root,session.path);}finally{for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});}});
  browser=await startChrome(session,{synthetic:false,headless:true,proxyUrl:`http://127.0.0.1:${server.address().port}`});
  const {targetInfos}=await browser.send('Target.getTargets');const {sessionId}=await browser.send('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true});
  const result=await browser.send('Page.navigate',{url:'https://synthetic.invalid/'},sessionId);
  assert.ok(seen.includes('synthetic.invalid:443'));assert.match(result.errorText,/ERR_TUNNEL_CONNECTION_FAILED/);
  // Chrome's implicit loopback bypass must also be disabled in routed mode.
  const local=await browser.send('Page.navigate',{url:'https://127.0.0.1/'},sessionId);
  assert.ok(seen.includes('127.0.0.1:443'));assert.match(local.errorText,/ERR_TUNNEL_CONNECTION_FAILED/);
  await browser.close();await browser.closed;browser=null;
});

test('browser rejects non-loopback proxies and mixed synthetic routing before spawning',async()=>{
  for(const proxyUrl of ['https://127.0.0.1:1234','http://evil.example:1234','http://localhost:1234','http://127.0.0.1:1234/path','http://user:pass@127.0.0.1:1234'])await assert.rejects(startChrome({}, {synthetic:false,proxyUrl}));
  await assert.rejects(startChrome({}, {synthetic:true,proxyUrl:'http://127.0.0.1:1234'}));
});

test('real Chrome CDP events support response body reads and continuation without Network capture',{skip:process.platform!=='darwin',timeout:30000},async t=>{
  const root=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'clear-cdp-'));await fs.chmod(root,0o700);await prepareRoot(root,{synthetic:true});
  const session=await createSession(root);let browser,off;const body='<html><body>SYNTHETIC_RESPONSE_BODY</body></html>';
  const sockets=new Set(),server=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(body);});
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{off?.();try{await browser?.close();await stopRecordedBrowser(session.path);await removeSession(root,session.path);}finally{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}});
  browser=await startChrome(session,{headless:true});const {targetInfos}=await browser.send('Target.getTargets');const {sessionId}=await browser.send('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true});
  const url=`http://127.0.0.1:${server.address().port}/source`;
  let resolveRead,rejectRead;const read=new Promise((r,j)=>{resolveRead=r;rejectRead=j;});
  off=browser.on('Fetch.requestPaused',(event,s)=>{
    void (async()=>{assert.equal(s,sessionId);assert.equal(event.request.url,url);const result=await browser.send('Fetch.getResponseBody',{requestId:event.requestId},s);assert.equal(Buffer.from(result.body,result.base64Encoded?'base64':'utf8').toString(),body);await browser.send('Fetch.continueRequest',{requestId:event.requestId},s);resolveRead();})().catch(rejectRead);
  });
  await browser.send('Fetch.enable',{patterns:[{urlPattern:url,requestStage:'Response'}]},sessionId);
  await Promise.all([browser.send('Page.navigate',{url},sessionId),read]);off();off=null;await browser.send('Fetch.disable',{},sessionId);
});
