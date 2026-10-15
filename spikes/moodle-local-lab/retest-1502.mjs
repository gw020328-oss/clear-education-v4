// Authorized opt-in real local playback; never run by CI or against an academy.
import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {localDemoPolicy} from './policy.mjs';
import {createLocalMoodleClient} from '../../src/learning-evidence/moodle-mvp/local-http.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),runtime=root+'var/moodle-local-api/';
const compose=['compose','-f',root+'spikes/moodle-local-lab/compose.yml'];
if(process.argv.slice(2).join(' ')!=='--preserve-prior-six-rows')throw Error('EXPLICIT_RETEST_SCOPE_REQUIRED');
if(await access(runtime+'retest1502-baseline.json').then(()=>true,()=>false))throw Error('RETEST_ALREADY_STARTED_NO_OVERWRITE');
const secrets=JSON.parse(await readFile(runtime+'secrets.json','utf8'));
const registry=JSON.parse(await readFile(runtime+'registry.json','utf8'));
const report={kind:'ACTUAL_LOCAL_1502_RETEST_LIFECYCLE',startedAt:new Date().toISOString(),
  executionCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),status:'FAIL',paymentAllowed:false};
const docker=(...args)=>execFileSync('docker',[...compose,...args],{encoding:'utf8',maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
const php=(script,...args)=>docker('exec','-T','web','php','/lab-scripts/'+script,...args);
let captured=false,configured=false,inputsChanged=false;
try{
  assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim(),'','COMMIT_HARNESS_BEFORE_EXECUTION');
  // Reuse only the already isolated project and its preserved volumes.
  assert.ok(docker('ps','-a','--format','{{.Name}}').includes('clear-moodle-local-api40-web-1'),'EXISTING_LAB_REQUIRED');
  docker('start','db','web');
  const before=JSON.parse(php('retest-state.php','capture'));captured=true;report.baseline=before;
  await copyFile(runtime+'registry.json',runtime+'registry.before1502.json');
  await copyFile(runtime+'secrets.json',runtime+'secrets.before1502.json');
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const compiled=localDemoPolicy(date),rule=compiled.policy.learningRules[0],period=compiled.policy.requirements.find(r=>r.requirementId==='learning').period;
  const nextSecrets={...secrets,learnerPassword:'Aa1!'+randomBytes(24).toString('hex')};
  await writeFile(runtime+'secrets.json',JSON.stringify(nextSecrets),{mode:0o600});inputsChanged=true;
  await writeFile(runtime+'registry.json',JSON.stringify({...registry,date,runRef:before.nextRun,policyHash:compiled.policyHash,
    activityIds:rule.allowedActivityIds,activitySetHash:rule.activitySetHash,periodStart:period.from,periodEndExclusive:period.until}),{mode:0o600});
  docker('exec','-T','web','php','/var/www/html/admin/cli/upgrade.php','--non-interactive');
  assert.equal(JSON.parse(php('retest-state.php','verify')).status,'PASS');report.upgradePreservedPriorRows=true;
  assert.equal(JSON.parse(php('setup.php')).configured,true);configured=true;
  // The playback child emits fixed case names only; private diagnostics stay ignored.
  execFileSync(process.execPath,[root+'spikes/moodle-local-lab/run-local.mjs'],{cwd:root,
    env:{...process.env,CLEAR_LOCAL_REPORT_NAME:'retest1502-playback-report.json'},stdio:['ignore','inherit','pipe'],timeout:240000});
  const playback=JSON.parse(await readFile(runtime+'retest1502-playback-report.json','utf8'));
  assert.equal(playback.status,'PASS');report.playbackCases=playback.cases.length;report.sourceVersions=playback.sourceVersions;
  assert.equal(JSON.parse(php('retest-state.php','verify')).status,'PASS');
  report.status='PASS';
}catch(e){
  // Never publish command output: it may contain Moodle diagnostic context.
  let diagnostic=String(e?.stack??e)+'\n'+String(e?.stderr??'');
  for(const value of Object.values(secrets))diagnostic=diagnostic.replaceAll(value,'[REDACTED]');
  await writeFile(runtime+'retest1502-lifecycle-diagnostic.txt',diagnostic,{mode:0o600});
  report.error='LOCAL_RETEST_FAILED_SEE_PRIVATE_DIAGNOSTIC';process.exitCode=1;
}finally{
  try{
    if(configured){
      const fixture=JSON.parse(docker('exec','-T','web','cat','/var/moodledata/local-api-fixture.json'));
      report.cleanup=JSON.parse(php('retest-state.php','cleanup'));
      const client=createLocalMoodleClient({baseUrl:'http://127.0.0.1:18765',courseId:fixture.courseid,tokenProvider:()=>fixture.tokens.one});
      try{await assert.rejects(client.identity(),e=>['LOCAL_AUTH_REJECTED','LOCAL_ACCESS_REJECTED'].includes(e.message));}
      finally{await client.close();}
      report.cleanup.revokedTokenActuallyRejected=true;
      docker('exec','-T','web','php','-r',"copy('/var/moodledata/local-api-fixture.json','/var/moodledata/local-api-fixture-retest1502.json'); chmod('/var/moodledata/local-api-fixture-retest1502.json',0600); copy('/var/moodledata/local-api-fixture-before1502.json','/var/moodledata/local-api-fixture.json');");
      report.cleanup.previousFixtureRestored=true;
    }else if(captured){report.cleanup={status:'NOT_CONFIGURED',manualInspectionRequired:true};report.status='FAIL';process.exitCode=1;}
  }catch{report.status='FAIL';report.cleanupError='LOCAL_RETEST_CLEANUP_FAILED';process.exitCode=1;}
  if(inputsChanged){
    await writeFile(runtime+'secrets.json',JSON.stringify(secrets),{mode:0o600});
    await writeFile(runtime+'registry.json',JSON.stringify(registry),{mode:0o600});
    report.previousRuntimeInputsRestored=true;
  }
  docker('stop');report.ownContainersStopped=docker('ps','--status','running','--format','{{.Name}}').trim()==='';
  report.volumesPreserved=true;report.finishedAt=new Date().toISOString();
  await writeFile(runtime+'retest1502-lifecycle-report.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(report));
}
