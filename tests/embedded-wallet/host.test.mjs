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
