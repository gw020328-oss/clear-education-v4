import test from 'node:test';
import assert from 'node:assert/strict';
import {localDemoPolicy} from '../../spikes/moodle-local-lab/policy.mjs';
import {registryForFixture} from '../../spikes/moodle-local-lab/registry.mjs';
import {collectLocalMoodleFacts,localSourceHash} from '../../src/learning-evidence/moodle-mvp/local-normalize.mjs';

// Fabricated protocol UNIT_EXAMPLE; actual execution evidence is recorded separately.
function fixture(){
  const compiled=localDemoPolicy('2026-10-15'),l=compiled.policy.learningRules[0];
  const config={sourceBinding:{institutionId:'local-lab',providerInstanceId:'unit-example',courseId:'unit-course'},
    accounts:{'2':{sourceAccountRef:'unit-account',accountBindingId:'unit-binding',accountBindingVersion:'local-binding.1'}},
    inventoryVersion:'local-inventory.1',activities:l.allowedActivityIds.map((activityId,i)=>({activityId,lectureId:'local-'+activityId,
      activityType:activityId==='ot'?'OT':'VIDEO',cmid:i+10,sourcePolicyHash:'a'.repeat(64),durationMs:'30000'}))};
  const registry=registryForFixture(compiled,{users:{one:2},config});
  const rows=config.activities.map(a=>({...a,recordRevision:'r1',sourceStatus:'NO_RECORD'}));
  const m={profile:'clear-local-moodle.1',labOnly:true,revision:'r1',cause:'INITIAL_EXPORT',sourceVersions:registry.sourceVersions,
    sourceBinding:registry.sourceBinding,inventoryVersion:config.inventoryVersion,activitySetHash:l.activitySetHash,
    periodStart:registry.period.from,periodEndExclusive:registry.period.until,coverageStart:registry.period.from,
    coverageEndExclusive:registry.period.from+1,observedAt:registry.period.from+1,validUntil:registry.period.from+301,
    totalRows:rows.length,terminalPageId:'page-0',pages:[]};
  let closed=0;
  const client={profile:m.profile,transport:'LOOPBACK_HTTP_ONLY',identity:async()=>({labOnly:true,sourceBinding:registry.sourceBinding}),
    readManifest:async()=>structuredClone(m),readPage:async()=>({profile:m.profile,revision:m.revision,pageId:'page-0',records:structuredClone(rows)}),
    close:async()=>{closed++;}};
  const pin=()=>{
    m.pages=[{pageId:'page-0',offset:0,rowCount:rows.length,pageHash:localSourceHash('CLEAR-LOCAL-PAGE',rows)}];
    delete m.manifestHash;m.manifestHash=localSourceHash('CLEAR-LOCAL-MANIFEST',m);
    return {revision:m.revision,manifestHash:m.manifestHash};
  };
  return {registry,rows,m,client,pin,closed:()=>closed,run:()=>collectLocalMoodleFacts(registry,pin(),client,{now:()=>m.observedAt})};
}
test('authenticated explicit absence stays null and client always closes',async()=>{
  const f=fixture(),r=await f.run();assert.equal(r.status,'COLLECTED_LOCAL_LAB');assert.equal(f.closed(),1);
  assert.ok(r.facts.records.every(r=>r.sourceRecordStatus==='NO_RECORD'&&r.effectiveMs===null&&r.providerProgressBps===null&&r.speedCompliance==='UNKNOWN'));
});
for(const [name,change,reason] of [
  ['cross-account',f=>{f.client.identity=async()=>({labOnly:true,sourceBinding:{...f.registry.sourceBinding,sourceAccountRef:'other'}});},'LOCAL_ACCOUNT_BINDING'],
  ['unapproved source version',f=>{f.m.sourceVersions={...f.m.sourceVersions,clearapi:'unexpected'};},'LOCAL_SOURCE_SCOPE'],
  ['wrong record revision',f=>{f.rows[0].recordRevision='r2';},'LOCAL_ACTIVITY_BINDING'],
  ['duplicate activity',f=>{f.rows[1]=structuredClone(f.rows[0]);},'LOCAL_ACTIVITY_BINDING'],
  ['unhashed page mutation',f=>{const original=f.client.readPage;f.client.readPage=async()=>{const p=await original();p.records[0].durationMs='1';return p;};},'LOCAL_PAGE_CHAIN'],
  ['lost terminal manifest',f=>{let count=0;const original=f.client.readManifest;f.client.readManifest=async()=>{const m=await original();if(++count===2)m.revision='r2';return m;};},'LOCAL_EXPORT_CHANGED'],
])test(name+' discards partial facts and closes the client',async()=>{
  const f=fixture();change(f);const r=await f.run();assert.equal(r.status,'ON_HOLD');assert.equal(r.reason,reason);assert.equal(r.facts,null);assert.equal(f.closed(),1);
});
test('unavailable is preserved separately from no record; no time is manufactured',async()=>{
  const f=fixture();f.rows[0].sourceStatus='UNAVAILABLE';const r=await f.run();assert.equal(r.status,'COLLECTED_LOCAL_LAB');
  assert.equal(r.facts.records[0].sourceRecordStatus,'UNAVAILABLE');assert.equal(r.facts.records[0].durationMs,null);assert.equal(r.facts.records[0].effectiveMs,null);
});
test('cleanup failure holds a collected result without exposing provider text',async()=>{
  const f=fixture();f.client.close=async()=>{throw Error('SYNTHETIC_SECRET');};const r=await f.run();assert.equal(r.reason,'LOCAL_CLEANUP_FAILED');assert.equal(r.facts,null);
});
