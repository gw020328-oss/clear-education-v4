import { DatabaseSync } from 'node:sqlite';
import { closeSync,constants,lstatSync,mkdirSync,openSync,realpathSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { canonical,requireRule as check } from '../policy/values.mjs';
export function openPrivateDb(directory,name,environment,schema,tables){
  const root=resolve(directory);mkdirSync(root,{recursive:true,mode:0o700});const d=lstatSync(root);
  check(d.isDirectory()&&!d.isSymbolicLink()&&d.uid===process.getuid()&&(d.mode&0o777)===0o700&&realpathSync(root)===root,'WORKFLOW_DB_DIRECTORY');
  const path=join(root,name);try{closeSync(openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600));}catch(e){if(e.code!=='EEXIST')throw e;}
  const f=lstatSync(path);check(f.isFile()&&!f.isSymbolicLink()&&f.nlink===1&&f.uid===process.getuid()&&(f.mode&0o777)===0o600,'WORKFLOW_DB_FILE');
  const db=new DatabaseSync(path,{timeout:5000,allowExtension:false});
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
  try{db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;');transaction(()=>{
    const exists=db.prepare("SELECT name FROM sqlite_schema WHERE name='metadata' AND type='table'").get();
    check(exists||db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n===0,'WORKFLOW_DB_NOT_EMPTY');
    if(exists)for(const table of tables)check(db.prepare("SELECT name FROM sqlite_schema WHERE name=? AND type='table'").get(table),'WORKFLOW_DB_INCOMPLETE');
    db.exec('CREATE TABLE IF NOT EXISTS metadata(id INTEGER PRIMARY KEY CHECK(id=1),config TEXT NOT NULL) STRICT;'+schema);
    const config=canonical({schemaVersion:1,name,environment}),prior=db.prepare('SELECT config FROM metadata WHERE id=1').get();
    check(!exists||prior,'WORKFLOW_DB_INCOMPLETE');check(!prior||prior.config===config,'WORKFLOW_DB_ENVIRONMENT');
    if(!prior)db.prepare('INSERT INTO metadata VALUES(1,?)').run(config);
  });}catch(e){db.close();throw e;}
  return {db,transaction,close:()=>db.close()};
}
