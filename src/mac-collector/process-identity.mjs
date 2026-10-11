import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
const exec=promisify(execFile);
export async function processIdentity(pid) {
  if(!Number.isSafeInteger(pid)||pid<=1)throw new Error('INVALID_SESSION_OWNER');
  try {
    if(process.platform==='linux') {
      const stat=await fs.readFile(`/proc/${pid}/stat`,'utf8');
      const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
      if(fields[0]==='Z')return null;
      return {start:fields[19],boot:(await fs.readFile('/proc/sys/kernel/random/boot_id','utf8')).trim(),uid:(await fs.stat(`/proc/${pid}`)).uid,command:(await fs.readFile(`/proc/${pid}/cmdline`,'utf8')).replaceAll('\0',' ')};
    }
    if(process.platform!=='darwin')throw new Error('PROCESS_IDENTITY_UNSUPPORTED');
    const {stdout}=await exec('/bin/ps',['-p',String(pid),'-o','uid=,lstart=,stat=,command='],{env:{PATH:'/usr/bin:/bin',LC_ALL:'C'}});
    const m=stdout.match(/^\s*(\d+)\s+(.{24})\s+(\S+)\s+(.+)\s*$/);
    if(!m)throw new Error('PROCESS_IDENTITY_UNAVAILABLE');
    if(m[3].startsWith('Z'))return null;
    const boot=(await exec('/usr/sbin/sysctl',['-n','kern.boottime'])).stdout.trim();
    return {uid:Number(m[1]),start:m[2],boot,command:m[4]};
  } catch(error) {
    if(error.code==='ENOENT'||error.code==='ESRCH'||error.code===1){
      try { process.kill(pid,0); } catch(check) { if(check.code==='ESRCH')return null;throw check; }
      throw new Error('PROCESS_IDENTITY_UNAVAILABLE');
    }
    throw error;
  }
}
export const sameProcess=(a,b)=>Boolean(b && a.start===b.start && a.boot===b.boot && a.uid===b.uid && a.command===b.command);
export const legacyWorker=identity=>Boolean(identity && /(?:^|[ /])worker\.mjs(?:\s|$)/.test(identity.command));
