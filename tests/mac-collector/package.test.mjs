import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile),source=fileURLToPath(new URL('../../',import.meta.url));
test('fresh checkout packages official pinned runtime and license; bad download preserves previous package',{skip:process.platform!=='darwin'||process.arch!=='arm64',timeout:180000},async t=>{
 const parent=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'clear-package-')),root=join(parent,'repo');t.after(()=>fs.rm(parent,{recursive:true,force:true}));
 await exec('git',['clone','--no-local',source,root]);
 // Include current source edits before the first development commit too.
 await fs.cp(join(source,'src/mac-collector'),join(root,'src/mac-collector'),{recursive:true});
 for(const path of ['tools/package-mac-collector.mjs','docs/current/MAC_TOOL_GUIDE.ko.md'])await fs.copyFile(join(source,path),join(root,path));
 await assert.rejects(fs.stat(join(root,'.toolchain')),{code:'ENOENT'});
 const build=await exec(process.execPath,['tools/package-mac-collector.mjs'],{cwd:root,timeout:150000});assert.match(build.stdout,/"liveCollection":false/);
 const base=join(root,'artifacts/mac-collector'),zip=join(base,'CLEAR-Mac-Storage-Preview.zip'),before=await fs.readFile(zip);
 const unpacked=join(parent,'unpacked');await exec('/usr/bin/ditto',['-x','-k',zip,unpacked]);
 const dest=join(unpacked,'CLEAR-Mac-Storage-Preview'),manifest=JSON.parse(await fs.readFile(join(dest,'MANIFEST.json'),'utf8'));
 assert.equal(manifest.node,'24.21.0');assert.equal(manifest.platform,'darwin-arm64');assert.match(await fs.readFile(join(dest,'runtime/NODE-LICENSE.txt'),'utf8'),/Node.js/);
 assert.equal(typeof manifest.files['src/recovery-diagnostics.mjs'],'string');
 const {createHash}=await import('node:crypto');
 for(const [path,hash] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await fs.readFile(join(dest,path))).digest('hex'),hash);
 const testRoot=join(parent,'app');await fs.mkdir(testRoot,{mode:0o700});
 const run=await exec(join(dest,'runtime/node'),[join(dest,'src/launch.mjs')],{env:{...process.env,CLEAR_TEST_ROOT:testRoot},timeout:30000});assert.match(run.stdout,/"profilesDeleted":true/);
 for(const fault of ['globalThis.fetch=async()=>{throw new Error("SYNTHETIC_OFFLINE")}', 'globalThis.fetch=async()=>new Response("SYNTHETIC_BAD_ARCHIVE")']){
  await assert.rejects(exec(process.execPath,['--import',`data:text/javascript,${encodeURIComponent(fault)}`,'tools/package-mac-collector.mjs'],{cwd:root}));
  assert.deepEqual(await fs.readFile(zip),before);assert.deepEqual((await fs.readdir(base)).filter(n=>n.startsWith('.build-')),[]);
 }
});
