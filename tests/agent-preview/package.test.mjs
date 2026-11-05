import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,copyFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('tarball installs offline in clean directory and standalone example executes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'clear-preview-install-'));
 try {
  const npm=(args,cwd=dir)=>execFileSync('npm',args,{cwd,encoding:'utf8',env:{...process.env,npm_config_cache:join(dir,'cache'),npm_config_offline:'true',npm_config_ignore_scripts:'true',npm_config_audit:'false',npm_config_fund:'false'}});
  const pack=JSON.parse(npm(['pack',resolve(root,'packages/clear-core'),'--json','--pack-destination',dir]))[0];
  assert.ok(pack.files.every(f=>f.path==='package.json'||f.path==='README.md'||f.path.startsWith('src/')));
  const clean=join(dir,'clean');mkdirSync(clean);writeFileSync(join(clean,'package.json'),JSON.stringify({private:true,type:'module'}));
  npm(['install','--offline','--ignore-scripts','--no-audit','--no-fund',join(dir,pack.filename)],clean);
  copyFileSync(join(root,'examples/clear-core/demo.mjs'),join(clean,'demo.mjs'));
  const output=execFileSync(process.execPath,['--import',join(root,'tests/agent-preview/network-block.mjs'),'demo.mjs'],{cwd:clean,encoding:'utf8'});
  const result=JSON.parse(output);assert.equal(result.observations.length,4);assert.equal(result.executionMode,'PUBLIC_SYNTHETIC');assert.equal(result.paymentAllowed,false);
  execFileSync(process.execPath,['--input-type=module','-e',`
   import assert from 'node:assert/strict';
   import {structureSynthetic,buildPlan,validatePlan,executePublicDemo,reviewModelProposal} from '@clear/preview-core';
   const d=structureSynthetic('Moodle 활동 완료'),p=structuredClone(buildPlan(d));
   p.steps.paymentAllowed=true;p.steps[0].dependsOn.external='outside';
   assert.equal(validatePlan(p,d).ok,false);assert.throws(()=>executePublicDemo(p,d),/DTO_JSON/);
   const original=structureSynthetic('Moodle 활동 완료'),valid=buildPlan(original),bad=structuredClone(original);
   bad.conditions[0].url=undefined;assert.equal(validatePlan(valid,bad).ok,false);
   const source='강의를 안 들어도 됩니다';
   const rows=[{quote:source,start:0,end:source.length,status:'SUPPORTED',capability:'MOODLE_ACTIVITY_COMPLETION.1',question:null}];
   const proposed=reviewModelProposal(source,rows);
   assert.equal(proposed.version,'clear-preview-model-draft.2');
   assert.deepEqual(proposed.modelRows,rows);
   assert.throws(()=>buildPlan(reviewModelProposal(source,rows,proposed.proposalHash)),/DRAFT_NOT_READY/);
  `],{cwd:clean,encoding:'utf8'});
  assert.equal(JSON.parse(readFileSync(join(clean,'node_modules/@clear/preview-core/package.json'))).dependencies,undefined);
  assert.equal(JSON.parse(readFileSync(join(clean,'node_modules/@clear/preview-core/package.json'))).version,'0.1.2');
 } finally {rmSync(dir,{recursive:true,force:true});}
});
