import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer as tcpServer} from 'node:net';
import {request} from 'node:https';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Wallet} from 'ethers';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createApplicationService} from '../../src/application/service.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {createBootcampFrontendServer} from '../../tools/bootcamp/frontend-server.mjs';

async function fixture(t){
 const directory=realpathSync(mkdtempSync(join(tmpdir(),'clear-native-frontend-')));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const socket=tcpServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const origin='https://127.0.0.1:'+port,chainId=31337,alice=Wallet.createRandom(),bob=Wallet.createRandom();
 const authentication=createApplicationService({directory:join(directory,'auth'),origin,chainId,instanceId:'0x'+'a'.repeat(64),participants:[alice.address,bob.address],operators:[Wallet.createRandom().address]});
 const store=createBootcampStore({directory:join(directory,'store'),authentication,instanceId:'native-frontend-fixture',mode:'SYNTHETIC_FIXTURE',demoStartedAt:Math.floor(Date.now()/1000)});
 t.after(()=>{store.close();authentication.close();});
 const login=async wallet=>{const q=authentication.challenge({wallet:wallet.address,chainId}),r=authentication.login({nonce:q.nonce,signature:await wallet.signMessage(q.message)},q.browserToken);return {token:r.token,wallet:r.wallet,csrf:r.csrf,chainId};};
 const context=await login(alice),other=await login(bob),caDirectory=join(directory,'tls');mkdirSync(caDirectory);const tls=loadTls(caDirectory,createCertificates(caDirectory));
 const webRoot=join(directory,'web');mkdirSync(webRoot);mkdirSync(join(webRoot,'assets'));
 const files={'index.html':'<!doctype html>legacy landing','clear-wallet-app.html':'<meta name="clear-wallet-app" content="syntheticfixture123">\n',
  'clear-moodle-native.html':'<meta name="clear-moodle-native" content="1">\n','assets/onboarding.js':'// legacy','assets/operator.js':'// legacy',
  'assets/_index.browser-fixture.js':'export const syntheticDependency = true;','assets/moodle-native.js':'export const synthetic = true;','assets/moodle-oauth-return.js':'export const syntheticReturn = true;'};
 for(const [path,body] of Object.entries(files))writeFileSync(join(webRoot,path),body);
 const inventory={version:1,assets:['moodle-native','moodle-oauth-return','_index.browser-fixture'].map(name=>({path:'/assets/'+name+'.js',sha256:createHash('sha256').update(files['assets/'+name+'.js']).digest('hex')}))};
 writeFileSync(join(webRoot,'clear-moodle-native-assets.html'),JSON.stringify(inventory));
 const calls=[],moodleNative={courseId:2,routes:[
  ...['index','configure'].map(name=>({owner:'C',path:'/local/clearbridge/'+name+'.php',methods:['GET'],query:['id'],walletDocument:true})),
  {owner:'C',path:'/local/clearbridge/login_action.php',methods:['POST'],query:[]},
 ],handleC(req,res,{nonce}){calls.push(req.headers);res.writeHead(200,{'Content-Type':'text/html'});res.end('<meta name="sc-nonce" content="'+nonce+'">');}};
 const options={authentication,store,tls,sourceMode:'REGISTERED_TEST_SOURCE',chainId,webRoot,
  normalUi:{walletRuntime:{instanceId:'0x'+'a'.repeat(64)}},network:{chainId,rpcUrl:'http://127.0.0.1:19998'},
  moodleLogin:{native:true,matches:()=>false,complete:async()=>({status:'NOT_REQUESTED'})},moodleNative};
 const raw=(path,{method='GET',headers={},body,actor=context}={})=>new Promise((resolve,reject)=>{
  const req=request(origin+path,{ca:readFileSync(join(caDirectory,'ca.pem')),method,headers:{host:new URL(origin).host,origin,'sec-fetch-site':'same-origin',
   cookie:'MoodleSession=synthetic; __Host-clear-session='+actor.token,'x-wallet':actor.wallet,'x-chain-id':String(chainId),'x-csrf-token':actor.csrf,
   ...(body?{'content-type':'application/json'}:{}),...headers}},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:data}));});
  req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
 });
 return {directory,webRoot,options,inventory,store,context,other,raw,calls,async start(){const mounted=createBootcampFrontendServer(options);await mounted.ready;
  await new Promise(r=>mounted.server.listen(port,'127.0.0.1',r));t.after(async()=>{mounted.server.closeAllConnections();await new Promise(r=>mounted.server.close(r));await mounted.drain();});return mounted;}};
}

test('standard frontend combines Moodle document, immutable assets, fixed return and authenticated operation GET',async t=>{
 const x=await fixture(t),mounted=await x.start();assert.equal(mounted.server.listeners('request').length,1);
 assert.equal(mounted.nativeWalletConfig.surface,'MOODLE_NATIVE');assert.equal(mounted.nativeWalletConfig.redirectUri,x.options.store.origin+'/local/clearbridge/wallet-return');
 const a=await x.raw('/local/clearbridge/index.php?id=2'),b=await x.raw('/local/clearbridge/index.php?id=2');
 assert.equal(a.status,200);assert.notEqual(a.body,b.body);assert.equal(x.calls[0].cookie,'MoodleSession=synthetic');assert.equal(x.calls[0]['x-csrf-token'],undefined);
 assert(a.headers['content-security-policy'].includes(/content="([^"]+)"/.exec(a.body)[1]));
 const asset=await x.raw('/clear-assets/moodle-native.js');assert.equal(asset.status,200);assert.equal(asset.body,'export const synthetic = true;');
 assert.equal((await x.raw('/clear-assets/_index.browser-fixture.js')).status,200);
 writeFileSync(join(x.webRoot,'assets/moodle-native.js'),'CHANGED');assert.equal((await x.raw('/clear-assets/moodle-native.js')).body,asset.body);
 const returned=await x.raw('/local/clearbridge/wallet-return?privy_oauth_code=synthetic-code&privy_oauth_state=synthetic-state&privy_oauth_provider=google');
 assert.equal(returned.status,200);assert(!returned.body.includes('synthetic-code'));assert.equal(returned.headers['referrer-policy'],'no-referrer');
 const created=x.store.createApplication(x.context,{},'synthetic-create'),base='/bootcamp/v1/applications/'+created.record.applicationId+'/operations/'+created.record.operationId;
 assert.equal((await x.raw(base)).status,200);assert.equal((await x.raw(base,{actor:x.other})).status,403);
 assert.equal((await x.raw(base,{headers:{cookie:''}})).status,401);
 assert.equal((await x.raw(base,{headers:{origin:'https://foreign.invalid'}})).status,403);
 for(const path of ['/onboarding','/operator','/','/index.html','/assets/onboarding.js','/native-assets/moodle-native.js','/__embedded/config','/moodle/connect',
  '/local/clearbridge/login_authority.php','/clear-moodle-native-assets.html','/bootcamp/v4/applications/app-one/resume',base+'/extra',base+'?x=1'])
  assert.equal((await x.raw(path)).status,403,path);
 assert.equal((await x.raw('/clear-assets/onboarding.js')).status,404);
 assert.equal((await x.raw('/clear-assets/missing.js')).status,404);
 assert.equal((await x.raw(base,{method:'POST',body:{}})).status,403);
});

test('native startup rejects incomplete config, wrong mode, marker, assets and inventory before binding listeners',async t=>{
 const x=await fixture(t),options=x.options,create=patch=>createBootcampFrontendServer({...options,...patch});
 for(const patch of [{moodleNative:null},{moodleLogin:{...options.moodleLogin,native:false}},
  {moodleNative:{...options.moodleNative,courseId:0}},{moodleNative:{...options.moodleNative,extra:true}},
  {moodleNative:{...options.moodleNative,routes:[]}},{moodleNative:{...options.moodleNative,routes:[...options.moodleNative.routes,{owner:'A',path:'/arbitrary',methods:['GET'],query:[]}]}}])
  assert.throws(()=>create(patch),/MOODLE_NATIVE_FRONTEND_CONFIG/);
 const path=join(x.webRoot,'clear-moodle-native-assets.html');
 for(const inventory of [{...x.inventory,assets:x.inventory.assets.slice(0,1)},
  {...x.inventory,assets:x.inventory.assets.map((v,i)=>i? v:{...v,sha256:'0'.repeat(64)})},
  {...x.inventory,assets:[...x.inventory.assets,x.inventory.assets[0]]}]){
  writeFileSync(path,JSON.stringify(inventory));assert.throws(()=>create({}),/MOODLE_NATIVE_FRONTEND_CONFIG/);
 }
 writeFileSync(path,JSON.stringify(x.inventory));writeFileSync(join(x.webRoot,'clear-moodle-native.html'),'wrong');
 assert.throws(()=>create({}),/MOODLE_NATIVE_FRONTEND_CONFIG/);
});
