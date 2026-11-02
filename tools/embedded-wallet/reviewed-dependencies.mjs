// Explicit offline install step, never an npm lifecycle hook. No fetch or code evaluation.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,existsSync,realpathSync,lstatSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const defaultRoot=fileURLToPath(new URL('../../src/embedded-wallet/',import.meta.url));
const manifestPath=fileURLToPath(new URL('./patches/zod-6699.json',import.meta.url));
const manifestHash='1b8a104fe71ba7177a0f9e96ade94b42ec6c34332cdaf55a3001ca967c9ce9d7';
const hash=v=>createHash('sha256').update(v).digest('hex');
const check=(ok,code)=>{if(!ok)throw Error(code);};
function inventory(base){
 const found=[];
 function visit(dir){
  if(!existsSync(dir))return;
  for(const name of readdirSync(dir)){
   if(name.startsWith('.'))continue;
   const entries=name.startsWith('@')?readdirSync(join(dir,name)).map(n=>join(dir,name,n)):[join(dir,name)];
   for(const p of entries){
    if(!existsSync(join(p,'package.json')))continue;
    check(realpathSync(p)===p,'SDK_SYMLINK');
    if(JSON.parse(readFileSync(join(p,'package.json'))).name==='zod')found.push(p);
    visit(join(p,'node_modules'));
   }
  }
 }
 visit(join(base,'node_modules'));return found.sort();
}
export function reviewedDependencies({sdkRoot=defaultRoot,apply=false}={}){
 const base=realpathSync(sdkRoot),bytes=readFileSync(manifestPath);check(hash(bytes)===manifestHash,'SDK_PATCH_MANIFEST');
 const manifest=JSON.parse(bytes),pkg=JSON.parse(readFileSync(join(base,'package.json')));
 check(pkg.name==='@clear/embedded-wallet','SDK_PACKAGE');
 const lock=JSON.parse(readFileSync(join(base,'package-lock.json')));
 const expected=Object.keys(lock.packages).filter(p=>p.endsWith('/zod')).map(p=>{
  check(/^node_modules\/(?:[@a-zA-Z0-9._-]+\/)*zod$/.test(p),'SDK_LOCK_PATH');return resolve(base,p);
 }).sort();
 const installed=inventory(base);check(JSON.stringify(installed)===JSON.stringify(expected)&&installed.length>0,'SDK_ZOD_INVENTORY');
 const pending=[],files=[];
 for(const dir of installed){
  const packageBytes=readFileSync(join(dir,'package.json')),version=JSON.parse(packageBytes).version;
  const plan=manifest.packages.find(p=>p.version===version);
  check(plan&&hash(packageBytes)===plan.packageJsonSha256,'SDK_ZOD_VERSION');
  for(const f of plan.files){
   const path=resolve(dir,f.path);check(path.startsWith(dir+'/')&&realpathSync(path)===path&&lstatSync(path).isFile(),'SDK_PATCH_PATH');
   const before=readFileSync(path,'utf8'),actual=hash(before);
   check(actual===f.afterSha256||(apply&&actual===f.beforeSha256),'SDK_PATCH_HASH');
   if(actual!==f.afterSha256){
    let after=before;
    for(const e of f.edits){check(e.before.length>0&&after.split(e.before).length===2,'SDK_PATCH_CONTEXT');after=after.replace(e.before,()=>e.after);}
    check(hash(after)===f.afterSha256,'SDK_PATCH_RESULT');pending.push({path,before,after});
   }
   files.push({path,sha256:f.afterSha256});
  }
 }
 // Validate the whole graph before any write. Restarting after a partial interruption is idempotent.
 for(const consumer of ['@privy-io/react-auth','@privy-io/ethereum','@privy-io/js-sdk-core']){
  const copies=Object.keys(lock.packages).filter(p=>p.endsWith('/'+consumer));check(copies.length>0,'SDK_VIEM_CONSUMER');
  for(const copy of copies){const consumerRequire=createRequire(resolve(base,copy,'package.json'));
   check(JSON.parse(readFileSync(consumerRequire.resolve('viem/package.json'))).version==='2.57.13','SDK_VIEM_VERSION');}
 }
 for(const p of pending){
  check(readFileSync(p.path,'utf8')===p.before,'SDK_PATCH_CHANGED');
  const temp=p.path+'.clear-patch-'+process.pid;writeFileSync(temp,p.after,{flag:'wx',mode:0o644});renameSync(temp,p.path);
 }
 for(const f of files)check(hash(readFileSync(f.path))===f.sha256,'SDK_PATCH_VERIFY');
 return {version:manifest.version,upstreamCommit:manifest.upstreamCommit,zodPackages:installed.length,files:files.length,appliedFiles:pending.length,
  npmVersionsUnchanged:true,viem:'2.57.13',unboundedCollectionsFixed:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);check(args.every((a,i)=>a==='--apply'||a==='--sdk-root'||i>0&&args[i-1]==='--sdk-root'),'SDK_ARGUMENT');
 const i=args.indexOf('--sdk-root');check(i<0||Boolean(args[i+1]),'SDK_ARGUMENT');
 console.log(JSON.stringify(reviewedDependencies({apply:args.includes('--apply'),sdkRoot:i<0?defaultRoot:args[i+1]})));
}
