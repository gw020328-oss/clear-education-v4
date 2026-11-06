// Offline: the approval CLI emits the exact non-secret values the CLEAR server
// owner needs (clear-operator-preview-scope.1 and the owner approval registry),
// and records a D approval only for the exact approved hashes. No network, no key.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {validateOperatorScopeConfig,OPERATOR_SCOPE_CONFIG_VERSION} from '../../../src/agent-preview/operator-scope.mjs';
import {createOwnerApprovalRegistry} from '../../../src/agent-preview/operator-owner-approval.mjs';
import {firstRunPreflight,firstRunSource} from './first-run-preflight.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'clear-approval-cli-'))),staged=join(dir,'staged');
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  execFileSync(process.execPath,[resolve(root,'deploy/agent-preview/package.mjs'),staged],{cwd:root,env:{PATH:process.env.PATH},stdio:'pipe'});
  symlinkSync(resolve(root,'node_modules'),join(staged,'node_modules'),'dir');
  const artifactHash=sha(readFileSync(join(staged,'build-manifest.json')));
  const profile=join(dir,'profile.json'),source=join(dir,'source.txt'),databasePath=join(dir,'state','approvals.sqlite');
  const config={version:'clear-external-preview-config.1',publicOrigin:'https://preview.example.invalid',port:18991,
    institutionId:'clear-demo',courseId:'2',operatorId:'2',dataMode:'DEMO_ACCOUNTS_ONLY',
    databasePath,sharedSecretFile:join(dir,'not-read-by-approval-cli'),artifactHash,
    deploymentEpoch:'0b5e8a52-3f0c-4d7e-9a61-2c8f4e1d7b30'};
  writeFileSync(profile,JSON.stringify(config));writeFileSync(source,firstRunSource);
  const cli=(args,env={})=>spawnSync(process.execPath,[join(staged,'deploy/agent-preview/approval.mjs'),...args],
    {encoding:'utf8',env:{CLEAR_PREVIEW_CONFIG:profile,...env}});
  return {dir,staged,config,profile,source,databasePath,cli};
}

test('prepare prints scope values that B accepts and records nothing',async t=>{
  const f=fixture(t),result=f.cli(['prepare',f.source]);
  assert.equal(result.status,0,result.stderr);
  const out=JSON.parse(result.stdout),pre=firstRunPreflight();
  const {bindingHash,validateConfig}=await import(pathToFileURL(join(f.staged,'deploy/agent-preview/config.mjs')));
  assert.equal(out.bodyHash,pre.bodyHash);
  assert.equal(out.bindingHash,bindingHash(validateConfig(f.config)));
  assert.deepEqual(out.scopeValues,{publicOrigin:'https://preview.example.invalid',
    dActor:{institutionId:'clear-demo',courseId:'2',operatorId:'2'},
    deployment:{artifactHash:f.config.artifactHash,deploymentEpoch:f.config.deploymentEpoch,
      bindingHash:out.bindingHash,model:'gemini-3.5-flash-lite',limitsHash:pre.limitsHash}});
  assert.equal(out.approvalRecorded,false);assert.equal(out.approvalRef,null);assert.equal(out.approvalExpiresAt,null);
  // The CLEAR server's existing validator accepts a binding built only from these values.
  const scope=validateOperatorScopeConfig({version:OPERATOR_SCOPE_CONFIG_VERSION,bindings:[{
    courseOperatorRef:'course-operator-demo',scopeRef:'course-operator-demo:preview',authorityRevision:1,
    expiresAtMs:Date.now()+3600000,dActor:out.scopeValues.dActor,deployment:out.scopeValues.deployment}]});
  assert.equal(scope.bindings[0].deployment.bindingHash,out.bindingHash);
  assert.doesNotMatch(result.stdout,/sharedSecret|not-read-by-approval-cli/);
});

test('record requires the exact approved hashes; the grant is single use and matches the owner registry',async t=>{
  const f=fixture(t),prepared=JSON.parse(f.cli(['prepare',f.source]).stdout),ref='approved_cli_test_01';
  for(const env of [{},{CLEAR_APPROVED_BODY_HASH:prepared.bodyHash},
    {CLEAR_APPROVED_BODY_HASH:prepared.bodyHash,CLEAR_APPROVED_BINDING_HASH:'a'.repeat(64)},
    {CLEAR_APPROVED_BODY_HASH:'b'.repeat(64),CLEAR_APPROVED_BINDING_HASH:prepared.bindingHash}]) {
    const rejected=f.cli(['record-approved-input',f.source,ref],env);
    assert.equal(rejected.status,1);assert.match(rejected.stderr,/PREVIEW_APPROVAL_FAILED/);assert.equal(rejected.stdout,'');
  }
  const approved={CLEAR_APPROVED_BODY_HASH:prepared.bodyHash,CLEAR_APPROVED_BINDING_HASH:prepared.bindingHash};
  const before=Date.now(),recorded=f.cli(['record-approved-input',f.source,ref],approved),after=Date.now();
  assert.equal(recorded.status,0,recorded.stderr);
  const out=JSON.parse(recorded.stdout);
  assert.equal(out.approvalRecorded,true);assert.equal(out.approvalRef,ref);
  assert.ok(out.approvalExpiresAt>=before+3600000 && out.approvalExpiresAt<=after+3600000);
  // Same ref cannot be registered twice.
  assert.equal(f.cli(['record-approved-input',f.source,ref],approved).status,1);
  // The CLEAR owner registry accepts exactly the printed values.
  createOwnerApprovalRegistry().record({bodyHash:out.bodyHash,bindingHash:out.bindingHash,approvalRef:ref,expiresAt:out.approvalExpiresAt});
  const {openStore}=await import(pathToFileURL(join(f.staged,'deploy/agent-preview/store.mjs')));
  const store=openStore(f.databasePath);t.after(()=>store.close());
  assert.throws(()=>store.consume(ref,out.bodyHash,'c'.repeat(64)),/APPROVAL_REQUIRED_OR_SPENT/);
  assert.equal(store.consume(ref,out.bodyHash,out.bindingHash).expires,out.approvalExpiresAt);
  assert.throws(()=>store.consume(ref,out.bodyHash,out.bindingHash),/APPROVAL_REQUIRED_OR_SPENT/);
});
