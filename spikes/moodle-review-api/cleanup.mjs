import {fileURLToPath} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
import {createReviewClient} from '../../src/review-evidence/moodle/client.mjs';
const runtime=new URL('../../var/moodle-review-api/',import.meta.url);
const marker=JSON.parse(await readFile(new URL('local-instance.json',runtime)));
if(marker.project!=='clear-moodle-review-api'||marker.port!==18766)throw Error('REVIEW_OWNERSHIP');
const f=JSON.parse(await readFile(new URL('fixture.json',runtime)));
const compose=['compose','-f',fileURLToPath(new URL('./compose.yml',import.meta.url))];
const run=args=>execFileSync('docker',[...compose,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
let state;
try{state=JSON.parse(run(['exec','-T','web','php','/lab-scripts/cleanup.php']));}catch{throw Error('REVIEW_CLEANUP_FAILED');}
if(state.tokensRemaining!==0)throw Error('REVIEW_TOKENS_REMAIN');
const client=createReviewClient({tokenProvider:()=>f.tokens.reader});let rejected=false;
try{await client.call('core_webservice_get_site_info');}catch(e){rejected=e.message==='REVIEW_AUTH';}finally{client.close();}
if(!rejected)throw Error('REVIEW_REVOKED_TOKEN_NOT_REJECTED');
run(['stop']);
await writeFile(new URL('./cleanup-report.json',import.meta.url),JSON.stringify({...state,revokedTokenRejected:true,ownedContainersStopped:true,volumesPreserved:true,otherProjectsTouched:false},null,2)+'\n');
console.log('REVIEW_CLEANUP_PASS');
