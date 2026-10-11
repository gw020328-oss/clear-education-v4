import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseMountInfo,enclosingMount,cgroupSwapFile,evaluate,observe} from '../preflight.mjs';
const target=JSON.parse(await readFile(new URL('../targets.candidate.json',import.meta.url),'utf8'));
const good=role=>({role,root:target[role].root,platform:'linux',node:'24.21.0',uid:1000,globalSwapDisabled:true,cgroupSwapMaxZero:null,coreDumpDisabled:true,noNewPrivileges:true,paths:[target[role].root,...target[role].children.map(c=>target[role].root+'/'+c)].map(path=>({path,exists:true,directory:true,symlinkFree:true,ownerMatches:true,privateMode:true,tmpfs:true,mount:{type:'tmpfs',target:target[role].root,options:['rw','nosuid','nodev','noexec']}}))});
for(const role of ['collector','verifier'])test(`synthetic ${role} kernel facts pass but can never authorize real collection`,()=>{const r=evaluate(good(role),target,role);assert.equal(r.kernelPreflightPassed,true);assert.equal(r.mayGenerateRealProof,false);assert.equal(r.paymentAllowed,false);assert.ok(r.externalReviewRequired.length>0);});
for(const [name,field,value] of [['Mac','platform','darwin'],['wrong Node','node','24.19.0'],['root','uid',0],['unknown uid','uid',null],['core dump enabled','coreDumpDisabled',false],['unknown core dump','coreDumpDisabled',null],['privilege escalation','noNewPrivileges',false],['swappable process','globalSwapDisabled',false]])test(`reject ${name}`,()=>{const s=good('collector');s[field]=value;assert.equal(evaluate(s,target,'collector').kernelPreflightPassed,false);});
for(const field of ['exists','directory','symlinkFree','ownerMatches','privateMode','tmpfs'])test(`reject one unsafe collector path: ${field}`,()=>{const s=good('collector');s.paths[1][field]=false;assert.equal(evaluate(s,target,'collector').kernelPreflightPassed,false);});
for(const flag of ['rw','nosuid','nodev','noexec'])test(`reject missing mount flag ${flag}`,()=>{const s=good('verifier');s.paths[1].mount.options=s.paths[1].mount.options.filter(v=>v!==flag);assert.equal(evaluate(s,target,'verifier').kernelPreflightPassed,false);});
test('cgroup zero alone does not satisfy conservative swap gate',()=>{const s=good('collector');s.globalSwapDisabled=false;s.cgroupSwapMaxZero=true;assert.equal(evaluate(s,target,'collector').kernelPreflightPassed,false);for(const p of s.paths)p.mount.options.push('noswap');assert.equal(evaluate(s,target,'collector').kernelPreflightPassed,true);assert.equal(evaluate(s,target,'collector').mayGenerateRealProof,false);});
test('noswap mount alone does not cover anonymous process memory',()=>{const s=good('collector');s.globalSwapDisabled=false;s.cgroupSwapMaxZero=false;for(const p of s.paths)p.mount.options.push('noswap');assert.equal(evaluate(s,target,'collector').kernelPreflightPassed,false);});
test('missing unknown mount data blocks',()=>{const s=good('verifier');s.paths[0].mount=null;assert.equal(evaluate(s,target,'verifier').kernelPreflightPassed,false);});
test('duplicate path cannot hide a missing role directory',()=>{const s=good('collector');s.paths[2]=structuredClone(s.paths[1]);assert.equal(evaluate(s,target,'collector').kernelPreflightPassed,false);});
test('verifier facts cannot stand in for collector facts',()=>assert.equal(evaluate(good('verifier'),target,'collector').kernelPreflightPassed,false));
test('mountinfo decodes escaped paths and chooses nested mount not parent tmpfs',()=>{
 const mounts=parseMountInfo('1 0 0:1 / /run/clear-collector rw,nosuid,nodev,noexec - tmpfs tmpfs rw,size=1024k\n2 1 0:2 / /run/clear-collector/profile rw - ext4 /dev/disk rw\n3 0 0:3 / /space\\040name rw - tmpfs tmpfs rw,noswap');
 assert.equal(enclosingMount(mounts,'/run/clear-collector/profile/cache').type,'ext4');assert.equal(enclosingMount(mounts,'/run/clear-collector/temp').type,'tmpfs');assert.equal(mounts[2].target,'/space name');assert.equal(enclosingMount(mounts,'/run/clear-collector-other'),null);
});
test('maps namespaced and host cgroup paths without assuming cgroup root',()=>{
 const mounts=parseMountInfo('1 0 0:1 / /sys/fs/cgroup ro - cgroup2 cgroup rw');
 assert.equal(cgroupSwapFile(mounts,'0::/user.slice/session.scope'),'/sys/fs/cgroup/user.slice/session.scope/memory.swap.max');
 assert.equal(cgroupSwapFile(mounts,'0::/'),'/sys/fs/cgroup/memory.swap.max');
 mounts[0].root='/user.slice';assert.equal(cgroupSwapFile(mounts,'0::/user.slice/session.scope'),'/sys/fs/cgroup/session.scope/memory.swap.max');assert.equal(cgroupSwapFile(mounts,'0::/other'),null);assert.equal(cgroupSwapFile(mounts,'0::/../escape'),null);
});
test('malformed mountinfo is not silently accepted',()=>assert.throws(()=>parseMountInfo('garbage')));
test('read-only observer rejects arbitrary paths and unknown roles',async()=>{await assert.rejects(()=>observe(target,'unknown'));const altered=structuredClone(target);altered.collector.root='/tmp';await assert.rejects(()=>observe(altered,'collector'));altered.collector.root=target.collector.root;altered.collector.children.push('../other');await assert.rejects(()=>observe(altered,'collector'));});
test('current machine observation leaves missing directories missing and live disabled',async()=>{const s=await observe(target,'collector');const r=evaluate(s,target,'collector');assert.equal(r.mayGenerateRealProof,false);if(process.platform==='darwin')assert.equal(r.kernelPreflightPassed,false);});
