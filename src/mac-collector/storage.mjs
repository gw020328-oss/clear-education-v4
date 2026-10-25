import { promises as fs, constants } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { processIdentity, sameProcess, legacyWorker } from './process-identity.mjs';
import { recoveryStep } from './recovery-diagnostics.mjs';
const exec = promisify(execFile);
export const TTL = 86_400_000;
export const requireValue = (ok, code) => { if (!ok) throw new Error(code); };
export const defaultRoot = () => join(homedir(), 'Library', 'Application Support', 'CLEAR', 'collector-v4');
export async function secureDirectory(path, { create = false, privateMode = true } = {}) {
  const full = resolve(path);
  if (dirname(full) !== full) await secureDirectory(dirname(full), { privateMode: false });
  if (create) await fs.mkdir(full, { mode: 0o700 }).catch(e => { if(e.code !== 'EEXIST') throw e; });
  const s = await fs.lstat(full);
  requireValue(s.isDirectory() && !s.isSymbolicLink(), 'UNSAFE_DIRECTORY');
  if (privateMode) requireValue(s.uid === process.getuid() && (s.mode & 0o077) === 0, 'UNSAFE_PERMISSIONS');
  return full;
}
export async function prepareRoot(root = defaultRoot(), { synthetic = false } = {}) {
  requireValue(synthetic || resolve(root) === defaultRoot(), 'UNSUPPORTED_STORAGE_LOCATION');
  if (!synthetic) {
    requireValue(process.platform === 'darwin' && process.arch === 'arm64', 'MAC_ARM64_REQUIRED');
    const parent = dirname(root);
    await secureDirectory(parent, { create: true });
  }
  await secureDirectory(root, { create: true });
  if (!synthetic) {
    const acl = await exec('/bin/ls', ['-lde', root]);
    requireValue(!/^\s*\d+: /m.test(acl.stdout), 'UNREVIEWED_ACCESS_CONTROL');
    const { stdout } = await exec('/usr/bin/fdesetup', ['status']);
    requireValue(stdout.includes('FileVault is On.'), 'FILEVAULT_REQUIRED');
    // Only the new application directory is excluded. No global backup settings change.
    await exec('/usr/bin/tmutil', ['addexclusion', root]);
    const exclusion = await exec('/usr/bin/tmutil', ['isexcluded', root]);
    requireValue(exclusion.stdout.includes('[Excluded]'), 'BACKUP_EXCLUSION_REQUIRED');
  }
  const file = await fs.open(join(root, '.lock'), constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  try {
  const s = await file.stat();
  requireValue(s.isFile() && s.nlink === 1 && s.uid === process.getuid() && (s.mode & 0o077) === 0, 'UNSAFE_LOCK');
  } finally { await file.close(); }
  return root;
}
const sessionName = /^session-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export async function writePrivate(path, value) {
  const f = await fs.open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await f.writeFile(value); } finally { await f.close(); }
}
export async function createSession(root, now = Date.now(), ownerPid = null) {
  await secureDirectory(root);
  const path = join(root, `session-${randomUUID()}`);
  await fs.mkdir(path, { mode: 0o700 });
  try {
    for(const p of ['profile', 'cache', 'tmp', 'crash', 'downloads']) await fs.mkdir(join(path,p), { mode:0o700 });
    const ownerIdentity = ownerPid === null ? null : await processIdentity(ownerPid);
    requireValue(ownerPid === null || ownerIdentity, 'SESSION_OWNER_NOT_FOUND');
    await writePrivate(join(path,'session.json'), JSON.stringify({ version:4, createdAt:now, expiresAt:now+TTL, ownerPid, ownerIdentity }));
    return { path, createdAt:now, expiresAt:now+TTL };
  } catch(error) {
    // No browser can exist before initialization returns. Roll back partial I/O.
    await removeSession(root,path);
    throw error;
  }
}
export async function removeSession(root, path) {
  requireValue(dirname(resolve(path)) === resolve(root) && sessionName.test(path.split('/').at(-1)), 'INVALID_SESSION_PATH');
  await secureDirectory(root);
  const s = await fs.lstat(path).catch(e => { if(e.code === 'ENOENT') return null; throw e; });
  if (!s) return;
  requireValue(s.isDirectory() && !s.isSymbolicLink() && s.uid === process.getuid(), 'UNSAFE_SESSION');
  await fs.rm(path, { recursive:true, force:true });
}
export async function clearAbandoned(root, stopBrowser) {
  await recoveryStep('ROOT_VALIDATE','ROOT_DIRECTORY_CHAIN',()=>secureDirectory(root));
  let removed = 0;
  for(const name of await recoveryStep('ROOT_LIST','ROOT_DIRECTORY_CHAIN',()=>fs.readdir(root))) {
    if (!sessionName.test(name)) continue;
    const path=join(root,name);
    await recoveryStep('SESSION_VALIDATE','SESSION_DIRECTORY',()=>secureDirectory(path));
    let record;
    try {
      const metadata = await fs.open(join(path,'session.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
      try { requireValue((await metadata.stat()).size <= 4096,'INVALID_SESSION_METADATA'); record=JSON.parse(await metadata.readFile('utf8')); }
      finally { await metadata.close(); }
    } catch(e) {
      // An interrupted initialization cannot have launched Chrome before this file was complete.
      const browserRecord=await recoveryStep('SESSION_METADATA','BROWSER_METADATA',()=>fs.lstat(join(path,'browser.json')).catch(err=>{if(err.code==='ENOENT')return null;throw err;}));
      requireValue(!browserRecord&&(e.code==='ENOENT'||e instanceof SyntaxError),'INVALID_SESSION_METADATA');
      record={};
    }
    if(record.ownerPid !== null && record.ownerPid !== undefined) {
      requireValue(Number.isSafeInteger(record.ownerPid)&&record.ownerPid>1,'INVALID_SESSION_OWNER');
      const current = await recoveryStep('SESSION_OWNER_IDENTITY','OWNER_PROCESS',()=>processIdentity(record.ownerPid));
      if (record.ownerIdentity) {
        requireValue(typeof record.ownerIdentity.start === 'string' && record.ownerIdentity.start.length>0 && typeof record.ownerIdentity.boot === 'string' && record.ownerIdentity.boot.length>0 && typeof record.ownerIdentity.command === 'string' && Number.isInteger(record.ownerIdentity.uid), 'INVALID_SESSION_OWNER');
        requireValue(!sameProcess(record.ownerIdentity,current),'ACTIVE_SESSION_OWNER');
      } else {
        // Old PID-only records cannot identify a generation. Block a possible
        // collector, but never signal an unrelated process that reused its PID.
        requireValue(!legacyWorker(current),'ACTIVE_SESSION_OWNER');
      }
    }
    await recoveryStep('BROWSER_RECOVER','BROWSER_GROUP',()=>stopBrowser(path)); // Verified exit before deletion.
    await recoveryStep('SESSION_DELETE','SESSION_TREE',()=>removeSession(root,path)); removed++;
  }
  return removed;
}

// Server-side raw proof staging. No disk serialization, filename, or logger API.
// Buffers are wiped on release; GC copies, SDK strings and OS swap are not secure-erasure claims.
export class RawProofMemory {
  #items=new Map(); #timer; #now; #closed=false;
  constructor({ now=Date.now, sweepMs=1000 }={}) {
    this.#now=now;
    this.#timer=setInterval(()=>this.sweep(),sweepMs);this.#timer.unref();
  }
  put(applicationId, bytes) {
    requireValue(!this.#closed,'STAGING_CLOSED');
    requireValue(typeof applicationId === 'string' && /^[a-f0-9]{64}$/.test(applicationId),'APPLICATION_ID');
    requireValue(Buffer.isBuffer(bytes) && bytes.length>0 && bytes.length<=128*1024,'RAW_SIZE');
    requireValue(!this.#items.has(applicationId),'RAW_ALREADY_STAGED');
    requireValue(this.#items.size<16,'STAGING_FULL');
    this.#items.set(applicationId,{ bytes:Buffer.from(bytes), expiresAt:this.#now()+TTL });
  }
  async use(applicationId, fn) {
    this.sweep();const item=this.#items.get(applicationId);
    requireValue(item,'RAW_UNAVAILABLE');
    return fn(item.bytes); // Callers must never log/copy raw values to persistent storage.
  }
  release(applicationId) { const item=this.#items.get(applicationId);if(item)item.bytes.fill(0);this.#items.delete(applicationId); }
  sweep() { for(const [id,item] of this.#items) if(this.#now()>=item.expiresAt)this.release(id); }
  close() { this.#closed=true;clearInterval(this.#timer);for(const id of this.#items.keys())this.release(id); }
  get size() { this.sweep();return this.#items.size; }
}
