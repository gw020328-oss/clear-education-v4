import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { startChrome } from './chrome.mjs';
import { requireValue } from './storage.mjs';
export async function syntheticBrowserCheck(session,{headless=true}={}) {
  const canary=randomBytes(24).toString('hex');let received=false;let browser;
  const server=http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/html; charset=utf-8');
    if(req.url==='/'){
      res.setHeader('Set-Cookie',`clear_synthetic=${canary}; HttpOnly; SameSite=Strict; Path=/`);
      res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>CLEAR 저장 경계 시험</title><body><h1>합성 자료로 저장 경계를 확인하고 있습니다.</h1><p>실제 YBM 로그인과 증명 생성은 진행하지 않습니다.</p><script>fetch("/check").then(()=>document.body.insertAdjacentHTML("beforeend","<p>확인되었습니다. 창이 자동으로 닫힙니다.</p>"))</script></body></html>');
    }else if(req.url==='/check'){
      received=req.headers.cookie===`clear_synthetic=${canary}`;res.end(received?'OK':'FAIL');
    }else{res.statusCode=404;res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    browser=await startChrome(session,{headless});
    const targets=await browser.send('Target.getTargets');
    const target=targets.targetInfos.find(t=>t.type==='page');
    const {sessionId}=await browser.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    await browser.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`},sessionId);
    for(let i=0;i<200&&!received;i++)await new Promise(r=>setTimeout(r,50));
    requireValue(received,'SYNTHETIC_COOKIE_CHECK_FAILED');
    return {scope:'SYNTHETIC_LOCALHOST_ONLY',httpOnlyCookieRoundTrip:true,cdpListeningPort:false,liveProof:false};
  }finally{
    if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));
  }
}
