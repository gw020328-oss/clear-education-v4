import test from 'node:test';
import {batchLatch} from './fixtures/hardkill-supervisor.mjs';
import {runTrial} from './fixtures/hardkill-lifecycle-runner.mjs';
const batch=batchLatch();
// Five distinct legacy regressions, not retries. A failure blocks subsequent spawns.
// The old aggregate 60 seconds becomes 60 seconds per trial; launcher stays 20 seconds.
for(const phase of ['before-record','empty-record','partial-record','after-release','legacy-missing']){
 const count=phase==='legacy-missing'?5:1;
 for(let trial=1;trial<=count;trial++)test(`SIGKILL ${phase} (${trial}/${count}): observed exit before deletion`,{skip:process.platform!=='darwin',timeout:60000,concurrency:false},t=>runTrial(t,{phase,trial,batch}));
}
