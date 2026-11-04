import http from 'node:http';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {hash,digest} from '/app/deploy/agent-preview/vendor/b-peer/contract.mjs';
import {encodePeer,decodePeer,ZERO_HASH} from '/app/deploy/agent-preview/vendor/b-peer/peer-transport.mjs';
import {limits} from '/app/deploy/agent-preview/limits.mjs';
import {prepareGeminiStructureRequest} from '/app/src/agent-preview/gemini-preparation.mjs';
const manifest=readFileSync('/app/build-manifest.json');
assert.equal(JSON.parse(manifest).sourceHead,'ff0bef2c57312ddbf7006c295dbc583e3938a822');
assert.equal(digest(manifest),'56bd9cb874332ef39ca8a26ab49d4ea06c82b66fa841c023c4f6dca153a440d1');
assert.equal(process.getuid(),1000);
assert.deepEqual(Object.keys((await import('node:os')).networkInterfaces()),['lo']);
assert.equal(process.env.GEMINI_API_KEY,undefined);
const sourceText='Python 기초 강의 완료';
const mode='ACTUAL_GEMINI'; {
  const root=realpathSync(mkdtempSync(join(tmpdir(),'clear-peer-runtime-')));
  mkdirSync(join(root,'state'),{mode:0o700});
  let now=Date.now();
  const config={version:'clear-external-preview-config.1',publicOrigin:'https://peer.example.invalid',port:19001,
    institutionId:'demo',courseId:'2',operatorId:'2',dataMode:'DEMO_ACCOUNTS_ONLY',artifactHash:digest(readFileSync('/app/build-manifest.json')),
    deploymentEpoch:'00000000-0000-4000-8000-000000000001',databasePath:join(root,'state','approval.sqlite'),
    sharedSecretFile:join(root,'key')};
  const pin={keyRef:'key1',sender:'B',receiver:'D',audience:'preview',deploymentEpoch:config.deploymentEpoch,
    origin:config.publicOrigin,maxClockSkewSeconds:0};
  const release={version:'clear-peer-release.1',mode,config,pin,targetRef:'core-page-manual-mark',
    planTarget:'python-intro',maxObservationAgeSeconds:10,receiptContract:'clear-preview-peer-receipts.1'};
  const p=prepareGeminiStructureRequest(sourceText),scopeHash='b'.repeat(64);
  const context={version:'clear-self-preview-context.1',previewContextRef:'c'.repeat(64),
    sourceHash:p.sourceHash,bodyHash:p.bodyHash,model:p.model,expiresAtExclusive:Math.floor(now/1000)+60,
    automaticEligibility:false,paymentAllowed:false};
  context.approvalBindingHash=hash({domain:'CLEAR_SELF_PREVIEW_APPROVAL_1',contextRef:context.previewContextRef,
    scopeHash,sourceHash:p.sourceHash,bodyHash:p.bodyHash,model:p.model,limitsHash:hash(limits),
    artifactHash:config.artifactHash,deploymentEpoch:config.deploymentEpoch,expiresAtExclusive:context.expiresAtExclusive});
  const registration={version:'clear-peer-registration.1',releaseHash:hash(release),scopeHash,context,
    targetRef:release.targetRef,planTarget:release.planTarget,approvalRef:'approval-one'};
  let seq=0;
  function request(path,value,{proposalHash=ZERO_HASH,...overrides}={}) {
    now=Date.now();
    const body=Buffer.from(JSON.stringify(value));
    const meta={version:'clear-preview-peer.1',kind:'REQUEST',...pin,method:'POST',path,
      requestRef:(++seq).toString(16).padStart(64,'0'),contextRef:context.previewContextRef,
      sourceHash:context.sourceHash,proposalHash,bodyHash:digest(body),issuedAt:Math.floor(now/1000),
      expiresAtExclusive:Math.floor(now/1000)+5,requestHash:ZERO_HASH,status:0,...overrides};
    delete meta.origin;delete meta.maxClockSkewSeconds;
    return encodePeer(meta,body,key);
  }
  const prepare={version:'clear-preview-peer-context-registration.1',context,
    release:{deploymentEpoch:config.deploymentEpoch,artifactHash:config.artifactHash,model:p.model,limitsHash:hash(limits)},
    toolBinding:{tool:'moodle.activity.public',planTarget:release.planTarget,observationTargetRef:release.targetRef},
    modelCapability:'ACTUAL_GEMINI_HTTP',observationCapability:'B_VERIFIED_MOODLE',dataMode:'SYNTHETIC_ONLY'};
const key=randomBytes(32);
const rp=join(root,'release'), cp=join(root,'registration');
for (const [p,v] of [[rp,JSON.stringify(release)],[cp,JSON.stringify(registration)],[config.sharedSecretFile,key.toString('hex')]]) writeFileSync(p,v,{mode:0o600});
const run=async()=>{
  const child=spawn(process.execPath,['/app/deploy/agent-preview/peer-main.mjs'],{env:{CLEAR_PEER_RELEASE:rp,CLEAR_PEER_REGISTRATION:cp},stdio:['ignore','pipe','inherit']});
  const exit=once(child,'exit');
  await Promise.race([once(child.stdout,'data').then(([line])=>assert.match(String(line),/PEER_LISTENING/)),exit.then(()=>{throw Error('premature exit')})]);
  return async()=>{ child.kill('SIGTERM'); assert.deepEqual(await exit,[0,null]); };
};
const path='/v1/preview/prepare';
const post=(path,body)=>new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:config.port,path,method:'POST',headers:{host:'peer.example.invalid','content-type':'application/json'}},res=>{
    const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,arrayBuffer:()=>Buffer.concat(chunks)}));res.on('error',reject);
  });req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('SMOKE_TIMEOUT')));req.end(body);
});
let stop=await run();
try {
  assert.equal((await post(path,'{}')).status,422);
  const wire=request(path,prepare);
  const ok=await post(path,wire);
  assert.equal(ok.status,200);
  const receipt=JSON.parse(decodePeer(Buffer.from(await ok.arrayBuffer()),key).body);
  assert.equal(receipt.version,'clear-preview-context-receipt.1');
  assert.equal(receipt.registered,true);
  assert.equal(receipt.paymentAllowed,false);
  assert.equal((await post(path,wire)).status,422);
  const gen='/v1/preview/generate';
  assert.equal((await post(gen,request(gen,{sourceText,approvalRef:registration.approvalRef}))).status,422);
} finally {await stop();}
stop=await run();
try {assert.equal((await post(path,request(path,prepare))).status,422);}
finally {await stop();}
console.log('PASS: network none, uid1000, signed prepare, invalid/replay rejection, no grant, restart replay, SIGTERM');
}
