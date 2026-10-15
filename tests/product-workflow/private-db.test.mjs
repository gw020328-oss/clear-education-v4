import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,realpathSync,rmSync,chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openReviewLedger } from '../../src/product-workflow/review-ledger.mjs';
const environment={instanceId:'test-instance',origin:'https://clear.example.invalid',mode:'SYNTHETIC'};
test('an unrelated existing DB with the same filename is never adopted or migrated',t=>{
 const directory=realpathSync(mkdtempSync(join(tmpdir(),'clear-db-preserve-'))),path=join(directory,'workflow.sqlite');t.after(()=>rmSync(directory,{recursive:true,force:true}));
 let db=new DatabaseSync(path);db.exec("CREATE TABLE original(record TEXT);INSERT INTO original VALUES('SYNTHETIC_PRESERVE');");db.close();chmodSync(path,0o600);
 assert.throws(()=>openReviewLedger({directory,environment}),/DB_NOT_EMPTY/);db=new DatabaseSync(path);assert.equal(db.prepare('SELECT record FROM original').get().record,'SYNTHETIC_PRESERVE');assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE name='heads'").get().n,0);db.close();
});
test('loss of an existing replay table fails startup instead of silently re-creating an empty one',t=>{
 const directory=realpathSync(mkdtempSync(join(tmpdir(),'clear-db-incomplete-'))),path=join(directory,'workflow.sqlite');t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const s=openReviewLedger({directory,environment});s.close();const db=new DatabaseSync(path);db.exec('DROP TABLE runs');db.close();
 assert.throws(()=>openReviewLedger({directory,environment}),/DB_INCOMPLETE/);
});
