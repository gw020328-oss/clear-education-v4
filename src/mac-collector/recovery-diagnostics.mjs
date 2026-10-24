// Error objects can contain profile paths, commands, cookies or stacks. Keep
// provenance out of their serialized fields and expose only fixed vocabulary.
const failures=new WeakMap();
const stages=new Set(['ROOT_VALIDATE','ROOT_LIST','SESSION_VALIDATE','SESSION_METADATA','SESSION_OWNER_IDENTITY',
  'OWNER_PROCESS_QUERY','OWNER_BOOT_QUERY','OWNER_EXISTENCE_PROBE','BROWSER_METADATA_READ','BROWSER_RECOVER',
  'BROWSER_PROCESS_QUERY','BROWSER_SIGNAL_TERM','BROWSER_SIGNAL_KILL','SESSION_DELETE']);
const resources=new Set(['ROOT_DIRECTORY_CHAIN','SESSION_DIRECTORY','SESSION_METADATA','OWNER_PROCESS',
  'BOOT_IDENTITY','BROWSER_METADATA','PROCESS_TABLE','BROWSER_GROUP','SESSION_TREE']);
const syscalls=new Set(['open','read','close','stat','lstat','scandir','unlink','rmdir','chmod','kill','spawn']);
export async function recoveryStep(stage,resource,operation){
  if(!stages.has(stage)||!resources.has(resource))throw new Error('INVALID_RECOVERY_DIAGNOSTIC');
  try{return await operation();}catch(error){
    if(error!==null&&(typeof error==='object'||typeof error==='function')&&!failures.has(error)){
      // spawn errors include the executable in syscall; never emit that suffix.
      const syscall=syscalls.has(error.syscall)?error.syscall:
        typeof error.syscall==='string'&&error.syscall.startsWith('spawn ')?'spawn':'UNREPORTED';
      failures.set(error,Object.freeze({stage,resource,syscall}));
    }
    throw error;
  }
}
export const recoveryDiagnostic=error=>failures.get(error)??null;
