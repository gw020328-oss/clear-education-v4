// Offline preparation from an explicitly supplied, pinned official source archive.
import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
export const root=realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
export const area=join(root,'var/local-attestor-isolated');
export const source=join(area,'reclaimprotocol-attestor-core-bc36dac');
export const plan=JSON.parse(readFileSync(new URL('./source.json',import.meta.url)));
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function loopbackPatch(text){
 if(sha(text)!==plan.sourceListenerSha256||text.split('http.listen(port)').length!==2)throw Error('LOCAL_LISTENER_SOURCE');
 return text.replace('http.listen(port)',"http.listen(port, '127.0.0.1')");
}
export function verifyPrepared(){
 const record=JSON.parse(readFileSync(join(area,'prepared.json'))),pinned=JSON.parse(readFileSync(new URL('./build-pins.json',import.meta.url)));
 if(record.sourcePlan!==pinned.sourcePlan||JSON.stringify(Object.entries(record.files).sort())!==JSON.stringify(Object.entries(pinned.files).sort()))throw Error('LOCAL_REVIEWED_BUILD_PIN');
 if(record.sourcePlan!==sha(readFileSync(new URL('./source.json',import.meta.url))))throw Error('LOCAL_SOURCE_PLAN');
 for(const [p,h]of Object.entries(record.files)){
  const target=resolve(root,p);
  if(!target.startsWith(root+'/')||realpathSync(target)!==target||sha(readFileSync(target))!==h)throw Error('LOCAL_PREPARED_HASH');
 }
 if(!record.files['var/local-attestor-isolated/reclaimprotocol-attestor-core-bc36dac/server-review.mjs'])throw Error('LOCAL_BUNDLE_MISSING');
 return record;
}
async function prepare(archive){
 if(sha(readFileSync(archive))!==plan.archiveSha256)throw Error('LOCAL_ARCHIVE_HASH');
 if(sha(readFileSync(join(root,'src/ybm-collector/package-lock.json')))!==plan.dependencyLockSha256)throw Error('LOCAL_DEPENDENCY_LOCK');
 if(existsSync(area))throw Error('LOCAL_AREA_EXISTS'); // Never reuse a previous run/store silently.
 const entries=execFileSync('tar',['-tzf',archive],{encoding:'utf8',maxBuffer:8*1024*1024}).trim().split('\n');
 if(entries.some(p=>!p.startsWith(plan.archiveRoot+'/')||p.split('/').includes('..')||p.startsWith('/')))throw Error('LOCAL_ARCHIVE_PATH');
 const types=execFileSync('tar',['-tvzf',archive],{encoding:'utf8',maxBuffer:8*1024*1024}).trim().split('\n');
 if(types.some(p=>!['-','d'].includes(p[0])))throw Error('LOCAL_ARCHIVE_LINK');
 mkdirSync(area,{recursive:true,mode:0o700});
 execFileSync('tar',['-xzf',archive,'-C',area]);
 symlinkSync(join(root,'src/ybm-collector/node_modules'),join(source,'node_modules'));
 const req=createRequire(join(root,'src/embedded-wallet/package.json')),{build}=req('esbuild');
 const built=await build({absWorkingDir:source,entryPoints:['src/server/create-server.ts'],outfile:join(source,'server-review.mjs'),
  bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',metafile:true,logLevel:'silent',
  plugins:[{name:'loopback-only',setup(b){b.onLoad({filter:/\/src\/server\/create-server\.ts$/},a=>({contents:loopbackPatch(readFileSync(a.path,'utf8')),loader:'ts'}));}}]});
 const paths=Object.keys(built.metafile.inputs).map(p=>resolve(source,p));
 function addTree(dir){for(const p of readdirSync(dir)){const f=join(dir,p);if(lstatSync(f).isDirectory())addTree(f);else paths.push(f);}}
 addTree(join(source,'cert'));
 paths.push(join(source,'server-review.mjs'),join(root,'src/ybm-collector/package-lock.json'));
 const files=Object.fromEntries([...new Set(paths)].sort().map(p=>[p.slice(root.length+1),sha(readFileSync(p))]));
 writeFileSync(join(area,'prepared.json'),JSON.stringify({sourcePlan:sha(readFileSync(new URL('./source.json',import.meta.url))),files},null,2)+'\n',{mode:0o600,flag:'wx'});
 verifyPrepared();console.log(JSON.stringify({prepared:true,loopbackOnly:true,sourceCommit:plan.upstreamCommit,officialTrustChanged:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4||process.argv[2]!=='--archive')throw Error('USAGE: prepare.mjs --archive <pinned-official-tarball>');
 await prepare(resolve(process.argv[3]));
}
