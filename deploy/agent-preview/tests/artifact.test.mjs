import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'clear-artifact-'))),staged=join(dir,'staged');
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  execFileSync(process.execPath,[resolve(root,'deploy/agent-preview/package.mjs'),staged],{cwd:root,env:{PATH:process.env.PATH},stdio:'pipe'});
  symlinkSync(resolve(root,'node_modules'),join(staged,'node_modules'),'dir');
  const manifestPath=join(staged,'build-manifest.json'),bytes=readFileSync(manifestPath),manifest=JSON.parse(bytes);
  return {dir,staged,manifestPath,bytes,manifest};
}
test('canonical manifest passes; four-file, omitted, duplicate and extra entries fail',async t=>{
  const f=fixture(t),{verifyArtifact}=await import(pathToFileURL(join(f.staged,'deploy/agent-preview/artifact.mjs')));
  assert.equal(verifyArtifact(sha(f.bytes)),f.manifest.sourceHead);
  const required=['deploy/agent-preview/service.mjs','deploy/agent-preview/limits.mjs',
    'src/agent-preview/gemini-preparation.mjs','src/ai-policy/gemini-evaluation.mjs'];
  const four=f.manifest.files.filter(entry=>required.includes(entry.path));assert.equal(four.length,4);
  for(const files of [four,f.manifest.files.filter(entry=>entry.path!=='deploy/agent-preview/store.mjs'),
    [...f.manifest.files,f.manifest.files[0]], [...f.manifest.files,{path:'src/unexpected.mjs',sha256:'a'.repeat(64)}]]) {
    const bytes=JSON.stringify({...f.manifest,files});writeFileSync(f.manifestPath,bytes);
    assert.throws(()=>verifyArtifact(sha(bytes)),/ARTIFACT_FILE_SET/);
  }
  writeFileSync(f.manifestPath,f.bytes);
  const store=join(f.staged,'deploy/agent-preview/store.mjs'),original=readFileSync(store);
  writeFileSync(store,Buffer.concat([original,Buffer.from('\nexport const changed=true;\n')]));
  assert.throws(()=>verifyArtifact(sha(f.bytes)),/ARTIFACT_MISMATCH/);writeFileSync(store,original);
  const extra=join(f.staged,'src/package.json');writeFileSync(extra,'{}');
  assert.throws(()=>verifyArtifact(sha(f.bytes)),/ARTIFACT_FILE_SET/);rmSync(extra);
  rmSync(store);symlinkSync(join(f.staged,'deploy/agent-preview/config.mjs'),store);
  assert.throws(()=>verifyArtifact(sha(f.bytes)),/ARTIFACT_PATH/);
});
test('server, Railway and approval CLI reject tampered application before its top-level side effects',t=>{
  const f=fixture(t),profile=join(f.dir,'profile.json');
  writeFileSync(profile,JSON.stringify({artifactHash:sha(f.bytes)}));
  const config=join(f.staged,'deploy/agent-preview/config.mjs');
  writeFileSync(config,readFileSync(config,'utf8')+'\nconsole.error("UNVERIFIED_APPLICATION_EVALUATED");\n');
  for(const [entry,args,error] of [['server.mjs',[],'PREVIEW_START_FAILED'],['railway.mjs',[],'PREVIEW_START_FAILED'],
    ['approval.mjs',['prepare','/nonexistent'],'PREVIEW_APPROVAL_FAILED']]) {
    const result=spawnSync(process.execPath,[join(f.staged,'deploy/agent-preview',entry),...args],{encoding:'utf8',
      env:{CLEAR_PREVIEW_CONFIG:profile,CLEAR_PREVIEW_ARTIFACT_HASH:sha(f.bytes)}});
    assert.equal(result.status,1);assert.match(result.stderr,new RegExp(error));
    assert.doesNotMatch(result.stderr,/UNVERIFIED_APPLICATION_EVALUATED/);
  }
});

test('SIGTERM cancels a pending HTTP operation before drain and exits cleanly',async t=>{
  const {spawn}=await import('node:child_process');
  const http=await import('node:http');
  const {once}=await import('node:events');
  const {signature}=await import('../auth.mjs');
  const f=fixture(t),profile=join(f.dir,'profile.json'),secretFile=join(f.dir,'secret');
  // An offline service fixture in a newly hashed artifact. The real bootstrap,
  // HTTP server and signal handler are unchanged; no model credentials are present.
  const service=join(f.staged,'deploy/agent-preview/service.mjs');
  writeFileSync(service,`let pending;
    export function createService(){return {
      generate(body,{signal}={}){console.log('OFFLINE_PENDING');
        return new Promise((resolve,reject)=>{pending=()=>reject(Error('SERVICE_CLOSED'));
          signal?.addEventListener('abort',pending,{once:true});});},
      close(){console.log('OFFLINE_CLOSED');pending?.();}
    };}`);
  f.manifest.files.find(entry=>entry.path==='deploy/agent-preview/service.mjs').sha256=sha(readFileSync(service));
  const manifestBytes=JSON.stringify(f.manifest);writeFileSync(f.manifestPath,manifestBytes);
  writeFileSync(secretFile,'b'.repeat(64),{mode:0o600});
  const reserved=http.createServer();await new Promise(resolve=>reserved.listen(0,'127.0.0.1',resolve));
  const port=reserved.address().port;await new Promise(resolve=>reserved.close(resolve));
  writeFileSync(profile,JSON.stringify({version:'clear-external-preview-config.1',publicOrigin:'https://preview.example.invalid',port,
    institutionId:'clear-demo',courseId:'2',operatorId:'2',dataMode:'DEMO_ACCOUNTS_ONLY',artifactHash:sha(manifestBytes),
    deploymentEpoch:'00000000-0000-4000-8000-000000000001',databasePath:join(f.dir,'state.sqlite'),sharedSecretFile:secretFile}));
  const child=spawn(process.execPath,[join(f.staged,'deploy/agent-preview/server.mjs')],{env:{CLEAR_PREVIEW_CONFIG:profile},stdio:['ignore','pipe','pipe']});
  let output='',error='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>error+=data);
  const exited=once(child,'exit');t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  async function until(text) {
    const deadline=Date.now()+5000;
    while(!output.includes(text)) {
      assert.equal(child.exitCode,null,error);assert.ok(Date.now()<deadline,'runner output deadline: '+output+error);
      await new Promise(resolve=>setTimeout(resolve,10));
    }
  }
  await until('LISTENING');
  const path='/v1/preview/generate',body='{}',timestamp=String(Math.floor(Date.now()/1000)),nonce='1'.repeat(32);
  const request=http.request({host:'127.0.0.1',port,path,method:'POST',headers:{host:'preview.example.invalid','content-type':'application/json',
    'x-clear-timestamp':timestamp,'x-clear-nonce':nonce,'x-clear-signature':signature('b'.repeat(64),timestamp,nonce,path,body)}});
  request.on('error',()=>{});request.end(body);t.after(()=>request.destroy());await until('OFFLINE_PENDING');
  child.kill('SIGTERM');let timer;
  try {const result=await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('shutdown did not finish')),1500);})]);
    assert.equal(result[0],0);assert.match(output,/OFFLINE_CLOSED/);
  }finally{clearTimeout(timer);}
});
