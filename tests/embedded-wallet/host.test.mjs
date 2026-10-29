import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpsRequest} from 'node:https';
import {request as httpRequest} from 'node:http';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createOnboardingServer} from '../../tools/embedded-wallet/server.mjs';
import {Wallet} from 'ethers';
import {createApplicationHandler} from '../../src/application/http.mjs';
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
function request(url,{ca,headers={},method='GET',body}={}){
 return new Promise((resolve,reject)=>{const r=(url.startsWith('https:')?httpsRequest:httpRequest)(url,{ca,headers,method,servername:'localhost'},response=>{
  let data='';response.on('data',b=>data+=b);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:data}));
 });r.on('error',reject);r.end(body);});
}
test('isolated HTTPS host: exact origin, OAuth navigation, read-only chain and product routes denied',async t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'clear-embedded-host-'))),build=join(dir,'build');mkdirSync(build);
 writeFileSync(join(build,'onboarding.js'),'// synthetic host transport fixture');writeFileSync(join(build,'style.css'),'body{}');
 const fingerprint=createCertificates(dir),httpsPort=await port(),rpcPort=await port(),origin=`https://127.0.0.1:${httpsPort}`;
 const host=await createOnboardingServer({origin,rpcPort,tls:loadTls(dir,fingerprint),buildDirectory:build});
 t.after(async()=>{await host.close();rmSync(dir,{recursive:true,force:true});});
 const ca=readFileSync(join(dir,'ca.pem')),get=(path,opts={})=>request(origin+path,{ca,...opts});
 const page=await get('/onboarding');assert.equal(page.status,200);assert.match(page.body,/sc-nonce/);
 assert.doesNotMatch(page.headers['content-security-policy'],/unsafe-|\*/);
 assert.notEqual((await get('/onboarding')).headers['content-security-policy'],page.headers['content-security-policy']);
 assert.equal((await get('/onboarding?privy_oauth_code=synthetic',{headers:{'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document'}})).status,200);
 assert.equal((await get('/__embedded/config',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
 assert.equal((await get('/onboarding',{headers:{host:'evil.example'}})).status,403);
 const config=JSON.parse((await get('/__embedded/config')).body);assert.equal(config.phase,'ONBOARDING_ONLY');assert.equal(config.appId,null);
 for(const path of ['/auth/nonce','/auth/verify','/bootcamp/v1/applications'])assert.equal((await get(path,{method:'POST'})).status,404);
 const rpc=(method,originHeader=origin)=>request(config.rpcUrl,{method:'POST',headers:{origin:originHeader,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:[]})});
 const chain=await rpc('eth_chainId');assert.equal(chain.status,200);assert.equal(BigInt(JSON.parse(chain.body).result),BigInt(config.chainId));
 for(const method of ['eth_sendTransaction','eth_sendRawTransaction','personal_sign','evm_revert','evm_mine'])assert.equal((await rpc(method)).status,400);
 assert.equal((await rpc('eth_chainId','https://evil.example')).status,403);
});

test('auth check verifies both server roles with isolated cookies; denies replay, wrong browser and product routes',async t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'clear-embedded-auth-host-'))),build=join(dir,'build');mkdirSync(build);
 writeFileSync(join(build,'onboarding.js'),'// synthetic host transport fixture');
 const participant=Wallet.createRandom(),operator=Wallet.createRandom(),outsider=Wallet.createRandom();
 const fingerprint=createCertificates(dir),httpsPort=await port(),rpcPort=await port(),origin=`https://127.0.0.1:${httpsPort}`;
 const host=await createOnboardingServer({origin,rpcPort,tls:loadTls(dir,fingerprint),buildDirectory:build,
   authRoles:{participant:participant.address,operator:operator.address},authDirectory:join(dir,'auth')});
 t.after(async()=>{await host.close();rmSync(dir,{recursive:true,force:true});});
 const ca=readFileSync(join(dir,'ca.pem'));
 const call=(path,{method='POST',body={},headers={}}={})=>request(origin+path,{ca,method,
   headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json',...headers},
   body:method==='POST'?JSON.stringify(body):undefined});
 assert.equal(JSON.parse((await call('/__embedded/config',{method:'GET'})).body).phase,'AUTH_LOCAL_TEST');
 const unknown=await call('/auth/nonce',{body:{wallet:outsider.address,chainId:host.config.chainId}});
 assert.equal(unknown.status,403);assert.equal(JSON.parse(unknown.body).code,'NOT_INVITED');
 for(const [wallet,role] of [[participant,'participant'],[operator,'operator']]){
   const nonce=await call('/auth/nonce',{body:{wallet:wallet.address,chainId:host.config.chainId}});
   assert.equal(nonce.status,200);
   const challenge=JSON.parse(nonce.body),preauth=nonce.headers['set-cookie'][0].split(';')[0];
   assert.ok(preauth.startsWith(`__Host-clear-embedded-check-${httpsPort}-preauth=`));
   assert.match(nonce.headers['set-cookie'][0],/Path=\/; HttpOnly; Secure; SameSite=Strict/);
   const signature=await wallet.signMessage(challenge.message),body={nonce:challenge.nonce,signature};
   assert.equal((await call('/auth/verify',{body})).status,401);
   assert.equal((await call('/auth/verify',{body:{...body,role:'operator'},headers:{cookie:preauth}})).status,422);
   const verified=await call('/auth/verify',{body,headers:{cookie:preauth+'; __Host-clear-session='+'a'.repeat(64),'x-role':'operator'}});
   assert.equal(verified.status,200);const session=JSON.parse(verified.body);assert.equal(session.role,role);
   assert.equal(session.wallet,wallet.address);assert.equal(session.token,undefined);
   const sessionCookie=verified.headers['set-cookie'][0].split(';')[0];
   assert.ok(sessionCookie.startsWith(`__Host-clear-embedded-check-${httpsPort}-session=`));
   assert.ok(verified.headers['set-cookie'].every(c=>c.startsWith(`__Host-clear-embedded-check-${httpsPort}-`)));
   assert.equal((await call('/auth/verify',{body,headers:{cookie:preauth}})).status,401);
   const headers={cookie:sessionCookie,'x-wallet':wallet.address,'x-chain-id':String(host.config.chainId)};
   assert.equal(JSON.parse((await call('/auth/session',{method:'GET',headers})).body).role,role);
   assert.equal((await call('/auth/session',{method:'GET',headers:{...headers,'x-wallet':outsider.address}})).status,403);
   assert.equal((await call('/auth/session',{method:'GET',headers:{...headers,cookie:sessionCookie.replace(`embedded-check-${httpsPort}-`,'')}})).status,401);
   assert.equal((await call('/auth/logout',{headers})).status,403);
   const logout=await call('/auth/logout',{headers:{...headers,'x-csrf-token':session.csrf}});
   assert.equal(logout.status,200);assert.equal(JSON.parse(logout.body).loggedOut,true);
   assert.ok(logout.headers['set-cookie'].every(c=>c.startsWith(`__Host-clear-embedded-check-${httpsPort}-session=`)));
   assert.equal((await call('/auth/session',{method:'GET',headers})).status,401);
 }
 for(const path of ['/applications','/policies','/runtimes','/mvp/applications','/bootcamp/v3/applications','/auth/verify?role=operator'])
   assert.equal((await call(path)).status,404);
 assert.equal((await call('/auth/nonce',{headers:{origin:'https://evil.example'},body:{wallet:participant.address,chainId:host.config.chainId}})).status,403);
 for(const cookieNamespace of ['', 'x; Secure', '../x', 'X', 'x'.repeat(33)])
   assert.throws(()=>createApplicationHandler({origin},{cookieNamespace}),/COOKIE_NAMESPACE_CONFIG/);
});
