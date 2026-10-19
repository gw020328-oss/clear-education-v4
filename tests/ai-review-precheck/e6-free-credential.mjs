// Dedicated file slot only. No process.env / inherited paid-key fallback.
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {developerTransport} from '../../src/ai-policy/gemini-evaluation.mjs';
import {FREE_KEY_SOURCE,FREE_MODEL} from './e6-free-plan.mjs';
export const FREE_PRIVATE_DIRECTORY=fileURLToPath(new URL('../../private/e6-python-free-tier-v1/',import.meta.url));
const check=c=>{if(!c)throw Error('E6_FREE_CREDENTIAL_INVALID');};
export async function readFreeControls(directory=FREE_PRIVATE_DIRECTORY){
  let handle;
  try{
    const dir=resolve(directory),st=await lstat(dir);
    check(st.isDirectory()&&!st.isSymbolicLink()&&await realpath(dir)===dir&&st.uid===process.getuid()&&(st.mode&0o077)===0);
    const records={};
    for(const [name,file] of [['approval','approval.json'],['projectConfirmation','project-confirmation.json']]){
      handle=await open(resolve(dir,file),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const f=await handle.stat();
      check(f.isFile()&&f.nlink===1&&f.uid===process.getuid()&&(f.mode&0o777)===0o600&&f.size<=16384);
      const text=await handle.readFile('utf8');check(Buffer.byteLength(text)<=16384);records[name]=JSON.parse(text);
      await handle.close();handle=null;
    }
    return records;
  }catch{throw Error('E6_FREE_CONTROL_INVALID');}
  finally{if(handle)await handle.close().catch(()=>{});}
}
// Constructing the reader performs zero filesystem checks. Tests use a fresh
// synthetic temporary directory; the CLI never takes a user-selected path.
export function createFreeCredentialReader(directory=FREE_PRIVATE_DIRECTORY){
  return async scope=>{
    let handle;
    try{
      check(scope?.keySourceId===FREE_KEY_SOURCE&&/^[a-f0-9]{64}$/.test(scope.projectScopeSha256??''));
      const dir=resolve(directory),st=await lstat(dir);
      check(st.isDirectory()&&!st.isSymbolicLink()&&await realpath(dir)===dir&&st.uid===process.getuid()&&(st.mode&0o077)===0);
      handle=await open(resolve(dir,'credential.json'),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      const f=await handle.stat();check(f.isFile()&&f.nlink===1&&f.uid===process.getuid()&&(f.mode&0o777)===0o600&&f.size<=8192);
      const raw=await handle.readFile('utf8');check(Buffer.byteLength(raw)<=8192);const c=JSON.parse(raw);
      check(Object.keys(c).length===4&&c.version==='clear-e6-free-credential.1'&&c.keySourceId===FREE_KEY_SOURCE
        &&c.projectScopeSha256===scope.projectScopeSha256&&typeof c.apiKey==='string'&&/^[A-Za-z0-9_-]{16,256}$/.test(c.apiKey));
      return c.apiKey;
    }catch{throw Error('E6_FREE_CREDENTIAL_INVALID');}
    finally{if(handle)await handle.close().catch(()=>{});}
  };
}
export function createFreeTransport(scope,{credentialReader=createFreeCredentialReader(),fetchImpl=globalThis.fetch}={}){
  return {execution:'ACTUAL',async request(model,method,body,signal){
    check(scope?.keySourceId===FREE_KEY_SOURCE&&model===FREE_MODEL&&method==='generateContent');
    const key=await credentialReader(scope);
    if(signal?.aborted)throw Error('E6_FREE_TIMEOUT');
    // The existing fixed HTTPS transport receives only this dedicated key.
    return developerTransport({keyReader:()=>key,fetchImpl}).request(model,method,body,signal);
  }};
}
