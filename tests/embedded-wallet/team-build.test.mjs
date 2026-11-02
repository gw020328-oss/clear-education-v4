// CI-only clean fixture. Never overwrites an existing app configuration/bundle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync,readFileSync,unlinkSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadPublicAssets} from '../../src/dev/public-assets.mjs';
import {assetSnapshot} from '../../tools/bootcamp/normal-host-config.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('fresh --team SDK build contains explicit team entry, fonts and guarded owner bundle',{skip:process.env.CLEAR_TEAM_BUILD_TEST!=='1',timeout:120000},()=>{
 const settings=root+'var/embedded-wallet-onboarding/settings.json';assert.equal(existsSync(settings),false,'requires a fresh CI app fixture');
 mkdirSync(root+'var/embedded-wallet-onboarding',{recursive:true,mode:0o700});writeFileSync(settings,JSON.stringify({appId:'synthetic00001'}),{mode:0o600});let dir;
 try{const report=JSON.parse(execFileSync(process.execPath,['tools/embedded-wallet/build-product.mjs','--team'],{cwd:root,encoding:'utf8'}));dir=report.directory;
  const assets=loadPublicAssets(dir);assert.equal(report.assetSha256,assetSnapshot(dir));assert.equal(report.productActivated,false);
  assert.match(assets.get('/team/index.html').body.toString(),/src\/bootcamp\/team-entry.js/);assert.match(assets.get('/team/index.html').body.toString(),/<main hidden/);
  for(const p of ['/clear-team-app.html','/team-driver.js','/review-window.js','/team-review-window.js','/team/fonts/inter-variable.woff2','/team/fonts/pretendard-std.woff2','/assets/onboarding.js','/assets/operator.js'])assert.ok(assets.has(p),p);
  assert.match(assets.get('/team/src/bootcamp/team-entry.js').body.toString(),/clearTeamRuntime/);
 }finally{unlinkSync(settings);if(dir)rmSync(dir,{recursive:true});}
});
