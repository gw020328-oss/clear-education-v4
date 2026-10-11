// Creates only this task's short-lived synthetic container, never a privileged container or real collector.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const image='public.ecr.aws/supabase/storage-api:v1.72.1';
const docker=(args,input)=>execFileSync('docker',args,{encoding:'utf8',input,timeout:30000,stdio:['pipe','pipe','pipe']});
const imageId=docker(['image','inspect','--format','{{.Id}}',image]).trim();
const target=JSON.parse(readFileSync(new URL('./targets.candidate.json',import.meta.url),'utf8'));
const source=readFileSync(new URL('./preflight.mjs',import.meta.url),'utf8').split("if(process.argv[1]")[0];
const roles=[];
for(const role of ['collector','verifier']) {
 const name='clear-w02b2-'+randomUUID(),root=target[role].root;
 try {
  docker(['run','-d','--pull','never','--name',name,'--network','none','--read-only','--user','65534:65534','--cap-drop','ALL','--security-opt','no-new-privileges','--ulimit','core=0:0','--memory','96m','--memory-swap','96m','--log-driver','none','--tmpfs',`${root}:rw,noexec,nosuid,nodev,size=8388608,mode=0700,uid=65534,gid=65534`,'--entrypoint','node',imageId,'-e','setInterval(()=>{},1000)']);
  const inspected=JSON.parse(docker(['inspect',name]))[0];
  assert.equal(inspected.HostConfig.ReadonlyRootfs,true);assert.equal(inspected.HostConfig.Privileged,false);assert.equal(inspected.HostConfig.NetworkMode,'none');assert.equal(inspected.HostConfig.LogConfig.Type,'none');assert.deepEqual(inspected.Mounts,[]);
  const script=source+`
import assert from 'node:assert/strict';
const target=${JSON.stringify(target)},role=${JSON.stringify(role)};
for(const child of target[role].children)await fs.mkdir(join(target[role].root,child),{mode:0o700});
const snapshot=await observe(target,role);const result=evaluate(snapshot,target,role);
assert.equal(snapshot.paths.every(p=>p.tmpfs&&p.privateMode&&p.ownerMatches&&p.symlinkFree),true);
assert.equal(snapshot.noNewPrivileges,true);assert.equal(snapshot.coreDumpDisabled,true);assert.equal(snapshot.cgroupSwapMaxZero,true);
assert.equal(result.mayGenerateRealProof,false);
const checks=[];
// Same observer finds a directory permission error; do not fabricate an observation result.
const directory=join(target[role].root,target[role].children[0]);await fs.chmod(directory,0o755);
const bad=evaluate(await observe(target,role),target,role);assert.ok(bad.failures.some(s=>s.startsWith('PRIVATE_PATH')));await fs.chmod(directory,0o700);checks.push('actual permission drift detected');
await fs.writeFile(join(directory,'canary'),'SYNTHETIC_W02B2_ONLY',{mode:0o600});
await assert.rejects(()=>fs.writeFile('/clear-write-outside','SYNTHETIC'),/EROFS|EACCES/);checks.push('outside-root disk write denied');
console.log(JSON.stringify({snapshot,result,checks}));
`;
  const observation=JSON.parse(docker(['exec','-i',name,'node','--input-type=module'],script).trim());
  docker(['kill','--signal','KILL',name]);docker(['start',name]);
  const children=JSON.parse(docker(['exec',name,'node','-e',`console.log(JSON.stringify(require('fs').readdirSync(${JSON.stringify(root)})))`]).trim());assert.deepEqual(children,[]);
  observation.checks.push('SIGKILL and restart remove all role paths and canary');roles.push(observation);
 }finally{try{docker(['rm','-f',name]);}catch{throw new Error('TASK_CONTAINER_CLEANUP_FAILED');}}
}
const result={status:'SYNTHETIC_ROLE_LAYOUTS_VALIDATED_LIVE_BLOCKED',imageId,roles,hostChainVerified:false,browserStarted:false,mayGenerateRealProof:false};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
