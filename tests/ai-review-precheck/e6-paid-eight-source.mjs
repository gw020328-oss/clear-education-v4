import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {developerTransport} from '../../src/ai-policy/gemini-evaluation.mjs';
import {EXISTING_PAID_KEY_SOURCE,PAID_EIGHT_MODEL} from './e6-paid-eight-plan.mjs';
export const PAID_EIGHT_APPROVAL_DIRECTORY=fileURLToPath(new URL('../../private/e6-python-paid-eight-v1/',import.meta.url));
// Explicit reviewed source, not an env search or fallback. The closure is lazy;
// construction/import never checks existence or reads any environment value.
export function createExistingPaidEightTransport(scope,{readExistingKey=()=>process.env.GEMINI_API_KEY,fetchImpl=globalThis.fetch}={}){
  return {execution:'ACTUAL',async request(model,method,body,signal){
    if(scope?.keySourceId!==EXISTING_PAID_KEY_SOURCE||model!==PAID_EIGHT_MODEL||method!=='generateContent')throw Error('E6_PAID8_KEY_SOURCE');
    if(signal?.aborted)throw Error('E6_PAID8_TIMEOUT');
    return developerTransport({keyReader:readExistingKey,fetchImpl}).request(model,method,body,signal);
  }};
}
// Approval metadata only; this does NOT open any credential or old approval.
export async function readPaidEightApproval(directory=PAID_EIGHT_APPROVAL_DIRECTORY){
  let handle;
  try{
    const dir=resolve(directory),st=await lstat(dir);
    if(!st.isDirectory()||st.isSymbolicLink()||await realpath(dir)!==dir||st.uid!==process.getuid()||(st.mode&0o077)!==0)throw Error();
    handle=await open(resolve(dir,'approval.json'),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const f=await handle.stat();if(!f.isFile()||f.nlink!==1||f.uid!==process.getuid()||(f.mode&0o777)!==0o600||f.size>16384)throw Error();
    const text=await handle.readFile('utf8');if(Buffer.byteLength(text)>16384)throw Error();return JSON.parse(text);
  }catch{throw Error('E6_PAID8_APPROVAL_FILE');}finally{if(handle)await handle.close().catch(()=>{});}
}
