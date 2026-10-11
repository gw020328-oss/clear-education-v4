import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareRoot,secureDirectory,createSession,removeSession,clearAbandoned,RawProofMemory,TTL } from '../../src/mac-collector/storage.mjs';
async function setup(t){const parent=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'clear-managed-test-'));await fs.chmod(parent,0o700);t.after(()=>fs.rm(parent,{recursive:true,force:true}));const root=join(parent,'app');await prepareRoot(root,{synthetic:true});return {parent,root};}
test('new root and session use owner-only modes; lock persists',async t=>{
 const {root}=await setup(t);const session=await createSession(root,100);
 for(const p of [root,session.path,join(session.path,'profile'),join(session.path,'tmp')])assert.equal((await fs.stat(p)).mode&0o777,0o700);
 assert.equal((await fs.stat(join(root,'.lock'))).mode&0o777,0o600);
 assert.equal(session.expiresAt,100+TTL);await removeSession(root,session.path);
 assert.equal((await fs.readdir(root)).join(','),'.lock');
});
test('reject user-writable-by-others, root symlinks and ancestors',async t=>{
 const {root,parent}=await setup(t);await fs.chmod(root,0o755);await assert.rejects(secureDirectory(root),/UNSAFE_PERMISSIONS/);
 await fs.chmod(root,0o700);const link=join(parent,'link');await fs.symlink(root,link);await assert.rejects(secureDirectory(link),/UNSAFE_DIRECTORY/);
 await fs.mkdir(join(root,'child'));await assert.rejects(secureDirectory(join(link,'child')),/UNSAFE_DIRECTORY/);
});
test('lock file symlink rejected without touching its target',async t=>{
 const {root,parent}=await setup(t);await fs.unlink(join(root,'.lock'));const target=join(parent,'unchanged');await fs.writeFile(target,'keep');await fs.symlink(target,join(root,'.lock'));
 await assert.rejects(prepareRoot(root,{synthetic:true}));assert.equal(await fs.readFile(target,'utf8'),'keep');
});
test('startup cleans only owned session namespace, before creating any new session',async t=>{
 const {root}=await setup(t);const a=await createSession(root),b=await createSession(root);
 await fs.mkdir(join(root,'retained'));await fs.writeFile(join(root,'retained','packet'),'keep');const visited=[];
 assert.equal(await clearAbandoned(root,async p=>visited.push(p)),2);assert.deepEqual(new Set(visited),new Set([a.path,b.path]));
 assert.equal(await fs.readFile(join(root,'retained','packet'),'utf8'),'keep');
});
test('failed browser shutdown blocks deletion and subsequent collection',async t=>{
 const {root}=await setup(t);const a=await createSession(root);await assert.rejects(clearAbandoned(root,async()=>{throw new Error('STILL_RUNNING');}),/STILL_RUNNING/);assert.ok(await fs.stat(a.path));
});
test('deletion rejects traversal and session symlink; nested symlink cannot erase external target',async t=>{
 const {root,parent}=await setup(t);await assert.rejects(removeSession(root,parent),/INVALID_SESSION_PATH/);
 const a=await createSession(root);const outside=join(parent,'outside');await fs.mkdir(outside);await fs.writeFile(join(outside,'keep'),'keep');await fs.symlink(outside,join(a.path,'link'));
 await removeSession(root,a.path);assert.equal(await fs.readFile(join(outside,'keep'),'utf8'),'keep');
 await fs.symlink(outside,a.path);await assert.rejects(removeSession(root,a.path),/UNSAFE_SESSION/);
});
test('live mode cannot select arbitrary storage folder',async t=>{const {root}=await setup(t);await assert.rejects(prepareRoot(root),/UNSUPPORTED_STORAGE_LOCATION/);});
test('raw proof staging separates applications, owns buffer, deletes exactly at TTL',async()=>{
 let now=0;const store=new RawProofMemory({now:()=>now});const a='a'.repeat(64),b='b'.repeat(64);const source=Buffer.from('synthetic-original');store.put(a,source);source.fill(0);
 store.put(b,Buffer.from('other'));assert.equal(await store.use(a,v=>v.toString()),'synthetic-original');await assert.rejects(store.use('c'.repeat(64),()=>{}),/RAW_UNAVAILABLE/);
 now=TTL-1;assert.equal(store.size,2);now=TTL;assert.equal(store.size,0);store.close();
});
test('issuance and error cleanup wipe staged buffer, keeping other application',async()=>{
 const store=new RawProofMemory();const a='a'.repeat(64),b='b'.repeat(64);store.put(a,Buffer.from('synthetic'));store.put(b,Buffer.from('other'));let view;await store.use(a,v=>{view=v;});store.release(a);assert.ok(view.every(v=>v===0));assert.equal(store.size,1);store.close();assert.equal(store.size,0);
});
test('bounded staging rejects oversized, duplicate and excess records',()=>{
 const store=new RawProofMemory();assert.throws(()=>store.put('a'.repeat(64),Buffer.alloc(128*1024+1)),/RAW_SIZE/);
 assert.throws(()=>store.put('../x',Buffer.from('x')),/APPLICATION_ID/);
 for(let i=0;i<16;i++)store.put(i.toString(16).padStart(64,'0'),Buffer.from('x'));
 assert.throws(()=>store.put('0'.repeat(64),Buffer.from('x')),/RAW_ALREADY_STAGED/);assert.throws(()=>store.put('f'.repeat(64),Buffer.from('x')),/STAGING_FULL/);store.close();
});

test('startup refuses a live worker even if its external lock holder crashed',async t=>{
 const {root}=await setup(t);await createSession(root,Date.now(),process.pid);
 await assert.rejects(clearAbandoned(root,async()=>{}),/ACTIVE_SESSION_OWNER/);
});
test('closed server staging cannot accept new raw data without a retention timer',()=>{
 const store=new RawProofMemory();store.close();assert.throws(()=>store.put('a'.repeat(64),Buffer.from('x')),/STAGING_CLOSED/);
});

test('restart cleans interrupted initialization with no browser record',async t=>{
 const {root}=await setup(t);const a=await createSession(root);await fs.unlink(join(a.path,'session.json'));
 assert.equal(await clearAbandoned(root,async()=>{}),1);
 const b=await createSession(root);await fs.writeFile(join(b.path,'session.json'),'{');
 assert.equal(await clearAbandoned(root,async()=>{}),1);
});

test('reused PID with a different process start or boot never blocks stale cleanup',async t=>{
 const {root}=await setup(t);
 for(const key of ['start','boot']){
  const s=await createSession(root,Date.now()-2*TTL,process.pid);
  const path=join(s.path,'session.json'),record=JSON.parse(await fs.readFile(path,'utf8'));record.ownerIdentity[key]+='-old';
  await fs.writeFile(path,JSON.stringify(record));assert.equal(await clearAbandoned(root,async()=>{}),1);process.kill(process.pid,0);
 }
});
test('legacy PID-only record for unrelated process is cleaned without signalling it',async t=>{
 const {root}=await setup(t);const s=await createSession(root,Date.now()-2*TTL,process.pid);
 const path=join(s.path,'session.json'),record=JSON.parse(await fs.readFile(path,'utf8'));delete record.ownerIdentity;
 await fs.writeFile(path,JSON.stringify(record));assert.equal(await clearAbandoned(root,async()=>{}),1);process.kill(process.pid,0);
});
test('legacy worker identification remains conservative',async()=>{
 const {legacyWorker}=await import('../../src/mac-collector/process-identity.mjs');
 assert.equal(legacyWorker({command:'/node /some/package/src/worker.mjs --test-hold'}),true);
 assert.equal(legacyWorker({command:'/bin/sleep 100'}),false);
});
