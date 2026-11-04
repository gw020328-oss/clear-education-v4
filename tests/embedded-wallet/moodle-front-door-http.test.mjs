import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:https';
import {mkdtempSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createMoodleFrontDoor,createMoodleFrontDoorPolicy} from '../../tools/bootcamp/moodle-front-door.mjs';
import {createMoodleOAuthReturn} from '../../tools/bootcamp/moodle-oauth-return.mjs';

test('TLS gateway emits fresh matching native nonces and confines callback/credentials to their handler', async t => {
  const directory=realpathSync(mkdtempSync(join(tmpdir(),'clear-native-gateway-test-')));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const tls=loadTls(directory,createCertificates(directory)),ca=readFileSync(join(directory,'ca.pem'));
  let handler;
  const server=createServer(tls,(req,res)=>handler(req,res));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  const origin='https://127.0.0.1:'+server.address().port;
  const routes=[{owner:'C',path:'/local/clearbridge/index.php',methods:['GET'],query:['id'],walletDocument:true},
    {owner:'A',path:'/auth/nonce',methods:['POST'],query:[]},
    {owner:'A',path:'/local/clearbridge/wallet-return',methods:['GET'],query:['privy_oauth_code','privy_oauth_state','privy_oauth_provider']}];
  const config={origin,appId:'syntheticapp00001',redirectUri:origin+'/local/clearbridge/wallet-return',surface:'MOODLE_NATIVE',
    phase:'ACTIVE_LOCAL_TEST',chainId:12345,rpcUrl:'http://127.0.0.1:9479',instanceId:'0x'+'11'.repeat(32)};
  const callback=createMoodleOAuthReturn({config,courseId:2}),calls=[];
  let badCookie=false;
  handler=createMoodleFrontDoor({policy:createMoodleFrontDoorPolicy({origin,routes}),rpcUrl:config.rpcUrl,
    handleA(req,res){
      calls.push({owner:'A',headers:req.headers,rawHeaders:req.rawHeaders});
      if(callback(req,res))return;
      res.setHeader('Set-Cookie','__Host-clear-preauth=synthetic; Path=/; HttpOnly; Secure; SameSite=Strict');
      res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');
    },
    handleC(req,res,{nonce}){
      calls.push({owner:'C',headers:req.headers,rawHeaders:req.rawHeaders});
      res.setHeader('Set-Cookie',(badCookie?'__Host-clear-session':'MoodleSession')+'=synthetic; Path=/; HttpOnly; Secure; SameSite=Strict');
      res.writeHead(200,{'Content-Type':'text/html'});res.end('<meta name="sc-nonce" content="'+nonce+'">');
    }});
  const send=(path,method='GET')=>new Promise((resolve,reject)=>{
    const outgoing=request(origin+path,{ca,method,headers:{Origin:origin,'Sec-Fetch-Site':'same-origin',
      'X-Clear-Document-Nonce':'caller-controlled','X-Csrf-Token':'synthetic-csrf',
      Cookie:'MoodleSession=synthetic-moodle; __Host-clear-session=synthetic-clear'}},res=>{
      let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });outgoing.on('error',reject);outgoing.end();
  });
  const first=await send('/local/clearbridge/index.php?id=2'),second=await send('/local/clearbridge/index.php?id=2');
  assert.equal(first.status,200);assert.equal(second.status,200);
  const nonce= /content="([^"]+)"/.exec(first.body)[1];
  assert.match(nonce,/^[A-Za-z0-9+/]{32}$/);assert.notEqual(first.body,second.body);
  assert(first.headers['content-security-policy'].includes("'nonce-"+nonce+"'"));
  assert.equal(calls[0].headers.cookie,'MoodleSession=synthetic-moodle');
  assert(!calls[0].rawHeaders.includes('synthetic-csrf'));assert(!calls[0].rawHeaders.includes('caller-controlled'));
  const auth=await send('/auth/nonce','POST');assert.equal(auth.status,200);
  assert.equal(calls.at(-1).headers.cookie,'__Host-clear-session=synthetic-clear');
  const q='?privy_oauth_code=synthetic-code&privy_oauth_state=synthetic-state&privy_oauth_provider=google';
  const returned=await send('/local/clearbridge/wallet-return'+q);
  assert.equal(returned.status,200);assert.equal(calls.at(-1).owner,'A');
  assert(!returned.body.includes('synthetic-code'));assert(!returned.body.includes('synthetic-state'));
  assert(!returned.body.includes('synthetic-csrf'));assert.equal(returned.headers['referrer-policy'],'no-referrer');
  assert.equal(returned.headers['cache-control'],'no-store');
  assert.equal((await send('/local/clearbridge/index.php'+q)).status,403);
  assert.equal((await send('/local/clearbridge/wallet-return'+q+'&returnURL=https://example.test')).status,403);
  badCookie=true;
  const denied=await send('/local/clearbridge/index.php?id=2');
  assert.equal(denied.status,403);assert.equal(denied.headers['set-cookie'],undefined);
  assert.equal(denied.body,'{"error":"MOODLE_FRONT_DOOR_UNAVAILABLE"}');
});
