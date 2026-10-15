import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('real transport options pin DNS/TLS and send only fixed public headers',()=>{
 const moduleUrl=new URL('../../src/product-workflow/public-fetch.mjs',import.meta.url).href;
 const code=`import https from 'node:https';import {EventEmitter} from 'node:events';import {syncBuiltinESMExports} from 'node:module';import assert from 'node:assert/strict';
 let called=0;https.request=(options,callback)=>{called++;assert.equal(options.hostname,'toeic.ybmclass.com');assert.equal(options.servername,options.hostname);assert.equal(options.port,443);assert.equal(options.agent,false);assert.equal(options.method,'GET');assert.deepEqual(Object.keys(options.headers).sort(),['accept','accept-encoding','user-agent']);
 options.lookup('toeic.ybmclass.com',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'93.184.216.34');assert.equal(family,4);});
 const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'text/plain'};res.destroy=()=>{};callback(res);res.emit('data',Buffer.from('SYNTHETIC'));res.emit('end');});return req;};syncBuiltinESMExports();
 const {requestPinned}=await import(${JSON.stringify(moduleUrl)});const reply=await requestPinned(new URL('https://toeic.ybmclass.com/toeic/refundclass/index_v5.asp'),{address:'93.184.216.34',family:4},100,new AbortController().signal);assert.equal(reply.bytes.toString(),'SYNTHETIC');assert.equal(called,1);`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{PATH:process.env.PATH},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
