import { join } from 'node:path';
import { recoveryStep } from './recovery-diagnostics.mjs';
export const chromePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Chrome cannot execute until its process-group record has been closed on disk.
// If the parent dies first, EOF makes this gate exit without launching Chrome.
export const gateScript='IFS= read -r gate && [ "$gate" = launch ] || exit 0; exec "$@"';
export const gatePrefix=`/bin/sh -c ${gateScript} clear-chrome-gate ${chromePath} `;
const check=(ok,code)=>{if(!ok)throw new Error(code);};
export function parseProcesses(stdout) {
  return stdout.split('\n').filter(line=>line.trim()).map(line=>{
    const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    check(m,'BROWSER_PROCESS_CHECK_FAILED');
    return {pid:Number(m[1]),pgid:Number(m[2]),uid:Number(m[3]),state:m[4],command:m[5]};
  }).filter(p=>!p.state.startsWith('Z'));
}
export function usesProfile(command,path) {
  const flag=`--user-data-dir=${join(path,'profile')}`;
  const at=command.indexOf(flag);
  return at>=0 && (at===0 || /\s/.test(command[at-1])) && (at+flag.length===command.length || /^ --[a-zA-Z]/.test(command.slice(at+flag.length)));
}
export function browserRecovery({readProcesses,signalGroup,wait,uid}) {
  const processes=()=>recoveryStep('BROWSER_PROCESS_QUERY','PROCESS_TABLE',readProcesses);
  const validate=(path,members)=>{
    for(const m of members) {
      check(m.uid===uid,'BROWSER_OWNER_MISMATCH');
      check(m.command.startsWith(chromePath+' ') || m.command.startsWith('/Applications/Google Chrome.app/Contents/Frameworks/') || m.command.startsWith(gatePrefix),'BROWSER_EXECUTABLE_MISMATCH');
      check(usesProfile(m.command,path),'BROWSER_PROFILE_MISMATCH');
    }
  };
  const group=async pid=>(await processes()).filter(p=>p.pgid===pid);
  const verified=async(path,pid)=>{
    for(let i=0;i<20;i++){
      const members=await group(pid);
      try {validate(path,members);return members;}
      catch(e){if(i===19)throw e;await wait(50);}
    }
  };
  const stopGroup=async(path,pid)=>{
    check(Number.isSafeInteger(pid)&&pid>1,'INVALID_BROWSER_PID');
    if(!(await verified(path,pid)).length)return;
    for(const signal of ['SIGTERM','SIGKILL']){
      // Revalidate before every signal, including escalation after PID reuse.
      if(!(await verified(path,pid)).length)return;
      try{await recoveryStep(signal==='SIGTERM'?'BROWSER_SIGNAL_TERM':'BROWSER_SIGNAL_KILL','BROWSER_GROUP',()=>signalGroup(pid,signal));}catch(e){if(e.code!=='ESRCH')throw e;}
      for(let i=0;i<40;i++){if(!(await group(pid)).length)return;await wait(50);}
    }
    throw new Error('BROWSER_STILL_RUNNING');
  };
  const recover=async(path,recordedPid)=>{
    if(recordedPid!==undefined)await stopGroup(path,recordedPid);
    // Old builds could launch Chrome before writing any record. Search only for
    // this exact session profile; validate the whole group before signalling.
    for(let i=0;i<20;i++){
      const matches=(await processes()).filter(p=>usesProfile(p.command,path));
      if(!matches.length)return;
      for(const pid of new Set(matches.map(p=>p.pgid)))await stopGroup(path,pid);
    }
    throw new Error('BROWSER_STILL_RUNNING');
  };
  return {stopGroup,recover};
}
