import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { startChrome } from './chrome.mjs';
import { requireValue } from './storage.mjs';

// Dependency injection is for trusted tests only, never a CLI/env/browser option.
export async function syntheticBrowserCheck(session,{headless=true,signal}={}, {launchChrome=startChrome}={}) {
  const canary=randomBytes(24).toString('hex');let browser,rootSeen=false,settleReceipt;
  const receipt=new Promise(resolve=>{settleReceipt=resolve;});
  const server=http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/html; charset=utf-8');
    if(req.method==='GET'&&req.url==='/'){
      rootSeen=true;
      res.setHeader('Set-Cookie',`clear_synthetic=${canary}; HttpOnly; SameSite=Strict; Path=/`);
      res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>CLEAR 저장 경계 시험</title><body><h1>합성 자료로 저장 경계를 확인하고 있습니다.</h1><p>실제 YBM 로그인과 증명 생성은 진행하지 않습니다.</p><script>fetch("/check").then(r=>{if(!r.ok)throw new Error();document.body.insertAdjacentHTML("beforeend","<p>확인되었습니다. 창이 자동으로 닫힙니다.</p>")}).catch(()=>document.body.insertAdjacentHTML("beforeend","<p>저장 경계를 확인하지 못했습니다.</p>"))</script></body></html>');
    }else if(req.method==='GET'&&req.url==='/check'){
      const match=rootSeen&&req.headers.cookie===`clear_synthetic=${canary}`;
      // The first receipt decides the check. A later retry cannot erase failure.
      settleReceipt(match?'MATCH':'SYNTHETIC_COOKIE_MISMATCH');res.statusCode=match?200:403;res.end(match?'OK':'FAIL');
    }else{res.statusCode=404;res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  let timer,onAbort;
  try {
    signal?.throwIfAborted();
    browser=await launchChrome(session,{headless,signal});
    // Chrome owns the startup tab's initial navigation. Create our own target
    // with its final URL in one operation, so that navigation cannot overwrite
    // the check. A successful CDP command alone is never a cookie receipt.
    const target=await browser.send('Target.createTarget',{url:`http://127.0.0.1:${server.address().port}/`});
    requireValue(typeof target?.targetId==='string'&&target.targetId.length>0,'SYNTHETIC_TARGET_MISSING');
    const interrupted=new Promise(resolve=>{
      onAbort=()=>resolve('SYNTHETIC_CHECK_CANCELLED');
      signal?.addEventListener('abort',onAbort,{once:true});
      if(signal?.aborted)onAbort();
      timer=setTimeout(()=>resolve(rootSeen?'SYNTHETIC_RECEIPT_MISSING':'SYNTHETIC_PAGE_NOT_REQUESTED'),10000);
    });
    const outcome=await Promise.race([receipt,interrupted,browser.closed.then(()=> 'SYNTHETIC_BROWSER_CLOSED')]);
    signal?.throwIfAborted();
    requireValue(outcome==='MATCH',outcome);
    return {scope:'SYNTHETIC_LOCALHOST_ONLY',httpOnlyCookieRoundTrip:true,cdpListeningPort:false,liveProof:false};
  }finally{
    clearTimeout(timer);if(onAbort)signal?.removeEventListener('abort',onAbort);
    try { if(browser)await browser.close(); }
    finally { server.closeAllConnections();await new Promise(r=>server.close(r)); }
  }
}
