import {readFile,writeFile,mkdir,mkdtemp,rm,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
// Public official release assets retrieved over GitHub HTTPS. Release API had
// no publisher digest; these are observed-byte pins, NOT signed provenance.
export const compilerPins={
 'darwin-arm64':{asset:'nargo-aarch64-apple-darwin.tar.gz',size:11701900,archive:'7506379c9e820ca7e1ed2bab6eb646f204cbfc89f62ae9c6e0b021bb96200e89',binary:'69835f8e960f988ed509a0b73c99099fd56f14675fbaf1f7c3da6e629f75e50e'},
 'linux-x64':{asset:'nargo-x86_64-unknown-linux-gnu.tar.gz',size:14980912,archive:'6fabbfc216dc5d44e937e99e3bd0171f88542a99a8b16d04d38103e2dfb2db2d',binary:'78759c5654a79c03aedc2d5d6cdbfa61be18ebb2c1fc9ac4e8675231608ab71b'},
};
const directory=new URL('../../../.toolchain/wrapper-v2-nargo/',import.meta.url);
const binary=new URL('nargo',directory);
function pin(){const p=compilerPins[process.platform+'-'+process.arch];if(!p)throw Error('NATIVE_COMPILER_PLATFORM');return p;}
export async function checkCompiler(){if(sha(await readFile(binary))!==pin().binary)throw Error('NATIVE_COMPILER_HASH');}
export async function prepareCompiler(){
 const p=pin();await mkdir(directory,{recursive:true});
 const response=await fetch('https://github.com/noir-lang/noir/releases/download/v1.0.0-beta.3/'+p.asset,{signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error('NATIVE_COMPILER_DOWNLOAD');const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length!==p.size||sha(bytes)!==p.archive)throw Error('NATIVE_COMPILER_ARCHIVE_HASH');
 const archive=new URL('nargo.tar.gz',directory);await writeFile(archive,bytes);
 await exec('/usr/bin/tar',['-xzf',fileURLToPath(archive),'-C',fileURLToPath(directory),'nargo'],{timeout:30000});await checkCompiler();
}
export async function nativeProgram(){
 await checkCompiler();
 const work=await mkdtemp(fileURLToPath(new URL('build-',directory)));
 try{
  await mkdir(work+'/src');await copyFile(new URL('./circuit/src/main.nr',import.meta.url),work+'/src/main.nr');
  // beta.3 native rejects prerelease compiler_version requirements. The exact
  // executable hash above pins it instead; no fallback to the system compiler.
  await writeFile(work+'/Nargo.toml','[package]\nname="bounded_private_table"\ntype="bin"\nauthors=["CLEAR research"]\n[dependencies]\n');
  await exec(fileURLToPath(binary),['compile','--program-dir',work],{timeout:300000,maxBuffer:1024*1024,env:{PATH:'/usr/bin:/bin'}});
  return JSON.parse(await readFile(work+'/target/bounded_private_table.json'));
 }finally{await rm(work,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await prepareCompiler();console.log('PUBLIC_NATIVE_COMPILER_PINNED');}
