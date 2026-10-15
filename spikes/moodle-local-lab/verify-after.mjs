import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {localDemoPolicy} from './policy.mjs';
import {registryForFixture,localExpectation} from './registry.mjs';
import {createLocalMoodleClient} from '../../src/learning-evidence/moodle-mvp/local-http.mjs';
import {collectLocalMoodleFacts} from '../../src/learning-evidence/moodle-mvp/local-normalize.mjs';
import {assessLocalLabDailyLearning} from '../../src/learning-evidence/moodle-mvp/daily.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),runtime=root+'var/moodle-local-api/';
const args=['compose','-f',root+'spikes/moodle-local-lab/compose.yml'];
const cli=(script,...more)=>execFileSync('docker',[...args,'exec','-T','web','php','/lab-scripts/'+script,...more],{encoding:'utf8'});
const f=JSON.parse(execFileSync('docker',[...args,'exec','-T','web','cat','/var/moodledata/local-api-fixture.json'],{encoding:'utf8'}));
const definition=JSON.parse(await readFile(runtime+'registry.json','utf8')),compiled=localDemoPolicy(definition.date),registry=registryForFixture(compiled,f);
const client=courseId=>createLocalMoodleClient({baseUrl:'http://127.0.0.1:18765',courseId:courseId??f.courseid,tokenProvider:()=>f.tokens.one});
const p=JSON.parse(cli('pin.php','one'));
await new Promise(r=>setTimeout(r,Math.max(0,p.observedAt*1000-Date.now()+20)));
const out=await collectLocalMoodleFacts(registry,p,client(),{now:()=>Math.floor(Date.now()/1000)});
assert.equal(out.status,'COLLECTED_LOCAL_LAB');
const daily=assessLocalLabDailyLearning(compiled,'daily-learning',localExpectation(registry,out.facts,p,true),out.facts,Math.floor(Date.now()/1000));
assert.equal(daily.mode,'LOCAL_LAB');assert.equal(daily.learningStatus,'IN_PROGRESS');assert.equal(daily.creditedDates.length,1);
const wrong=client(1);await assert.rejects(wrong.identity(),/LOCAL_ACCESS_REJECTED/);await wrong.close();
cli('mutate.php','access-expire');
try {const expired=client();await assert.rejects(expired.identity(),/LOCAL_ACCESS_REJECTED/);await expired.close();}
finally{cli('mutate.php','access-restore');}
const restored=client();await restored.identity();await restored.close();
const privateValues=[...Object.values(f.tokens),...Object.values(JSON.parse(await readFile(runtime+'secrets.json','utf8')))];
const logs=execFileSync('docker',[...args,'logs','--no-color','web'],{encoding:'utf8',maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
assert.ok(privateValues.every(v=>!logs.includes(v)));
const report={status:'PASS',kind:'ACTUAL_POST_UPGRADE_LOCAL_API_VERIFICATION',mode:'LOCAL_LAB',
  sourceVersions:p.sourceVersions,rows:p.totalRows,pages:p.pages.length,
  factsMode:out.facts.dataMode,dailyStatus:daily.learningStatus,creditedDates:daily.creditedDates,
  tests:['post-upgrade-records-preserved','actual-api-normalize-daily-current-code','wrong-course-scope-rejected','plugin-access-deadline-enforced',
    'original-deadline-restored-without-extension','test-credentials-absent-from-new-container-logs'],
  metrics:out.facts.records.filter(r=>['normal','double','pause'].includes(r.activityId)).map(r=>({activity:r.activityId,effectiveMs:r.effectiveMs,
    mediaCoveredMs:r.mediaCoveredMs,normalClose:r.normalCloseAcknowledged,creditDay:r.sourceCreditDay,providerProgressBps:r.providerProgressBps,speedCompliance:r.speedCompliance})),
  transport:'LOOPBACK_HTTP_NOT_PRODUCTION_HTTPS',productEligible:false,paymentAllowed:false,humanAttentionProven:false};
assert.ok(privateValues.every(v=>!JSON.stringify(report).includes(v)));
await writeFile(runtime+'post-upgrade-report.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:report.status,checks:report.tests.length,rows:report.rows,pages:report.pages,creditedDates:report.creditedDates}));
