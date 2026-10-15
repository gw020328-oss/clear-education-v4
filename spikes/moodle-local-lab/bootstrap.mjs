import { mkdir, readFile, writeFile, copyFile, stat, chmod } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDemoPolicy } from './policy.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)), runtime = resolve(root, 'var/moodle-local-api');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--public-package') throw Error('EXPLICIT_PUBLIC_PACKAGE_REQUIRED');
await mkdir(runtime, { recursive: true, mode: 0o700 }); await chmod(runtime, 0o700);
const marker = resolve(runtime, 'local-instance.json');
if (await stat(marker).then(() => true, () => false)) throw Error('LAB_ALREADY_CREATED_NO_RESET');
if (await stat(resolve(runtime,'moodle/config.php')).then(() => true, () => false)) throw Error('EXISTING_MOODLE_CONFIG_NO_OVERWRITE');
if (execFileSync('docker',['ps','-a','--filter','label=com.docker.compose.project=clear-moodle-local-api40','--format','{{.ID}}'],{encoding:'utf8'}).trim()) throw Error('EXISTING_DOCKER_PROJECT_NO_REUSE');
if (execFileSync('docker',['volume','ls','--filter','label=com.docker.compose.project=clear-moodle-local-api40','--format','{{.Name}}'],{encoding:'utf8'}).trim()) throw Error('EXISTING_DOCKER_VOLUME_NO_REUSE');
const bytes = await readFile(resolve(args[1], 'tests/constant-30s.webm'));
if (createHash('sha256').update(bytes).digest('hex') !== 'fce0617c5c8279f0483dff43006b465d8e277001a2115ac9b6bf854f28bacac6') throw Error('PUBLIC_VIDEO_PIN');
for (const [folder, commit] of [['moodle','215f44380bdc3ccf852a3a22e34f8423ff64033a'],['videocheck','67fb5233070f49653c0bd8209338c34b8fe61177']]) {
  if (execFileSync('git', ['-C', resolve(runtime,folder), 'rev-parse','HEAD'], { encoding:'utf8' }).trim() !== commit) throw Error('LOCAL_SOURCE_PIN');
}
// Reject unrelated tracked/untracked edits in prepared runtime source trees.
if (execFileSync('git',['-C',resolve(runtime,'moodle'),'status','--porcelain'],{encoding:'utf8'}).trim()) throw Error('MOODLE_SOURCE_DIRTY');
const patch=await readFile(resolve(root,'spikes/moodle-local-lab/videocheck-clearwatch.patch'),'utf8');
const diff=execFileSync('git',['-C',resolve(runtime,'videocheck'),'diff','--no-ext-diff','--binary','HEAD'],{encoding:'utf8'});
if (diff !== patch || execFileSync('git',['-C',resolve(runtime,'videocheck'),'ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim()) throw Error('VIDEOCHECK_PATCH_MISMATCH');
const password = () => 'Aa1!' + randomBytes(24).toString('hex');
const secrets = { dbPassword: password(), adminPassword: password(), learnerPassword: password() };
await writeFile(resolve(runtime,'secrets.json'), JSON.stringify(secrets), { mode:0o600 });
await writeFile(resolve(runtime,'db.env'), 'POSTGRES_DB=moodle\nPOSTGRES_USER=moodle\nPOSTGRES_PASSWORD='+secrets.dbPassword+'\n', { mode:0o600 });
await copyFile(resolve(args[1],'tests/constant-30s.webm'),resolve(runtime,'constant-30s.webm'));
const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const compiled = localDemoPolicy(date), l=compiled.policy.learningRules[0], req=compiled.policy.requirements.find(r=>r.requirementId==='learning');
const instanceRef='local-api40-'+randomBytes(6).toString('hex');
await writeFile(resolve(runtime,'registry.json'),JSON.stringify({date,runRef:'run1',instanceRef,policyHash:compiled.policyHash,activityIds:l.allowedActivityIds,activitySetHash:l.activitySetHash,
  periodStart:req.period.from,periodEndExclusive:req.period.until}),{mode:0o600});
await writeFile(marker,JSON.stringify({name:'clear-moodle-local-api40',date,instanceRef}),{mode:0o600});
const config=`<?php
unset($CFG); global $CFG; $CFG=new stdClass();
$CFG->dbtype='pgsql'; $CFG->dblibrary='native'; $CFG->dbhost='db'; $CFG->dbname='moodle'; $CFG->dbuser='moodle';
$CFG->dbpass=trim(file_get_contents('/var/moodledata/lab-db-secret')); $CFG->prefix='mdl_';
$CFG->dboptions=['dbpersist'=>false,'dbport'=>5432,'dbsocket'=>'','dbcollation'=>''];
$CFG->wwwroot='http://127.0.0.1:18765'; $CFG->dataroot='/var/moodledata'; $CFG->admin='admin';
$CFG->directorypermissions=02770; $CFG->debug=0; $CFG->debugdisplay=0;
require_once(__DIR__.'/lib/setup.php');
`;
await writeFile(resolve(runtime,'moodle/config.php'),config,{mode:0o644});
const compose=['compose','-f',resolve(root,'spikes/moodle-local-lab/compose.yml')];
function run(args) {
  try { return execFileSync('docker',[...compose,...args],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}); }
  catch(e) {
    let message=String(e.stdout??'')+'\n'+String(e.stderr??'');
    for(const value of Object.values(secrets))message=message.replaceAll(value,'[REDACTED]');
    writeFileSync(resolve(runtime,'bootstrap-diagnostic.txt'),message,{mode:0o600});
    throw Error('LOCAL_BOOTSTRAP_FAILED_SEE_PRIVATE_DIAGNOSTIC');
  }
}
run(['up','-d']);
console.log('Isolated containers started. Installing fixed Moodle and local plugins.');
run(['exec','-T','web','php','/lab-scripts/install.php']);
run(['exec','-T','web','php','/lab-scripts/setup.php']);
console.log('LOCAL_LAB_READY: fresh synthetic accounts, five activities, read-only REST service.');
