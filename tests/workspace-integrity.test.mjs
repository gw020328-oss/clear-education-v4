import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync,spawnSync } from 'node:child_process';
const source=fileURLToPath(new URL('../',import.meta.url));
test('fresh clone integrity: feature branch, detached HEAD, original provenance and tamper rejection',async t=>{
 const parent=await fs.mkdtemp(join(tmpdir(),'clear-integrity-')),root=join(parent,'repo');t.after(()=>fs.rm(parent,{recursive:true,force:true}));
 execFileSync('git',['clone','--no-local',source,root],{stdio:'pipe'});
 // Also exercise uncommitted verifier changes during local development.
 for(const path of ['tools/verify-workspace.mjs','docs/reference/published-fingerprints.json'])await fs.copyFile(join(source,path),join(root,path));
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
 const verify=()=>spawnSync(process.execPath,['tools/verify-workspace.mjs'],{cwd:root,encoding:'utf8'});
 const passes=()=>{const r=verify();assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/PORTABLE_CONTENT/);};
 git('checkout','-b','codex/integrity-regression');passes();
 git('checkout','--detach');passes();
 for(const path of ['docs/reference/PRD.ko.md','docs/reference/published-fingerprints.json','docs/w01/reference-inputs.json','legacy/package.json']){
  const file=join(root,path),original=await fs.readFile(file);await fs.writeFile(file,Buffer.concat([original,Buffer.from('\nSYNTHETIC_TAMPER\n')]));
  assert.notEqual(verify().status,0,`tamper accepted: ${path}`);await fs.writeFile(file,original);
 }
 const manifestPath=join(root,'docs/reference/published-fingerprints.json'),original=await fs.readFile(manifestPath);
 const manifest=JSON.parse(original);manifest.files[0].sha256='0'.repeat(64);await fs.writeFile(manifestPath,JSON.stringify(manifest));assert.notEqual(verify().status,0);await fs.writeFile(manifestPath,original);
 const shallow=join(parent,'shallow');execFileSync('git',['clone','--depth','1',new URL(`file://${root}`).href,shallow],{stdio:'pipe'});
 for(const path of ['tools/verify-workspace.mjs','docs/reference/published-fingerprints.json'])await fs.copyFile(join(source,path),join(shallow,path));
 const result=spawnSync(process.execPath,['tools/verify-workspace.mjs'],{cwd:shallow,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/REFERENCE_HISTORY_REQUIRED/);
 passes();
});
