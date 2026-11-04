// Fresh immutable output; never overwrites the active onboarding bundle.
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,cpSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {loadPublicAssets} from '../../src/dev/public-assets.mjs';
import {assetSnapshot} from '../bootcamp/normal-host-config.mjs';
import {reviewedDependencies} from './reviewed-dependencies.mjs';
reviewedDependencies();
const root=fileURLToPath(new URL('../../',import.meta.url));
const {appId}=JSON.parse(readFileSync(root+'var/embedded-wallet-onboarding/settings.json'));
if(!/^[a-z0-9]{10,80}$/.test(appId??''))throw Error('EMBEDDED_APP_ID');
const require=createRequire(new URL('../../src/embedded-wallet/package.json',import.meta.url));
const {build}=require('esbuild');
mkdirSync(root+'var/embedded-wallet-products',{recursive:true,mode:0o700});
const directory=mkdtempSync(root+'var/embedded-wallet-products/product-'),outdir=directory+'/assets';
const native=process.argv.includes('--moodle-native');
if(native&&process.argv.includes('--team'))throw Error('EMBEDDED_NATIVE_BUILD_MODE');
const built=await build({absWorkingDir:root,entryPoints:{onboarding:'src/embedded-wallet/onboarding.jsx',operator:'src/embedded-wallet/operator.jsx',
 ...(native?{'moodle-native':'src/embedded-wallet/moodle-native.jsx','moodle-oauth-return':'src/embedded-wallet/moodle-oauth-return.jsx'}:{})},outdir,metafile:native,
 bundle:true,splitting:true,format:'esm',platform:'browser',target:['chrome120'],minify:true,sourcemap:false,legalComments:'external',
 define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
copyFileSync(root+'src/embedded-wallet/style.css',outdir+'/style.css');
writeFileSync(directory+'/index.html','<!doctype html><html lang="ko"><meta charset="utf-8"><title>CLEAR 로컬 TEST</title><h1>CLEAR 로컬 TEST</h1><p>제품 호스트가 활성화된 후 역할별 화면에서 진행하세요.</p><a href="/onboarding">참가자 신청</a> · <a href="/operator">운영자 승인</a></html>');
writeFileSync(directory+'/clear-wallet-app.html',`<meta name="clear-wallet-app" content="${appId}">\n`);
if(native){
 const output=new Map(Object.entries(built.metafile.outputs).map(([path,info])=>[resolve(root,path),info])),used=new Set();
 const visit=path=>{if(used.has(path))return;const info=output.get(path);if(!info)throw Error('EMBEDDED_NATIVE_ASSET_GRAPH');used.add(path);
  for(const entry of info.imports)if(!entry.external)visit(resolve(root,entry.path));
  if(info.cssBundle)visit(resolve(root,info.cssBundle));};
 for(const [path,info] of output)if(['src/embedded-wallet/moodle-native.jsx','src/embedded-wallet/moodle-oauth-return.jsx'].includes(info.entryPoint))visit(path);
 const entries=[...used].map(path=>({path:'/'+relative(directory,path),sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}))
  .sort((a,b)=>a.path.localeCompare(b.path));
 writeFileSync(directory+'/clear-moodle-native.html','<meta name="clear-moodle-native" content="1">\n');
 // Internal inventory is included in the owner's immutable asset snapshot; it is never a public document.
 writeFileSync(directory+'/clear-moodle-native-assets.html',JSON.stringify({version:1,assets:entries}));
}
if(process.argv.includes('--team')){
 await build({
  absWorkingDir:root,entryPoints:['packages/clear-core/src/index.mjs'],
  outfile:outdir+'/condition-preview.js',bundle:true,format:'esm',platform:'browser',
  target:['chrome120'],minify:true,legalComments:'external',
  alias:{'node:crypto':'./tools/embedded-wallet/preview-browser-crypto.mjs'},
 });
 mkdirSync(directory+'/team',{mode:0o700});
 for(const name of ['src','fonts','styles.css'])cpSync(root+'web/'+name,directory+'/team/'+name,{recursive:true});
 const html=readFileSync(root+'web/index.html','utf8').replace('./src/main.js','./src/bootcamp/team-entry.js').replace('<main id="main"','<main hidden id="main"');
 writeFileSync(directory+'/team/index.html',html);
 writeFileSync(directory+'/clear-team-app.html','<meta name="clear-team-app" content="1">\n');
 copyFileSync(root+'tools/bootcamp/test-client/driver.js',directory+'/team-driver.js');
 copyFileSync(root+'tools/bootcamp/test-client/review-window.js',directory+'/review-window.js');
 copyFileSync(root+'tools/bootcamp/test-client/review-window.js',directory+'/team-review-window.js');
}
const assets=loadPublicAssets(directory);
console.log(JSON.stringify({directory,assetCount:assets.size,assetSha256:assetSnapshot(directory),productActivated:false}));
