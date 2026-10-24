import {readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {createBootcampMoodleClient} from '../../../src/review-evidence/moodle/bootcamp-client.mjs';
const dir=new URL('../../../var/moodle-bootcamp-p2/',import.meta.url),marker=JSON.parse(await readFile(new URL('local-instance.json',dir)));
if(marker.project!=='clear-moodle-bootcamp-p2-20261017'||marker.port!==18767)throw Error('BC_LAB_OWNERSHIP');
const f=JSON.parse(await readFile(new URL('fixture.json',dir))),compose=['compose','-f',fileURLToPath(new URL('./compose.yml',import.meta.url))];
let state;try{state=JSON.parse(execFileSync('docker',[...compose,'exec','-T','web','php','/lab-scripts/cleanup.php'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}catch{throw Error('BC_LAB_CLEANUP_FAILED');}
if(state.tokensRemaining!==0)throw Error('BC_LAB_TOKENS_REMAIN');
const client=createBootcampMoodleClient({tokenProvider:()=>f.tokens.one.read});let rejected=false;
try{await client.call('core_webservice_get_site_info');}catch(e){rejected=e.message==='REVIEW_AUTH';}finally{client.close();}
if(!rejected)throw Error('BC_LAB_TOKEN_NOT_REVOKED');
execFileSync('docker',[...compose,'stop'],{stdio:['ignore','pipe','pipe']});
await writeFile(new URL('./cleanup-report.json',import.meta.url),JSON.stringify({date:'2026-10-17',project:marker.project,finalRunRef:f.runRef,...state,revokedTokenRejected:true,ownedContainersStopped:true,newVolumesPreserved:true,oldLabsTouched:false,fixtureLiveReadable:false},null,2)+'\n');console.log('BC_P2_CLEANUP_PASS');
