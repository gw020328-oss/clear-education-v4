import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { request } from 'node:http';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import * as protocol from '../../../src/agent-preview/moodle-binding/peer-transport.mjs';
import { strictJson } from '../../../src/hackerrank-evidence/values.mjs';

const cHead = '2abcc74abb3560cb4e4c681ee27eebd212803575';
const origin = 'http://127.0.0.1:18767';
const signedOrigin = 'https://synthetic.invalid';
const key = Buffer.alloc(32, 0x11); // Public isolated synthetic fixture material.
const pin = {keyRef:'synthetic-key',sender:'B',receiver:'C',audience:'synthetic-C-observations',
  deploymentEpoch:'epoch-1',path:'/observations',origin:signedOrigin,maxClockSkewSeconds:0};
const clock = () => Math.floor(Date.now()/1000);
const parse = bytes => strictJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes),16384);

function localRequest(path, init = {}) {
  assert.equal(path,'/observations');
  return new Promise((resolve,reject)=>{
    const req=request(origin+path,{method:'POST',headers:init.headers,signal:init.signal,agent:false},res=>resolve(res));
    req.on('error',reject);req.end(init.body);
  });
}

function ownerCommand(args, value, signal, timeout=4500) {
  return new Promise((resolve,reject)=>{
    const child=execFile('docker',['exec','-i','-u','www-data','clear-c-peer-web',...args],
      {signal,timeout,maxBuffer:32768,encoding:'buffer'},(error,stdout)=>{
        if(error || child.killed) return reject(Error('C_OWNER_FIXTURE_REJECTED_'+args[0]));
        try {resolve(parse(stdout));} catch(error) {
          reject(Error('C_OWNER_JSON_'+args[0]+'_'+stdout.length,{cause:error}));
        }
      });
    child.stdin.on('error',()=>{});
    child.stdin.end(JSON.stringify(value));
  });
}
export function loadInstalledMoodle() {
  const root=resolve(process.env.CLEAR_C_PEER_WORKTREE);
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  assert.equal(git('rev-parse','HEAD'),cHead);
  assert.equal(git('status','--porcelain','--untracked-files=all','--','.',':(exclude)node_modules'),'');
  const attempts=new Set();
  let pending=null;
  return {
    clock,
    profile:{installationRef:'synthetic-moodle',courseRef:'synthetic-course',subjectRef:'synthetic-subject',
      audience:'synthetic-clear',issuerEpoch:'issuer-probe-v1',targetRef:'core-page-manual-mark'},
    async provision() {
      assert.ok(pending);
      const receipt=await ownerCommand(['php','/probe/moodle-integration/peer_fixture.php','--stdin'],pending,undefined,20000);
      assert.equal(receipt.mode,'SYNTHETIC_ONLY');
      assert.equal(receipt.confirmation.attemptRef,pending.attemptRef);
      assert.equal(receipt.confirmation.bindingScopeHash,pending.bindingScopeHash);
      attempts.add(pending.attemptRef);pending=null;
    },
    async confirmation(value,{signal}={}) {
      signal?.throwIfAborted();
      if(!attempts.has(value.attemptRef)) {
        pending=structuredClone(value);
        throw Error('C_CONFIRMATION_SETUP_REQUIRED');
      }
      const receipt=await ownerCommand(['curl','-fsS','--max-time','4','-H','Content-Type: application/json',
        '--data-binary','@-','http://127.0.0.1:18767/lookup'],{request:value},signal);
      assert.equal(receipt.ok,true);return receipt.result;
    },
    transport({replay,trace}) {
      const peer=protocol.createPeerTransport({pin,key,replay,clock,activation:'OFFLINE_TEST',
        fetchImpl:async(url,init)=>{
          assert.equal(url,signedOrigin+'/observations');
          const wire=JSON.parse(init.body);
          trace.push({peer:'C',path:'/observations',meta:wire.meta,payload:JSON.parse(Buffer.from(wire.body,'base64'))});
          const res=await localRequest('/observations',init);
          return new Response(Readable.toWeb(res),{status:res.statusCode,headers:res.headers});
        }});
      return {execution:'LOCAL_SYNTHETIC_HTTP',query:peer.query,close:peer.close};
    }
  };
}
