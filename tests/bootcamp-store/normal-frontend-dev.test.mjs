import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {request} from 'node:https';
import {once} from 'node:events';
import {Wallet} from 'ethers';
import {DatabaseSync} from 'node:sqlite';
import {initializeFrontendDevelopment,startFrontendDevelopment} from '../../tools/bootcamp/frontend-dev.mjs';

test('C1 host starts without application/chain/source and preserves its store across restart',async t=>{
 const parent=realpathSync(mkdtempSync(join(tmpdir(),'clear-c1-host-'))),directory=join(parent,'display');let host;
 t.after(async()=>{try{await host?.close();}finally{rmSync(parent,{recursive:true,force:true});}});
 const participant=Wallet.createRandom(),operator=Wallet.createRandom(),socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
 const port=socket.address().port;await new Promise(r=>socket.close(r));
 const initialized=initializeFrontendDevelopment({directory,port,participant:participant.address,operator:operator.address});
 assert.equal(initialized.applicationCreated,false);assert.equal(initialized.sourceMode,'SYNTHETIC_TEST_SOURCE');
 host=await startFrontendDevelopment({directory});
 function call(path,body){return new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port,servername:'localhost',path,method:body?'POST':'GET',ca:readFileSync(join(directory,'ca.pem')),
   headers:{origin:initialized.origin,...(body?{'content-type':'application/json'}:{})}},res=>{
    const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));
   });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
 });}
 const response=await call('/__dev/config');assert.equal(response.status,200);assert.equal(response.body.reviewConsentHttpImplemented,true);
 assert.equal(response.body.sourceCollectionConfigured,false);assert.equal(response.body.signerInstalled,false);
 const db=new DatabaseSync(join(directory,'store','bootcamp.sqlite'),{readOnly:true});assert.equal(db.prepare('SELECT COUNT(*) n FROM applications').get().n,0);db.close();
 assert.equal((await call('/auth/nonce',{wallet:participant.address,chainId:initialized.chainId})).status,200);
 await host.close();host=null;await new Promise(r=>setTimeout(r,1100));host=await startFrontendDevelopment({directory});
 assert.equal((await call('/__dev/config')).status,200);assert.equal(host.config.sourceMode,'SYNTHETIC_TEST_SOURCE');
 await assert.rejects(startFrontendDevelopment({directory}),/DEV_LOCKED/);
 assert.throws(()=>initializeFrontendDevelopment({directory,port,participant:participant.address,operator:operator.address}),/EEXIST/);
});
