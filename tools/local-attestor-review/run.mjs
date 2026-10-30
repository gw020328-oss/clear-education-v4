// Explicit public-example rehearsal, never imported by the product host.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {root,verifyPrepared} from './prepare.mjs';
if(process.argv.length!==3||process.argv[2]!=='--public-example')throw Error('PUBLIC_EXAMPLE_OPT_IN_REQUIRED');
verifyPrepared();
// No inherited credentials, .env, proxies, NODE_OPTIONS or product configuration.
const result=spawnSync(process.execPath,[fileURLToPath(new URL('./worker.mjs',import.meta.url))],{
 cwd:root,env:{PATH:'/usr/bin:/bin',LOG_LEVEL:'silent',DISABLE_BGP_CHECKS:'1'},encoding:'utf8',timeout:100000,maxBuffer:65536,
});
let report;
try{report=JSON.parse(result.stdout.trim());}catch{report={mode:'ISOLATED_LOCAL_ATTESTOR_PUBLIC_EXAMPLE',completed:false,failed:true,productAccepted:false};}
console.log(JSON.stringify(report)); // No raw stdout/stderr/proof/keys from SDK errors.
process.exitCode=result.error||result.status!==0?1:0;
