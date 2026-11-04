import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openPrivateDb} from '../../src/product-workflow/private-db.mjs';
function fixture(t){const directory=realpathSync(mkdtempSync(join(tmpdir(),'clear-db-hooks-')));
 const file=openPrivateDb(directory,'fixture.sqlite',{synthetic:true},'CREATE TABLE IF NOT EXISTS effects(id INTEGER PRIMARY KEY);',['effects']);
 t.after(()=>{file.close();rmSync(directory,{recursive:true,force:true});});return file;}
test('optional hooks enclose actual outer COMMIT, preserving single argument calls',t=>{
 const f=fixture(t),stages=[];f.transaction(()=>f.db.prepare('INSERT INTO effects VALUES(1)').run());
 const value=f.transaction(()=>{f.db.exec('SAVEPOINT command');f.db.prepare('INSERT INTO effects VALUES(2)').run();f.db.exec('RELEASE command');return {value:'ok'};},{
  beforeCommit:r=>{assert.equal(f.db.isTransaction,true);assert.equal(r.value,'ok');stages.push('before');},
  afterCommit:r=>{assert.equal(f.db.isTransaction,false);assert.equal(r.value,'ok');stages.push('after');}});
 assert.deepEqual(value,{value:'ok'});assert.deepEqual(stages,['before','after']);
});
test('a failing final fence rolls back even after savepoint RELEASE',t=>{
 const f=fixture(t);let after=false;
 assert.throws(()=>f.transaction(()=>{f.db.exec('SAVEPOINT command; INSERT INTO effects VALUES(1); RELEASE command');return {value:1};},
  {beforeCommit(){throw Error('EXPIRED');},afterCommit(){after=true;}}),/EXPIRED/);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM effects').get().n,0);assert.equal(after,false);
});
test('COMMIT failure never calls afterCommit and rolls back',t=>{
 const f=fixture(t);f.db.exec('CREATE TABLE child(parent INTEGER REFERENCES effects(id) DEFERRABLE INITIALLY DEFERRED)');let after=false;
 assert.throws(()=>f.transaction(()=>f.db.exec('INSERT INTO child VALUES(99)'),{afterCommit(){after=true;}}),/FOREIGN KEY/);
 assert.equal(after,false);assert.equal(f.db.prepare('SELECT count(*) AS n FROM child').get().n,0);
});
test('afterCommit failure remains a committed result and never attempts rollback',t=>{
 const f=fixture(t);assert.throws(()=>f.transaction(()=>f.db.exec('INSERT INTO effects VALUES(1)'),{afterCommit(){throw Error('AFTER_FAILED');}}),/AFTER_FAILED/);
 assert.equal(f.db.isTransaction,false);assert.equal(f.db.prepare('SELECT count(*) AS n FROM effects').get().n,1);
});
test('Promise hooks are rejected, before rolls back and after remains committed',t=>{
 const f=fixture(t);
 assert.throws(()=>f.transaction(()=>f.db.exec('INSERT INTO effects VALUES(1)'),{beforeCommit:()=>Promise.resolve()}),/ASYNC_HOOK/);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM effects').get().n,0);
 assert.throws(()=>f.transaction(()=>f.db.exec('INSERT INTO effects VALUES(2)'),{afterCommit:()=>Promise.resolve()}),/ASYNC_HOOK/);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM effects').get().n,1);
});
test('rejected Promise hooks are observed without unhandled rejection or rollback after COMMIT',async t=>{
 const f=fixture(t),unhandled=[],listener=e=>unhandled.push(e.message);process.on('unhandledRejection',listener);t.after(()=>process.off('unhandledRejection',listener));
 assert.throws(()=>f.transaction(()=>f.db.exec('INSERT INTO effects VALUES(1)'),{beforeCommit:()=>Promise.reject(Error('before rejected'))}),/ASYNC_HOOK/);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM effects').get().n,0);
 assert.throws(()=>f.transaction(()=>f.db.exec('INSERT INTO effects VALUES(2)'),{afterCommit:()=>Promise.reject(Error('after rejected'))}),/ASYNC_HOOK/);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM effects').get().n,1);assert.equal(f.db.isTransaction,false);
 await new Promise(r=>setImmediate(r));assert.deepEqual(unhandled,[]);
});
