// Synthetic-only staging prototype. Production raw proof API is intentionally absent.
import { promises as fs, constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
const requireValue = (v,code) => {if(!v) throw new Error(code);};
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export async function inspectStorageBoundary(root) {
  const result={platform:process.platform,tmpfs:false,swapDisabled:false,mountNoswap:false,cgroupSwapDisabled:false,coreDisabled:false,symlinkFree:false,privateMode:false,liveCaptureAllowed:false};
  const info=await fs.lstat(root);result.symlinkFree=!info.isSymbolicLink() && await fs.realpath(root) === resolve(root);
  result.privateMode=(info.mode & 0o777)===0o700;
  const stats=await fs.statfs(root);result.tmpfs=Number(stats.type)===0x01021994;
  if(process.platform==='linux') {
    result.swapDisabled=(await fs.readFile('/proc/swaps','utf8')).trim().split('\n').length===1;
    const mounts=(await fs.readFile('/proc/self/mountinfo','utf8')).split('\n');
    const mount=mounts.find(line=>line.split(' ')[4]===resolve(root));
    result.mountNoswap=!!mount && mount.split(' - ')[1]?.split(' ')[2]?.split(',').includes('noswap')===true;
    try {result.cgroupSwapDisabled=(await fs.readFile('/sys/fs/cgroup/memory.swap.max','utf8')).trim()==='0';}catch {}
    const line=(await fs.readFile('/proc/self/limits','utf8')).split('\n').find(s=>s.startsWith('Max core file size'));
    result.coreDisabled=/^Max core file size\s+0\s+0\s+bytes/.test(line??'');
  }
  result.syntheticKernelBoundaryPassed=result.tmpfs && (result.swapDisabled || (result.mountNoswap && result.cgroupSwapDisabled)) && result.coreDisabled && result.symlinkFree && result.privateMode;
  return result; // Host VM swap, browser cache/crash paths and backups are NOT attested here.
}
export function decodeSyntheticEnvelope(bytes) {
  requireValue(Buffer.isBuffer(bytes) && bytes.length<=4096,'INVALID_ENVELOPE');
  let p;try {p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch {throw new Error('INVALID_ENVELOPE');}
  // Requiring our exact encoding rejects duplicate keys without normalizing an untrusted document.
  requireValue(JSON.stringify(p)===bytes.toString('utf8'),'INVALID_ENVELOPE');
  requireValue(p && Object.keys(p).sort().join(',')==='applicationId,mode,proofs','INVALID_ENVELOPE');
  requireValue(p.mode==='SYNTHETIC' && uuid.test(p.applicationId) && Array.isArray(p.proofs) && p.proofs.length===2,'INVALID_ENVELOPE');
  for(const [i,proof] of p.proofs.entries()) {
    requireValue(proof && Object.keys(proof).sort().join(',')==='role,value','INVALID_ENVELOPE');
    requireValue(proof.role===['registration','score'][i] && proof.value==='SYNTHETIC_PROOF_CANARY','INVALID_ENVELOPE');
  }
  return p;
}
export class SyntheticStaging {
  #root;#clock;#ttl;
  constructor(root,{clock=Date.now,ttlMs=86400000}={}) {this.#root=root;this.#clock=clock;this.#ttl=ttlMs;requireValue(ttlMs>0&&ttlMs<=86400000,'TTL');}
  async init() {
    const s=await inspectStorageBoundary(this.#root);
    requireValue(s.symlinkFree&&s.privateMode,'STORAGE_BOUNDARY');
    // Synthetic disk fixtures are allowed for local lifecycle tests only.
    return s;
  }
  async accept(bytes) {
    const p=decodeSyntheticEnvelope(bytes),hash=createHash('sha256').update(bytes).digest('hex');
    const path=join(this.#root,p.applicationId+'.json');
    const record={createdAt:this.#clock(),hash,envelope:p};
    let handle;
    try {
      handle=await fs.open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      await handle.writeFile(JSON.stringify(record));
    } catch(e) {
      if(e.code!=='EEXIST') throw new Error('STORAGE_UNAVAILABLE');
      const old=await this.#read(p.applicationId);
      requireValue(old && this.#clock()<old.createdAt+this.#ttl,'EXPIRED');
      requireValue(old.hash===hash,'CONFLICT');
      return {id:p.applicationId,status:'EXISTING_SYNTHETIC',createdAt:old.createdAt};
    } finally {await handle?.close();}
    return {id:p.applicationId,status:'STAGED_SYNTHETIC',createdAt:record.createdAt};
  }
  async #read(id) {
    requireValue(uuid.test(id),'INVALID_ID');let h;
    try {h=await fs.open(join(this.#root,id+'.json'),constants.O_RDONLY|constants.O_NOFOLLOW);return JSON.parse(await h.readFile('utf8'));}
    catch(e) {if(e.code==='ENOENT') return null;throw new Error('STORAGE_UNAVAILABLE');}finally{await h?.close();}
  }
  async remove(id) {requireValue(uuid.test(id),'INVALID_ID');await fs.rm(join(this.#root,id+'.json'),{force:true});}
  async sweep() {
    let removed=0;
    for(const file of await fs.readdir(this.#root)) {
      const id=file.replace(/\.json$/,'');
      if(!uuid.test(id)) continue;
      let rec;try{rec=await this.#read(id);}catch{throw new Error('STORAGE_UNAVAILABLE');}
      if(rec && this.#clock()>=rec.createdAt+this.#ttl) {await this.remove(id);removed++;}
    }
    return removed;
  }
  async listIds() {return (await fs.readdir(this.#root)).filter(n=>uuid.test(n.replace(/\.json$/,''))).map(n=>n.slice(0,-5)).sort();}
}
export const syntheticPacket = (id=randomUUID()) => Buffer.from(JSON.stringify({mode:'SYNTHETIC',applicationId:id,proofs:[{role:'registration',value:'SYNTHETIC_PROOF_CANARY'},{role:'score',value:'SYNTHETIC_PROOF_CANARY'}]}));
