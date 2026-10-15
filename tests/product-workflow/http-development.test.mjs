import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,realpathSync,readFileSync,rmSync,mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Wallet } from 'ethers';
import { initializeSourceDevelopment,startSourceDevelopment } from '../../src/product-workflow/http-development.mjs';
import { availablePort,tlsRequest,loginHttp,runSourceHttpDemo } from '../../specs/m3/http-demo.mjs';

test('verified HTTPS source demo signs in and recovers persisted draft/review without a chain',async()=>{
 const result=await runSourceHttpDemo();assert.equal(result.restartSameOperation,true);assert.equal(result.actualWebsiteFetches,0);assert.equal(result.frontendConnected,false);
});

test('development host requires trusted TLS, preserves lock/state and serves only explicitly built public assets',async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'clear-source-dev-'))),directory=join(root,'env'),webRoot=join(root,'dist'),operator=Wallet.createRandom(),participant=Wallet.createRandom();
 let running;t.after(async()=>{await running?.close();rmSync(root,{recursive:true,force:true});});mkdirSync(webRoot);writeFileSync(join(webRoot,'index.html'),'<!doctype html><title>SYNTHETIC FRONTEND BUILD</title>');writeFileSync(join(webRoot,'wallets.json'),'NEVER_SERVE');
 const config=initializeSourceDevelopment({directory,port:await availablePort(),operator:operator.address,participant:participant.address});
 running=await startSourceDevelopment({directory,webRoot});
 const request=tlsRequest(config.origin,readFileSync(join(directory,'ca.pem')));
 await assert.rejects(request('/__dev/config',{trusted:false}));
 assert.equal((await request('/__dev/config')).body.captureMode,'MOCK');
 await assert.rejects(startSourceDevelopment({directory}),/DEV_LOCKED/);
 assert.throws(()=>initializeSourceDevelopment({directory,operator:operator.address,participant:participant.address}),/EEXIST/);
 for(const path of ['/wallets.json','/source-http.json','/ca.key','/server.key','/src/application/service.mjs'])assert.equal((await request(path)).status,404);
 const loggedIn=await loginHttp(request,operator,config.chainId);
 assert.equal((await request('/mvp/source-bundles',{headers:loggedIn})).status,200);
 assert.equal((await request('/mvp/source-bundles',{headers:{...loggedIn,origin:'https://evil.invalid'}})).status,403);
 await running.close();running=await startSourceDevelopment({directory,webRoot});
 assert.equal((await request('/mvp/source-bundles',{headers:loggedIn})).status,200);
});
