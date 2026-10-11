// Isolated synthetic tmpfs probe using an already-local image. Never pulls an image.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const imageTag='public.ecr.aws/supabase/storage-api:v1.72.1';
const imageId=execFileSync('docker',['image','inspect','--format','{{.Id}}',imageTag],{encoding:'utf8'}).trim();
const name='clear-w02b-'+randomUUID();
const call=(args,input)=>execFileSync('docker',args,{encoding:'utf8',input,timeout:30000,stdio:['pipe','pipe','pipe']});
const result={scope:'SYNTHETIC_CONTAINER_ONLY',imageTag,imageId,checks:[],liveCaptureAllowed:false,hostVmSwapAndBackupsVerified:false,browserLaunched:false};
const strict=process.argv.includes('--require-noswap');
const tmpfsOptions='rw,noexec,nosuid,nodev,'+(strict?'noswap,':'')+'size=1048576,mode=0700,uid=65534,gid=65534';
try {
 call(['run','-d','--pull','never','--name',name,'--network','none','--read-only','--user','65534:65534','--cap-drop','ALL','--security-opt','no-new-privileges','--ulimit','core=0:0','--memory','96m','--memory-swap','96m','--log-driver','none','--tmpfs','/run/w02b:'+tmpfsOptions,'--entrypoint','node',imageId,'-e','setInterval(()=>{},1000)']);
 const inspect=JSON.parse(call(['inspect',name]))[0];
 assert.equal(inspect.HostConfig.ReadonlyRootfs,true);assert.equal(inspect.HostConfig.NetworkMode,'none');assert.equal(inspect.HostConfig.LogConfig.Type,'none');assert.equal(inspect.HostConfig.MemorySwap,inspect.HostConfig.Memory);assert.deepEqual(inspect.Mounts,[]);
 result.checks.push('read-only root, no external network, no host bind mounts, logging disabled, cgroup swap budget zero');
 const storage=readFileSync(new URL('./storage.mjs',import.meta.url),'utf8');
 const script=storage+`
import assert from 'node:assert/strict';
const root='/run/w02b';let now=1000;
const staging=new SyntheticStaging(root,{clock:()=>now});const boundary=await staging.init();
assert.equal(boundary.tmpfs,true);assert.equal(boundary.privateMode,true);assert.equal(boundary.coreDisabled,true);assert.equal(boundary.symlinkFree,true);assert.equal(boundary.cgroupSwapDisabled,true);
const checks=[];
const bytes=syntheticPacket();const saved=await staging.accept(bytes);
assert.equal((await fs.stat(join(root,saved.id+'.json'))).mode&0o777,0o600);checks.push('real tmpfs stage file mode 0600');
await staging.remove(saved.id);assert.deepEqual(await staging.listIds(),[]);checks.push('packet issuance deletion');
await staging.accept(bytes);now=86400999;assert.equal((await staging.accept(bytes)).createdAt,1000);assert.equal(await staging.sweep(),0);
now=86401000;assert.equal(await staging.sweep(),1);checks.push('24-hour retention exact boundary without retry reset');
await assert.rejects(()=>fs.writeFile('/w02b-disk-fallback','SYNTHETIC'),/EROFS|EACCES/);checks.push('disk fallback denied');
await assert.rejects(()=>fs.writeFile(join(root,'quota-test'),Buffer.alloc(2*1024*1024)),/ENOSPC/);await fs.rm(join(root,'quota-test'),{force:true});checks.push('tmpfs capacity exhaustion fails');
await fs.writeFile(join(root,'crash-canary'),'SYNTHETIC_CRASH_CANARY',{mode:0o600});
console.log(JSON.stringify({boundary,checks,node:process.version}));
`;
 const run=JSON.parse(call(['exec','-i',name,'node','--input-type=module'],script).trim());Object.assign(result,run);result.checks.unshift('container restrictions verified');
 call(['kill','--signal','KILL',name]);call(['start',name]);
 const after=JSON.parse(call(['exec',name,'node','-e',"console.log(JSON.stringify(require('fs').readdirSync('/run/w02b'))) "]).trim());assert.deepEqual(after,[]);result.checks.push('SIGKILL and same-container restart leaves tmpfs empty');
 result.status=run.boundary.syntheticKernelBoundaryPassed?'PASS_SYNTHETIC_KERNEL_CHECKS_LIVE_STILL_BLOCKED':'SYNTHETIC_LIFECYCLE_PASS_STORAGE_GATE_BLOCKED';
} catch(error) {
 if(strict && String(error.stderr).includes('invalid tmpfs option')) {result.status='REQUIRED_TMPFS_NOSWAP_OPTION_UNSUPPORTED';result.checks.push('Docker rejects noswap; no fallback attempted in this strict probe');}
 else throw error;
} finally {
 try {call(['rm','-f',name]);}catch {}
}
const output=process.argv[2];if(output)writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
