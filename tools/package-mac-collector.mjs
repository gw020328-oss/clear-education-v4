import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve,join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const config=JSON.parse(await fs.readFile(join(root,'config/toolchain.json'),'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
if(process.platform!=='darwin'||process.arch!=='arm64'||process.versions.node!==config.node)throw new Error('PINNED_MAC_ARM64_NODE_REQUIRED');
const base=resolve(root,'artifacts/mac-collector');
await fs.mkdir(base,{recursive:true,mode:0o700});
const staging=await fs.mkdtemp(join(base,'.build-'));
try {
  // Fetch the pinned public distribution, not an ignored developer installation.
  // Runtime and license come from the same checksum-verified archive.
  const response=await fetch(config.runtimeDistribution.url,{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error('RUNTIME_DOWNLOAD_FAILED');
  const archive=Buffer.from(await response.arrayBuffer());
  if(digest(archive)!==config.runtimeDistribution.sha256)throw new Error('RUNTIME_CHECKSUM_MISMATCH');
  const archivePath=join(staging,'node.tar.gz');await fs.writeFile(archivePath,archive);
  execFileSync('/usr/bin/tar',['-xzf',archivePath,'-C',staging]);
  const source=join(staging,`node-v${config.node}-darwin-arm64`);
  const runtime=join(source,'bin/node');
  if(execFileSync(runtime,['-p','process.versions.node+"/"+process.platform+"/"+process.arch'],{encoding:'utf8'}).trim()!==`${config.node}/darwin/arm64`)throw new Error('RUNTIME_IDENTITY_MISMATCH');
  const dest=join(staging,'CLEAR-Mac-Storage-Preview');
  await fs.mkdir(join(dest,'runtime'),{recursive:true});await fs.mkdir(join(dest,'src'));
  for(const name of ['storage.mjs','browser-recovery.mjs','process-identity.mjs','chrome.mjs','synthetic.mjs','worker.mjs','launch.mjs'])await fs.copyFile(join(root,'src/mac-collector',name),join(dest,'src',name));
  await fs.copyFile(runtime,join(dest,'runtime/node'));await fs.chmod(join(dest,'runtime/node'),0o755);
  await fs.copyFile(join(source,'LICENSE'),join(dest,'runtime/NODE-LICENSE.txt'));
  await fs.copyFile(join(root,'docs/current/MAC_TOOL_GUIDE.ko.md'),join(dest,'사용 안내.md'));
  await fs.writeFile(join(dest,'시작.command'),'#!/bin/sh\nset -eu\numask 077\nulimit -c 0\nTASK_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nunset NODE_OPTIONS NODE_PATH CLEAR_TEST_ROOT CLEAR_LOCKED\nexec "$TASK_DIR/runtime/node" "$TASK_DIR/src/launch.mjs" --show-browser\n',{mode:0o755});
  const manifest={name:'CLEAR-Mac-Storage-Preview',scope:'SYNTHETIC_STORAGE_ONLY',liveCollection:false,platform:'darwin-arm64',node:config.node,runtimeDistribution:config.runtimeDistribution,files:{}};
  async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else{if(e.isSymbolicLink())throw new Error('NO_SYMLINKS');manifest.files[p.slice(dest.length+1)]=digest(await fs.readFile(p));}}}
  await walk(dest);await fs.writeFile(join(dest,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
  const zip=join(staging,'CLEAR-Mac-Storage-Preview.zip');execFileSync('/usr/bin/ditto',['-c','-k','--keepParent',dest,zip]);
  const sha256=digest(await fs.readFile(zip));await fs.writeFile(zip+'.sha256',sha256+'  CLEAR-Mac-Storage-Preview.zip\n');
  // All inputs and outputs are validated before replacing any prior package.
  await fs.rm(join(base,'CLEAR-Mac-Storage-Preview'),{recursive:true,force:true});
  for(const name of ['CLEAR-Mac-Storage-Preview','CLEAR-Mac-Storage-Preview.zip','CLEAR-Mac-Storage-Preview.zip.sha256'])await fs.rename(join(staging,name),join(base,name));
  console.log(JSON.stringify({zip:join(base,'CLEAR-Mac-Storage-Preview.zip'),sha256,liveCollection:false}));
} finally { await fs.rm(staging,{recursive:true,force:true}); }
