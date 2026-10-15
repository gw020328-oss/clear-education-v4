import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { registryForFixture, localExpectation } from './registry.mjs';
import { localDemoPolicy } from './policy.mjs';
import { createLocalMoodleClient } from '../../src/learning-evidence/moodle-mvp/local-http.mjs';
import { collectLocalMoodleFacts } from '../../src/learning-evidence/moodle-mvp/local-normalize.mjs';
import { assessLocalLabDailyLearning } from '../../src/learning-evidence/moodle-mvp/daily.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)), runtime=resolve(root,'var/moodle-local-api');
const reportName=process.env.CLEAR_LOCAL_REPORT_NAME??'local-api-report.json';
if(!/^[a-z0-9-]+\.json$/.test(reportName))throw Error('LOCAL_REPORT_NAME');
const compose=['compose','-f',resolve(root,'spikes/moodle-local-lab/compose.yml')];
const cli=(script,...args)=>execFileSync('docker',[...compose,'exec','-T','web','php','/lab-scripts/'+script,...args],{encoding:'utf8',maxBuffer:4*1024*1024});
const privateFixture=JSON.parse(execFileSync('docker',[...compose,'exec','-T','web','cat','/var/moodledata/local-api-fixture.json'],{encoding:'utf8'}));
const secrets=JSON.parse(await readFile(resolve(runtime,'secrets.json'),'utf8'));
const definition=JSON.parse(await readFile(resolve(runtime,'registry.json'),'utf8')), compiled=localDemoPolicy(definition.date);
assert.equal(compiled.policyHash,definition.policyHash,'LOCAL_POLICY_PIN');
const registry=registryForFixture(compiled,privateFixture);
const client=(label='one',options={})=>createLocalMoodleClient({baseUrl:'http://127.0.0.1:18765',courseId:privateFixture.courseid,
  tokenProvider:()=>privateFixture.tokens[label],...options});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pin=()=>JSON.parse(cli('pin.php','one'));
async function waitClock(p){const delay=p.observedAt*1000-Date.now()+20;if(delay>0)await sleep(delay);}
const now=()=>Math.floor(Date.now()/1000);
function assess(out,p,approved=false){
  assert.equal(out.status,'COLLECTED_LOCAL_LAB','LOCAL_COLLECTION_EXPECTED: '+out.reason);
  const trusted=localExpectation(registry,out.facts,p,approved);
  return assessLocalLabDailyLearning(compiled,'daily-learning',trusted,out.facts,now());
}
async function take(approved=false){const p=pin();await waitClock(p);const out=await collectLocalMoodleFacts(registry,p,client(),{now});return {p,out,daily:assess(out,p,approved)};}
const report={kind:'ACTUAL_LOCAL_MOODLE_API_SYNTHETIC_TEST_ACCOUNTS',mode:'LOCAL_LAB',startedAt:new Date().toISOString(),
  executionCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runRef:definition.runRef,
  sourceVersions:{moodle:'215f44380bdc3ccf852a3a22e34f8423ff64033a',videocheck:'67fb5233070f49653c0bd8209338c34b8fe61177'},
  transport:'LOOPBACK_HTTP_NOT_PRODUCTION_HTTPS',videoMs:30000,policy:'EXPLICIT_LOCAL_DEMO_ONE_DAY_9000BPS',
  actual90or100DayHistory:false,academyIntegration:false,humanAttentionProven:false,productEligible:false,paymentAllowed:false,cases:[]};
const add=(name,details={})=>{report.cases.push({name,status:'PASS',...details});console.log(JSON.stringify({case:name,status:'PASS'}));};
let browser,phase='initial';
try{
  const initial=await take();assert.equal(initial.out.facts.dataMode,'LOCAL_LMS_RECORD');assert.equal(initial.p.pages.length,3);
  assert.ok(initial.out.facts.records.every(r=>r.sourceRecordStatus==='NO_RECORD'));
  assert.equal(initial.daily.learningStatus,'IN_PROGRESS');add('authenticated_three_page_explicit_absence',{sourceRows:5,sourcePages:3});
  report.sourceVersions={...report.sourceVersions,...initial.p.sourceVersions};
  report.initialObservation={revision:initial.p.revision,manifestHash:initial.p.manifestHash,
    lower:initial.p.observationLowerBound,upper:initial.p.observedAt,coverageEndExclusive:initial.p.coverageEndExclusive,validUntil:initial.p.validUntil};
  assert.equal(initial.p.sourceVersions.clearapi,'2026101502');
  assert.ok(initial.p.observationLowerBound<=initial.p.observedAt);
  assert.equal(initial.p.validUntil,initial.p.observationLowerBound+300);
  assert.equal(initial.p.coverageEndExclusive,Math.min(initial.p.observationLowerBound,initial.p.periodEndExclusive));
  assert.ok(initial.p.observationLowerBound<initial.p.periodEndExclusive);add('actual_1502_observation_window_and_open_period');
  await sleep(1100);const cached=pin();assert.deepEqual(cached,initial.p);add('actual_cache_keeps_original_observation_bounds');
  const wrong=await collectLocalMoodleFacts(registry,initial.p,client('two'),{now});assert.equal(wrong.reason,'LOCAL_ACCOUNT_BINDING');add('other_account_is_not_applicant');
  const bad=await collectLocalMoodleFacts(registry,initial.p,client('one',{tokenProvider:()=> '0'.repeat(32)}),{now});assert.equal(bad.reason,'LOCAL_AUTH_REJECTED');add('invalid_token_rejected');
  const denied=await fetch('http://127.0.0.1:18765/webservice/rest/server.php',{method:'POST',body:new URLSearchParams({wstoken:privateFixture.tokens.one,
    wsfunction:'local_clearwatch_exchange',moodlewsrestformat:'json',cmid:String(privateFixture.modules.normal),operation:'begin',payload:'[]'})}).then(r=>r.json());
  assert.ok(denied.exception,'READ_TOKEN_MUST_NOT_WRITE');add('read_token_cannot_call_playback_write');
  const require=createRequire(import.meta.url);
  if(!process.env.CLEAR_PLAYWRIGHT_PATH)throw Error('PLAYWRIGHT_PATH_REQUIRED');
  const {chromium}=require(process.env.CLEAR_PLAYWRIGHT_PATH);
  browser=await chromium.launch({headless:true});const context=await browser.newContext(),page=await context.newPage();
  await page.goto('http://127.0.0.1:18765/login/index.php');await page.locator('#username').fill(privateFixture.usernames?.one??'lab-one');
  await page.locator('#password').fill(secrets.learnerPassword);await page.locator('#loginbtn').click();
  await page.waitForURL(url=>!url.pathname.includes('/login/'));
  async function open(label){await page.goto('http://127.0.0.1:18765/mod/videocheck/view.php?id='+privateFixture.modules[label]);
    await page.waitForFunction(()=>document.querySelector('[data-clear-ready="true"]')||document.querySelector('[data-clear-error="true"]'),null,{timeout:30000});await check();}
  async function check(){if(await page.locator('[data-clear-error="true"]').count())throw Error('LOCAL_TRACKER_ERROR');}
  async function finish(){await check();await page.locator('#clear-finish').click();await page.waitForFunction(()=>document.querySelector('[data-clear-finished="true"]')||document.querySelector('[data-clear-error="true"]'));await check();}
  let normalSnapshot;
  for(const label of ['double','normal','pause']){
    phase='playback-'+label;await open(label);const started=Date.now();
    await page.locator('video').evaluate(async(v,rate)=>{v.muted=true;v.playbackRate=rate;await v.play();},label==='double'?2:1);
    if(label==='pause'){
      await page.waitForFunction(()=>document.querySelector('video').currentTime>=5);await page.locator('video').evaluate(v=>v.pause());await sleep(800);
      const a=await take();await sleep(3000);const b=await take();
      const value=x=>x.out.facts.records.find(r=>r.activityId==='pause').effectiveMs;
      assert.equal(value(a),value(b));add('pause_no_effective_time_added',{pausedDeltaMs:0});
      await page.locator('video').evaluate(v=>v.play());
    }
    await page.waitForFunction(()=>document.querySelector('video').ended||document.querySelector('[data-clear-error="true"]'),null,{timeout:60000});await check();
    // Before finish, source time exists but a normal close is not fabricated.
    const prior=await take();const priorRow=prior.out.facts.records.find(r=>r.activityId===label);assert.equal(priorRow.normalCloseAcknowledged,false);
    await finish();const snapshot=await take(),r=snapshot.out.facts.records.find(r=>r.activityId===label);
    assert.equal(r.normalCloseAcknowledged,true);assert.equal(r.providerProgressBps,null);assert.equal(r.speedCompliance,'UNKNOWN');
    if(label==='double') {assert.ok(Number(r.effectiveMs)>13000&&Number(r.effectiveMs)<17000);assert.equal(snapshot.daily.creditedDates.length,0);}
    else {assert.ok(Number(r.effectiveMs)>=27000&&Number(r.effectiveMs)<=31000);assert.equal(snapshot.daily.creditedDates.length,1);}
    add('real_'+label+'_browser_db_api_facts_daily',{wallMs:Date.now()-started,effectiveMs:r.effectiveMs,mediaCoveredMs:r.mediaCoveredMs,
      normalClose:r.normalCloseAcknowledged,creditDay:r.sourceCreditDay,dailyStatus:snapshot.daily.learningStatus,creditedDays:snapshot.daily.creditedDates.length});
    if(label==='normal')normalSnapshot=snapshot;
  }
  phase='duplicates';const before=await take();await open('normal');await finish();const duplicate=await take();
  const getNormal=x=>x.out.facts.records.find(r=>r.activityId==='normal');
  assert.equal(getNormal(before).closedAtMs,getNormal(duplicate).closedAtMs);assert.equal(getNormal(before).sourceCreditDay,getNormal(duplicate).sourceCreditDay);
  assert.equal(duplicate.daily.creditedDates.length,1);add('reopen_does_not_create_new_day');
  const lost=client(),read=lost.readManifest;let first=true;
  lost.readManifest=async(...args)=>{const value=await read(...args);if(first){first=false;throw Error('TEST_DROPPED_RESPONSE');}return value;};
  const lostResult=await collectLocalMoodleFacts(registry,duplicate.p,lost,{now});assert.equal(lostResult.status,'ON_HOLD');
  const recovered=await collectLocalMoodleFacts(registry,duplicate.p,client(),{now});assert.equal(recovered.status,'COLLECTED_LOCAL_LAB');
  assert.equal(recovered.facts.snapshot.normalizedDigest,duplicate.out.facts.snapshot.normalizedDigest);add('lost_response_requery_no_credit_change');
  phase='correction';const stalePin=pin();await waitClock(stalePin);const concurrent=client(),readPage=concurrent.readPage;let changed=false;
  concurrent.readPage=async(...args)=>{const value=await readPage(...args);if(!changed){changed=true;cli('mutate.php','hide');}return value;};
  const partial=await collectLocalMoodleFacts(registry,stalePin,concurrent,{now});assert.equal(partial.status,'ON_HOLD');assert.equal(partial.facts,null);add('concurrent_correction_discards_partial_export');
  const unavailable=await take(true);assert.equal(unavailable.out.facts.records.find(r=>r.activityId==='unseen').sourceRecordStatus,'UNAVAILABLE');
  assert.equal(unavailable.daily.learningStatus,'ON_HOLD');add('unavailable_not_no_record');
  cli('mutate.php','restore');const restored=await take(true);assert.equal(restored.out.facts.records.find(r=>r.activityId==='unseen').sourceRecordStatus,'NO_RECORD');
  assert.equal(restored.daily.creditedDates.length,1);assert.notEqual(restored.p.revision,stalePin.revision);add('approved_correction_new_revision_no_duplicate_day');
  const expired=await collectLocalMoodleFacts(registry,restored.p,client(),{now:()=>restored.p.validUntil+1});assert.equal(expired.reason,'LOCAL_STALE');add('actual_snapshot_synthetic_clock_expiry');
  cli('mutate.php','expire');const expiredToken=client('two');
  // This Moodle version reports expired tokens as a generic access exception;
  // do not invent a more precise cause from an uninformative API error body.
  await assert.rejects(expiredToken.identity(),/LOCAL_(AUTH|ACCESS)_REJECTED/);await expiredToken.close();add('expired_moodle_read_token_rejected');
  phase='current-boundaries';
  const otherCourse=createLocalMoodleClient({baseUrl:'http://127.0.0.1:18765',courseId:1,tokenProvider:()=>privateFixture.tokens.one});
  try{await assert.rejects(otherCourse.identity(),/LOCAL_ACCESS_REJECTED/);}finally{await otherCourse.close();}add('actual_other_course_rejected');
  const mutationRegistry=structuredClone(registry),mutationPin=structuredClone(restored.p),mutationClient=client(),identity=mutationClient.identity;
  mutationClient.identity=async(...args)=>{const result=await identity(...args);mutationRegistry.rawBinding.applicationId='0x'+'00'.repeat(32);
    mutationPin.revision='r999999';mutationPin.manifestHash='00'.repeat(32);return result;};
  const detached=await collectLocalMoodleFacts(mutationRegistry,mutationPin,mutationClient,{now});
  assert.equal(detached.status,'COLLECTED_LOCAL_LAB');assert.equal(detached.sourceRevision,restored.p.revision);
  assert.equal(detached.facts.binding.applicationId,registry.rawBinding.applicationId);add('actual_api_async_registry_and_pin_detached');
  const cancelClient=client(),controller=new AbortController(),close=cancelClient.close;
  cancelClient.close=async()=>{await close();controller.abort();};
  const cancelled=await collectLocalMoodleFacts(registry,restored.p,cancelClient,{now,signal:controller.signal});
  assert.equal(cancelled.reason,'LOCAL_CANCELLED');assert.equal(cancelled.facts,null);add('actual_api_cleanup_cancellation_discards_facts');
  cli('mutate.php','access-expire');
  try{const deadlineClient=client();try{await assert.rejects(deadlineClient.identity(),/LOCAL_ACCESS_REJECTED/);}finally{await deadlineClient.close();}}
  finally{cli('mutate.php','access-restore');}add('actual_plugin_read_deadline_rejected_without_extension');
  report.final={sourceRows:restored.p.totalRows,sourcePages:restored.p.pages.length,sourceRevision:restored.p.revision,
    sourceManifestHash:restored.p.manifestHash,observationLowerBound:restored.p.observationLowerBound,observedAt:restored.p.observedAt,
    coverageEndExclusive:restored.p.coverageEndExclusive,validUntil:restored.p.validUntil,
    normalizedMode:restored.out.facts.dataMode,dailyMode:restored.daily.mode,dailyStatus:restored.daily.learningStatus,
    creditedDates:restored.daily.creditedDates,officialProgress:null,speedCompliance:'UNKNOWN'};
  report.status='PASS';
}catch(e){
  report.status='FAIL';report.failedPhase=phase;report.errorType=e?.name??'Error';
  let diagnostic=String(e?.stack??e);for(const value of [...Object.values(secrets),...Object.values(privateFixture.tokens)])diagnostic=diagnostic.replaceAll(value,'[REDACTED]');
  await writeFile(resolve(runtime,'run-diagnostic.txt'),diagnostic,{mode:0o600});process.exitCode=1;
}finally{
  await browser?.close();report.finishedAt=new Date().toISOString();
  await writeFile(resolve(runtime,reportName),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({status:report.status,passed:report.cases.length,failedPhase:report.failedPhase??null}));
}
