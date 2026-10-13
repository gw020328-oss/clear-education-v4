import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {probeChromeSession} from './chrome-session.mjs';
function fixture(mode) {
  const child=new EventEmitter(),read=new PassThrough();child.killed=false;
  child.kill=()=>{child.killed=true;child.emit('exit',null,'SIGTERM');};
  const write=new Writable({write(chunk,encoding,done){
    const request=JSON.parse(chunk.toString().slice(0,-1));done();
    queueMicrotask(()=>{
      if(request.method==='Browser.close'){
        if(mode==='pipe-error'){read.emit('error',new Error('SYNTHETIC_PIPE_FAILURE'));return;}
        if(mode==='hang')return;
        child.emit('exit',mode==='nonzero-exit'?1:mode==='signal-exit'?null:0,mode==='signal-exit'?'SIGTERM':null);return;
      }
      if(mode==='malformed'){read.write('not-json\0');return;}
      const result=request.method==='Target.createTarget'?{targetId:'synthetic'}:request.method==='Target.attachToTarget'?{sessionId:'synthetic'}:request.method==='Runtime.evaluate'?{result:{value:42}}:{};
      read.write(JSON.stringify({id:request.id,result})+'\0');
    });
  }});
  child.stdio=[null,null,null,write,read];return child;
}
for(const mode of ['clean','pipe-error','nonzero-exit','signal-exit','hang','malformed']){
  test('synthetic CDP lifecycle: '+mode,async()=>{
    const child=fixture(mode),checks=await probeChromeSession(child,{requestTimeoutMs:15,exitWaitMs:15});
    if(mode==='clean'){
      assert.deepEqual(checks.map(c=>c.status),['PASS','PASS','PASS']);assert.equal(child.killed,false);
    }else{
      assert.ok(checks.some(c=>c.status==='FAIL'));
      assert.ok(!checks.some(c=>c.id==='chrome-normal-exit'&&c.status==='PASS'));
      assert.equal(child.killed,['pipe-error','hang','malformed'].includes(mode));
    }
  });
}
