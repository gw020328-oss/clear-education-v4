import http from 'node:http';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareRoot,createSession,removeSession} from '../../../src/mac-collector/storage.mjs';
import {startChrome,stopRecordedBrowser} from '../../../src/mac-collector/chrome.mjs';
// Manual bounded diagnosis, not a retry-until-green test or CI rerun.
// Only /check receipts count: favicon requests cannot settle this observation.
const root=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'clear-cookie-diagnosis-'));await fs.chmod(root,0o700);await prepareRoot(root,{synthetic:true});const session=await createSession(root);
let browser;
try {
 browser=await startChrome(session,{headless:true});const send=browser.send;
 console.log(JSON.stringify({browser:(await send('Browser.getVersion')).product,scope:'NEW_SYNTHETIC_PROFILE_LOOPBACK_ONLY'}));
 for(const mode of ['disable-immediate','keep-until-response']){
  const outcomes=[];
  for(let n=0;n<8;n++){
   let receipt;const received=new Promise(r=>receipt=r);
   const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Set-Cookie','clear_synthetic=SYNTHETIC_ORIGINAL; HttpOnly; SameSite=Strict; Path=/');res.end('<script>fetch("/check")</script>');}else if(req.url==='/check'){const altered=req.headers.cookie==='clear_synthetic=SYNTHETIC_WRONG';receipt(altered?'ALTERED':req.headers.cookie==='clear_synthetic=SYNTHETIC_ORIGINAL'?'ORIGINAL':'OTHER');res.statusCode=altered?403:200;res.end();}else{res.statusCode=404;res.end();}});
   await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
   const created=await send('Target.createTarget',{url:'about:blank'}),attached=await send('Target.attachToTarget',{targetId:created.targetId,flatten:true});
   let done,fail;const intercepted=new Promise((r,j)=>{done=r;fail=j;});
   const off=browser.on('Fetch.requestPaused',(e,s)=>{if(s!==attached.sessionId)return;void(async()=>{
    const headers=Object.entries(e.request.headers).filter(([k])=>k.toLowerCase()!=='cookie').map(([name,value])=>({name,value}));headers.push({name:'Cookie',value:'clear_synthetic=SYNTHETIC_WRONG'});
    await send('Fetch.continueRequest',{requestId:e.requestId,headers},s);
    if(mode==='disable-immediate')await send('Fetch.disable',{},s);
   })().then(done,fail);});
   try{await send('Fetch.enable',{patterns:[{urlPattern:url+'check',requestStage:'Request'}]},attached.sessionId);await send('Page.navigate',{url},attached.sessionId);await intercepted;outcomes.push(await Promise.race([received,new Promise((_,j)=>{const t=setTimeout(()=>j(new Error('RECEIPT_TIMEOUT')),5000);t.unref();})]));}
   finally{off();await send('Target.closeTarget',{targetId:created.targetId});server.closeAllConnections();await new Promise(r=>server.close(r));}
  }
  console.log(JSON.stringify({mode,attempts:outcomes.length,altered:outcomes.filter(x=>x==='ALTERED').length,original:outcomes.filter(x=>x==='ORIGINAL').length,other:outcomes.filter(x=>x==='OTHER').length}));
 }
}finally{await browser?.close();await stopRecordedBrowser(session.path);await removeSession(root,session.path);await fs.rm(root,{recursive:true,force:true});}
