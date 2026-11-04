import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {atomicPrivate,readPrivate} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
function fixture(t){const dir=realpathSync(mkdtempSync(join(tmpdir(),'clear-publish-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
test('publish hook rejects before exclusive link and replacement rename, with temp cleanup',t=>{
 const dir=fixture(t),path=join(dir,'synthetic.json');let calls=0;
 const reject=()=>{calls++;assert(readdirSync(dir).some(n=>n.startsWith('.write-')));throw Error('LEASE_EXPIRED');};
 assert.throws(()=>atomicPrivate(path,{value:1},{exclusive:true,beforePublish:reject}),/LEASE_EXPIRED/);
 assert.equal(existsSync(path),false);assert.deepEqual(readdirSync(dir),[]);
 atomicPrivate(path,{value:2},{exclusive:true});
 assert.throws(()=>atomicPrivate(path,{value:3},{beforePublish:reject}),/LEASE_EXPIRED/);
 assert.deepEqual(JSON.parse(readPrivate(path)),{value:2});assert.deepEqual(readdirSync(dir),['synthetic.json']);assert.equal(calls,2);
});
test('rejected Promise publish hook is observed and cannot publish',async t=>{
 const dir=fixture(t),path=join(dir,'synthetic.json'),unhandled=[],listener=e=>unhandled.push(e);process.on('unhandledRejection',listener);t.after(()=>process.off('unhandledRejection',listener));
 assert.throws(()=>atomicPrivate(path,{}, {exclusive:true,beforePublish:()=>Promise.reject(Error('synthetic reject'))}),/ASYNC_PUBLISH_HOOK/);
 await new Promise(r=>setImmediate(r));assert.deepEqual(unhandled,[]);assert.equal(existsSync(path),false);assert.deepEqual(readdirSync(dir),[]);
});
