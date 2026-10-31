import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer as netServer} from 'node:net';
import {createServer as httpServer,request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Wallet,id} from 'ethers';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createApplicationService} from '../../src/application/service.mjs';
import {createBootcampFrontendServer} from '../../tools/bootcamp/frontend-server.mjs';
async function port(){for(let n=0;n<100;n++){const p=20000+Math.floor(Math.random()*10000),a=netServer(),b=netServer();try{await new Promise((r,j)=>{a.once('error',j);a.listen(p,'127.0.0.1',r);});await new Promise((r,j)=>{b.once('error',j);b.listen(p+2,'127.0.0.1',r);});return p;}catch{}finally{await new Promise(r=>a.close(r));await new Promise(r=>b.close(r));}}throw Error('TEST_PORT_UNAVAILABLE');}
function request(url,{ca,headers={},method='GET',body}={}){return new Promise((resolve,reject)=>{const q=(url.startsWith('https:')?httpsRequest:httpRequest)(url,{ca,headers,method,servername:'localhost'},r=>{let body='';r.on('data',x=>body+=x);r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,body}));});q.on('error',reject);q.end(body);});}
test('opt-in product HTTPS preserves auth, isolates OAuth navigation and exposes only pinned read RPC',async t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'clear-wallet-product-'))),web=join(dir,'web');mkdirSync(web);mkdirSync(join(web,'assets'));
 writeFileSync(join(web,'index.html'),'<h1>fixture</h1>');writeFileSync(join(web,'clear-wallet-app.html'),'<meta name="clear-wallet-app" content="synthetic00001">\n');
 for(const f of ['onboarding.js','operator.js'])writeFileSync(join(web,'assets',f),'// fixture');
 const p=await port(),origin='https://127.0.0.1:'+p,chainId=1901234567,participant=Wallet.createRandom(),operator=Wallet.createRandom();
 const upstream=httpServer(async(req,res)=>{let input='';for await(const x of req)input+=x;const q=JSON.parse(input);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result:'0x'+chainId.toString(16)}));});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const auth=createApplicationService({directory:join(dir,'auth'),origin,chainId,instanceId:id('product-http'),participants:[participant.address],operators:[operator.address]});
 const fingerprint=createCertificates(dir),host=createBootcampFrontendServer({authentication:auth,store:{origin},tls:loadTls(dir,fingerprint),sourceMode:'REGISTERED_TEST_SOURCE',chainId,webRoot:web,
  normalUi:{walletRuntime:{instanceId:id('product-http')}},network:{chainId,rpcUrl:'http://127.0.0.1:'+upstream.address().port}});
 t.after(async()=>{host.server.closeAllConnections();await new Promise(r=>host.server.close(r));await host.drain();auth.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));rmSync(dir,{recursive:true,force:true});});
 await host.ready;await new Promise(r=>host.server.listen(p,'127.0.0.1',r));const ca=readFileSync(join(dir,'ca.pem'));
 const get=(path,options={})=>request(origin+path,{ca,...options});
 const page=await get('/onboarding?privy_oauth_code=fixture',{headers:{'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document'}});
 assert.equal(page.status,200);assert.match(page.body,/assets\/onboarding.js/);assert.match(page.headers['content-security-policy'],/auth.privy.io/);
 assert.equal((await get('/__embedded/config',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
 const c=JSON.parse((await get('/__embedded/config')).body);assert.equal(c.chainId,chainId);assert.equal(c.instanceId,id('product-http'));assert.equal(c.rpcUrl,'http://127.0.0.1:'+(p+2));
 assert.equal(JSON.parse((await get('/__dev/config')).body).network.rpcUrls[0],c.rpcUrl);
 const rpc=(method,o=origin)=>request(c.rpcUrl,{method:'POST',headers:{origin:o,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:[]})});
 assert.equal((await rpc('eth_chainId')).status,200);assert.equal((await rpc('eth_chainId')).headers['access-control-allow-origin'],origin);
 for(const m of ['eth_sendTransaction','eth_sendRawTransaction','personal_sign','eth_sign','eth_signTypedData_v4','evm_mine','admin_nodeInfo'])assert.equal((await rpc(m)).status,400,m);
 assert.equal((await rpc('eth_chainId','https://evil.invalid')).status,403);
 assert.equal((await rpc('eth_chainId','chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn')).status,200);
 const nonce=await get('/auth/nonce',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({wallet:operator.address,chainId})});
 assert.equal(nonce.status,200);const q=JSON.parse(nonce.body);assert.match(q.message,/Request ID:/);
 const verified=await get('/auth/verify',{method:'POST',headers:{origin,'content-type':'application/json',cookie:nonce.headers['set-cookie'].map(v=>v.split(';')[0]).join('; ')},body:JSON.stringify({nonce:q.nonce,signature:await operator.signMessage(q.message)})});
 assert.equal(verified.status,200);assert.equal(JSON.parse(verified.body).role,'operator');
 assert.equal((await get('/rpc',{method:'POST',body:'{}'})).status,404);
});
