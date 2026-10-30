// Fresh immutable output; never overwrites the active onboarding bundle.
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs';
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
await build({absWorkingDir:root,entryPoints:{onboarding:'src/embedded-wallet/onboarding.jsx',operator:'src/embedded-wallet/operator.jsx'},outdir,
 bundle:true,splitting:true,format:'esm',platform:'browser',target:['chrome120'],minify:true,sourcemap:false,legalComments:'external',
 define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
copyFileSync(root+'src/embedded-wallet/style.css',outdir+'/style.css');
writeFileSync(directory+'/index.html','<!doctype html><html lang="ko"><meta charset="utf-8"><title>CLEAR 로컬 TEST</title><h1>CLEAR 로컬 TEST</h1><p>제품 호스트가 활성화된 후 역할별 화면에서 진행하세요.</p><a href="/onboarding">참가자 신청</a> · <a href="/operator">운영자 승인</a></html>');
writeFileSync(directory+'/clear-wallet-app.html',`<meta name="clear-wallet-app" content="${appId}">\n`);
const assets=loadPublicAssets(directory);
console.log(JSON.stringify({directory,assetCount:assets.size,assetSha256:assetSnapshot(directory),productActivated:false}));
