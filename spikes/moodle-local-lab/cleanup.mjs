import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createLocalMoodleClient} from '../../src/learning-evidence/moodle-mvp/local-http.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),args=['compose','-f',root+'spikes/moodle-local-lab/compose.yml'];
const docker=(...more)=>execFileSync('docker',[...args,...more],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const fixture=JSON.parse(docker('exec','-T','web','cat','/var/moodledata/local-api-fixture.json'));
const report=JSON.parse(docker('exec','-T','web','php','/lab-scripts/cleanup.php'));assert.equal(report.status,'PASS');
const client=createLocalMoodleClient({baseUrl:'http://127.0.0.1:18765',courseId:fixture.courseid,tokenProvider:()=>fixture.tokens.one});
try {await assert.rejects(client.identity(),e=>['LOCAL_AUTH_REJECTED','LOCAL_ACCESS_REJECTED'].includes(e.message));}
finally{await client.close();}
report.revokedTokenActuallyRejected=true;
docker('stop');
assert.equal(execFileSync('docker',['ps','--filter','label=com.docker.compose.project=clear-moodle-local-api40','--format','{{.ID}}'],{encoding:'utf8'}).trim(),'');
report.ownContainersStopped=true;report.volumesPreserved=true;report.kind='ACTUAL_LOCAL_LAB_CLEANUP';
await writeFile(root+'var/moodle-local-api/cleanup-report.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(report));
