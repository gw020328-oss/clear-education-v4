import './network-guard.mjs';
import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {probeChromeSession} from './chrome-session.mjs';
const [chrome,root,output]=process.argv.slice(2);
// Run only under the PowerShell Job Object host. Environment is an assertion,
// not a security boundary; the enclosing host owns containment and final cleanup.
if(process.platform!=='win32'||process.env.CLEAR_SYNTHETIC_JOB!=='1')throw new Error('WINDOWS_JOB_HOST_REQUIRED');
for(const name of ['profile','cache','tmp','crash'])await mkdir(join(root,name),{recursive:false});
const child=spawn(chrome,['--headless=new','--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--disable-sync','--disable-extensions','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-crash-reporter','--disable-breakpad','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND','--user-data-dir='+join(root,'profile'),'--disk-cache-dir='+join(root,'cache'),'--crash-dumps-dir='+join(root,'crash'),'about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe'],windowsHide:true,env:{...process.env,TEMP:join(root,'tmp'),TMP:join(root,'tmp')}});
const checks=await probeChromeSession(child);
await writeFile(output,JSON.stringify({schemaVersion:1,scope:'SYNTHETIC_ONLY',checks,realYbm:false},null,2)+'\n',{flag:'wx'});
process.exitCode=checks.some(x=>x.status==='FAIL')?1:0;
